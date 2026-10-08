import { buildingBox, parseBuildings } from './building-types';
import { OVERPASS_ENDPOINTS, OVERPASS_LOAD_TIMEOUT, requestOverpassJSON } from './overpass';
import type { CategorizedBuilding } from './types';
import { abortable, aborted } from './requests';
import { splitDataBounds, type DataCoverage } from './data-coverage';
import { pilotData } from './pilot-data';
import type { DatasetStamp } from './pilot-format';

type Bounds = { south: number; west: number; north: number; east: number };
export type BuildingData = {
  buildings: CategorizedBuilding[];
  capped: boolean;
  failedAreas: number;
  loadedAreas: number;
  totalAreas: number;
  completeAreas: number;
  emptyAreas: number;
  partialAreas: number;
  status: DataCoverage;
  source: 'osm';
  datasets?: DatasetStamp[];
};
export const MAX_FETCHED_BUILDINGS = 12_000;
const MAX_VIEW_BUILDINGS = 12_000;
const MAX_AREAS = 24;
const CACHE_TTL = 24 * 60 * 60 * 1000;
export type CachedArea = { savedAt: number; buildings: CategorizedBuilding[]; status: 'complete' | 'empty'; source: 'osm'; dataset?: DatasetStamp };
type AreaStore = { get: (key: string) => Promise<CachedArea | null>; set: (key: string, value: CachedArea) => Promise<void> };
type LoaderOptions = { mobile?: boolean; store?: AreaStore; deadline?: number; maximumDepth?: number; maximumRefinements?: number };
type AreaResult = { buildings: CategorizedBuilding[]; status: DataCoverage; capped: boolean; failedAreas: number; areaStatuses: DataCoverage[] };
type SourceResult = { buildings: CategorizedBuilding[]; capped: boolean };
type SourceJob = { areas: Bounds[]; controller: AbortController; promise: Promise<SourceResult>; subscribers: number; held: boolean };

export function buildingAreas(bounds: Bounds, mobile = false): Bounds[] {
  const areas: Bounds[] = [];
  const latitudeScale = mobile ? 200 : 100, longitudeScale = mobile ? 100 : 50;
  const south = Math.floor(bounds.south * latitudeScale), north = Math.ceil(bounds.north * latitudeScale);
  const west = Math.floor(bounds.west * longitudeScale), east = Math.ceil(bounds.east * longitudeScale);
  for (let y = south; y < north; y++) for (let x = west; x < east; x++) {
    areas.push({ south: y / latitudeScale, north: (y + 1) / latitudeScale, west: x / longitudeScale, east: (x + 1) / longitudeScale });
  }
  const latitude = (bounds.south + bounds.north) / 2;
  const longitude = (bounds.west + bounds.east) / 2;
  const scale = Math.cos(latitude * Math.PI / 180);
  const distance = (area: Bounds) => ((area.south + area.north) / 2 - latitude) ** 2
    + (((area.west + area.east) / 2 - longitude) * scale) ** 2;
  return areas.sort((a, b) => distance(a) - distance(b));
}

export function createBuildingLoader(options: LoaderOptions = {}) {
  const maximumBuildings = options.mobile ? 6_000 : MAX_VIEW_BUILDINGS;
  const store: AreaStore = options.store ?? {
    async get(key) { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } },
    async set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory remains available. */ } },
  };
  const latitudeScale = options.mobile ? 200 : 100, longitudeScale = options.mobile ? 100 : 50;
  const batchSize = options.mobile ? 2 : 4;
  const memory = new Map<string, CachedArea>();
  const inFlight = new Map<string, SourceJob>();
  let wanted: Bounds[] = [];
  const datasets = new Map<string, DatasetStamp>();
  const keyFor = (area: Bounds) => `terraszon:v5:building-cell:${[area.south, area.west, area.north, area.east].map(v => v.toFixed(6)).join(':')}`;
  const remember = (key: string, cached: CachedArea) => {
    memory.delete(key);
    memory.set(key, cached);
    let count = [...memory.values()].reduce((sum, area) => sum + area.buildings.length, 0);
    while (memory.size > MAX_AREAS || count > maximumBuildings) {
      const first = memory.keys().next().value!;
      count -= memory.get(first)!.buildings.length;
      memory.delete(first);
    }
  };
  const cachedArea = async (area: Bounds, signal: AbortSignal): Promise<CachedArea | null> => {
    const baked = await pilotData?.buildings(area, signal);
    if (baked && !baked.missing.length) {
      datasets.set(baked.dataset.revision, baked.dataset);
      return { savedAt: Date.now(), buildings: baked.records, status: baked.records.length ? 'complete' : 'empty', source: 'osm', dataset: baked.dataset };
    }
    const key = keyFor(area);
    let cached = memory.get(key);
    if (cached && (!Number.isFinite(cached.savedAt) || cached.savedAt > Date.now() || Date.now() - cached.savedAt >= (cached.status === 'empty' ? 60_000 : CACHE_TTL))) { memory.delete(key); cached = undefined; }
    if (!cached) {
      cached = await store.get(key) ?? undefined;
    }
    if (!cached || cached.source !== 'osm' || !['complete', 'empty'].includes(cached.status)
      || !Number.isFinite(cached.savedAt) || cached.savedAt > Date.now() || Date.now() - cached.savedAt >= (cached.status === 'empty' ? 60_000 : CACHE_TTL) || !Array.isArray(cached.buildings)
      || cached.buildings.length > maximumBuildings) return null;
    remember(key, cached);
    return cached;
  };

  const saveAreas = (areas: Bounds[], buildings: CategorizedBuilding[]) => {
    const boxes = buildings.map((building) => buildingBox(building.geometry));
    const statuses: DataCoverage[] = [];
    for (const area of areas) {
      const subset = areas.length === 1 ? buildings : buildings.filter((_building, index) => {
        const box = boxes[index];
        return box.east >= area.west && box.west <= area.east && box.north >= area.south && box.south <= area.north;
      });
      const key = keyFor(area), cached: CachedArea = { savedAt: Date.now(), buildings: subset,
        source: 'osm', status: subset.length ? 'complete' : 'empty' };
      statuses.push(cached.status);
      const previous = memory.get(key);
      if (previous && Date.now() - previous.savedAt < (previous.status === 'empty' ? 60_000 : CACHE_TTL)
        && previous.status === cached.status && previous.buildings.length === subset.length
        && previous.buildings.every((building, index) => building === subset[index])) continue;
      remember(key, cached);
      // Complete empty areas are remembered briefly in memory, not for 24 hours.
      if (subset.length) void store.set(key, cached).catch(() => {});
    }
    return statuses;
  };

  const loadRawArea = async (areas: Bounds[], signal: AbortSignal): Promise<SourceResult> => {
    // Batch up to four neighboring cells into one API request: many separate
    // small queries would exhaust the public instances' per-client quota.
    const envelope = { south: Math.min(...areas.map(a => a.south)), north: Math.max(...areas.map(a => a.north)),
      west: Math.min(...areas.map(a => a.west)), east: Math.max(...areas.map(a => a.east)) };
    const rectangle = areas.length === 1 || Math.round((envelope.north - envelope.south) * latitudeScale)
      * Math.round((envelope.east - envelope.west) * longitudeScale) === areas.length;
    const selectors = (rectangle ? [envelope] : areas).map((area) => {
      const bbox = [area.south, area.west, area.north, area.east].map(v => v.toFixed(6)).join(',');
      return `way["building"](${bbox});relation["building"]["type"="multipolygon"](${bbox});way["building:part"](${bbox});relation["building:part"]["type"="multipolygon"](${bbox});`;
    }).join('');
    const limit = Math.min(maximumBuildings, options.mobile ? Math.max(4_000, 3_000 * areas.length) : Math.max(MAX_FETCHED_BUILDINGS, 8_000 * areas.length));
    const query = `[out:json][timeout:15][maxsize:67108864];(${selectors});out geom ${limit + 1};`;
    let lastError: unknown;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      try {
        const url = new URL(endpoint);
        url.searchParams.set('data', query);
        const payload = await requestOverpassJSON<Parameters<typeof parseBuildings>[0] & { remark?: string }>(url, signal, 25_000);
        if (payload.remark || !Array.isArray(payload.elements)) throw new Error('Onvolledig Overpass-resultaat');
        if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
        return { buildings: parseBuildings({ elements: payload.elements.slice(0, limit) }), capped: payload.elements.length > limit };
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Geen Overpass-server beschikbaar');
  };

  const intersects = (a: Bounds, b: Bounds) => a.south < b.north && a.north > b.south && a.west < b.east && a.east > b.west;
  const forget = (job: SourceJob) => {
    for (const area of job.areas) if (inFlight.get(keyFor(area)) === job) inFlight.delete(keyFor(area));
  };
  const cancelUnused = (job: SourceJob) => {
    if (!job.held && !job.subscribers) { forget(job); job.controller.abort(); }
  };
  const loadArea = async (areas: Bounds[], signal: AbortSignal, retained?: SourceJob): Promise<SourceResult> => {
    if (signal.aborted) throw aborted(signal);
    let job = retained ?? inFlight.get(keyFor(areas[0]));
    if (!job || (!retained && areas.some(area => inFlight.get(keyFor(area)) !== job))) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Gebouwbron reageerde niet op tijd', 'TimeoutError')),
        options.deadline ?? OVERPASS_LOAD_TIMEOUT);
      const source: SourceJob = { areas, controller, subscribers: 0,
        held: areas.some(area => wanted.some(view => intersects(area, view))),
        promise: loadRawArea(areas, controller.signal) };
      source.promise = source.promise.then(result => {
        if (controller.signal.aborted) throw aborted(controller.signal);
        if (!result.capped) saveAreas(areas, result.buildings);
        return result;
      }).finally(() => { clearTimeout(timer); forget(source); });
      // A retained source can temporarily have no view subscriber during a
      // handoff. Its own deadline remains unchanged and rejection is handled.
      void source.promise.catch(() => {});
      for (const area of areas) inFlight.set(keyFor(area), source);
      job = source;
    }
    job.subscribers++;
    try {
      const result = await abortable(job.promise, signal);
      if (areas.length === job.areas.length && areas.every(area => job.areas.some(part => keyFor(part) === keyFor(area)))) return result;
      const buildings = result.buildings.filter(building => {
        const box = buildingBox(building.geometry);
        return areas.some(area => intersects(box, area));
      });
      return { ...result, buildings };
    } finally { job.subscribers--; cancelUnused(job); }
  };

  const load = async (bounds: Bounds, signal: AbortSignal, onProgress?: (data: BuildingData) => void): Promise<BuildingData> => {
    if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
    const allAreas = buildingAreas(bounds, options.mobile), areas = allAreas.slice(0, MAX_AREAS);
    datasets.clear();
    const buildings = new Map<string, CategorizedBuilding>();
    const contributions = new Map<string, CategorizedBuilding[]>();
    let capped = areas.length < allAreas.length, failedAreas = 0, loadedAreas = 0;
    let viewLimited = false;
    let completeAreas = 0, emptyAreas = 0, partialAreas = 0;
    let lastError: unknown;
    const snapshot = (): BuildingData => ({ buildings: [...buildings.values()], capped: capped || viewLimited, failedAreas, loadedAreas, totalAreas: areas.length,
      completeAreas, emptyAreas, partialAreas, source: 'osm', ...(datasets.size ? { datasets: [...datasets.values()] } : {}),
      status: capped || viewLimited || failedAreas || partialAreas || loadedAreas < areas.length ? 'partial' : buildings.size ? 'complete' : 'empty' });
    const merge = (features: CategorizedBuilding[]) => {
      for (const building of features) {
        if (buildings.size >= maximumBuildings && !buildings.has(building.properties.id)) { viewLimited = true; break; }
        buildings.set(building.properties.id, building);
      }
    };
    const replaceContribution = (key: string, features: CategorizedBuilding[]) => {
      contributions.set(key, features.slice(0, maximumBuildings));
      buildings.clear(); viewLimited = false;
      for (const records of contributions.values()) merge(records);
    };
    const controller = new AbortController();
    const abort = () => controller.abort(aborted(signal));
    signal.addEventListener('abort', abort, { once: true });
    // Bound total waiting time even if every public instance is overloaded.
    const deadline = setTimeout(() => controller.abort(new DOMException('Gebouwdata reageerde niet op tijd', 'TimeoutError')), options.deadline ?? OVERPASS_LOAD_TIMEOUT);
    let finished = false;
    const pending: Bounds[] = [];
    let refinements = options.maximumRefinements ?? (options.mobile ? 8 : 16);
    const resolveArea = async (batch: Bounds[], depth: number, report: (features: CategorizedBuilding[]) => void,
      initial = false, retained?: SourceJob): Promise<AreaResult> => {
      if (controller.signal.aborted) throw aborted(controller.signal);
      if (!initial && batch.length === 1) {
        const cached = await abortable(cachedArea(batch[0], controller.signal), controller.signal);
        if (cached) {
          report(cached.buildings);
          return { buildings: cached.buildings, status: cached.status, capped: false, failedAreas: 0, areaStatuses: [cached.status] };
        }
      }
      if (!initial && refinements-- <= 0) return { buildings: [], status: 'partial', capped: true, failedAreas: 0, areaStatuses: batch.map(() => 'partial') };
      let result: Awaited<ReturnType<typeof loadArea>>;
      try { result = await loadArea(batch, controller.signal, retained); }
      catch (error) {
        if (controller.signal.aborted) throw aborted(controller.signal);
        lastError = error;
        return { buildings: [], status: 'failed', capped: false, failedAreas: batch.length, areaStatuses: batch.map(() => 'failed') };
      }
      if (!result.capped) {
        const areaStatuses = saveAreas(batch, result.buildings);
        if (!initial) report(result.buildings);
        return { ...result, status: result.buildings.length ? 'complete' : 'empty', failedAreas: 0, areaStatuses };
      }
      const children = batch.length > 1 ? batch.map(area => [area])
        : depth < (options.maximumDepth ?? 3) ? splitDataBounds(batch[0]).map(area => [area]) : [];
      report(result.buildings);
      if (!children.length) return { ...result, status: 'partial', failedAreas: 0, areaStatuses: batch.map(() => 'partial') };
      const results: AreaResult[] = [];
      for (const child of children) results.push(await resolveArea(child, batch.length > 1 ? depth : depth + 1, report));
      const full = results.every(child => child.status === 'complete' || child.status === 'empty');
      const unique = new Map<string, CategorizedBuilding>();
      let limited = false;
      for (const building of [...(full ? [] : result.buildings), ...results.flatMap(child => child.buildings)]) {
        if (unique.size >= maximumBuildings && !unique.has(building.properties.id)) { limited = true; continue; }
        unique.set(building.properties.id, building);
      }
      const merged = [...unique.values()];
      const status = full && !limited ? (merged.length ? 'complete' : 'empty') : 'partial';
      const areaStatuses: DataCoverage[] = full && !limited ? saveAreas(batch, merged)
        : batch.length > 1 ? results.flatMap(child => child.areaStatuses) : [status];
      return { buildings: merged, status, areaStatuses,
        capped: limited || results.some(child => child.capped),
        failedAreas: batch.length > 1 ? results.reduce((count, child) => count + child.failedAreas, 0) : results.some(child => child.failedAreas) ? 1 : 0 };
    };
    try {
      // Process at most two cloned cache regions at a time, releasing each
      // batch before the next read; stop collecting when the view is full.
      for (let index = 0; index < areas.length; index += 2) {
        if (buildings.size >= maximumBuildings) { capped = true; break; }
        const batch = areas.slice(index, index + 2), cached = await abortable(Promise.all(batch.map(area => cachedArea(area, controller.signal))), controller.signal);
        for (let i = 0; i < batch.length; i++) {
          const record = cached[i];
          if (record) {
            contributions.set(keyFor(batch[i]), record.buildings);
            merge(record.buildings); loadedAreas++; completeAreas++; if (record.status === 'empty') emptyAreas++;
          } else pending.push(batch[i]);
        }
      }
      if (loadedAreas) onProgress?.(snapshot());
      const reused = new Map<SourceJob, Bounds[]>();
      const rows = new Map<number, Bounds[]>();
      for (const area of pending) {
        const source = inFlight.get(keyFor(area));
        if (source) {
          const group = reused.get(source) ?? [];
          group.push(area); reused.set(source, group); continue;
        }
        if (!rows.has(area.south)) rows.set(area.south, []);
        rows.get(area.south)!.push(area);
      }
      const batches: Array<{ areas: Bounds[]; source?: SourceJob }> = [...reused].map(([source, areas]) => ({ areas, source }));
      for (const row of rows.values()) for (let index = 0; index < row.length; index += batchSize) {
        batches.push({ areas: row.slice(index, index + batchSize) });
      }
      let next = 0;
      try { await abortable(Promise.all(Array.from({ length: Math.min(options.mobile ? 1 : 2, batches.length) }, async () => {
        while (next < batches.length && !controller.signal.aborted) {
          const { areas: batch, source } = batches[next++];
          const key = batch.map(keyFor).join('|');
          const provisional = new Map<string, CategorizedBuilding>();
          try {
            const result = await resolveArea(batch, 0, (features) => {
              if (finished || controller.signal.aborted) return;
              for (const feature of features) {
                if (provisional.size < maximumBuildings || provisional.has(feature.properties.id)) provisional.set(feature.properties.id, feature);
              }
              replaceContribution(key, [...provisional.values()]);
              onProgress?.(snapshot());
            }, true, source);
            if (finished || controller.signal.aborted) return;
            capped ||= result.capped;
            // A complete refined snapshot replaces provisional records (for
            // example an outline superseded by its complete multipolygon).
            replaceContribution(key, result.buildings);
            failedAreas += result.failedAreas;
            for (const status of result.areaStatuses) {
              if (status === 'partial') partialAreas++;
              else if (status === 'failed') continue;
              else { completeAreas++; if (status === 'empty') emptyAreas++; }
            }
          } catch (error) {
            if (finished || controller.signal.aborted) return;
            failedAreas += batch.length; lastError = error;
          }
          loadedAreas += batch.length;
          if (!signal.aborted) onProgress?.(snapshot());
        }
      })), controller.signal); } catch (error) { lastError = error; }
      finished = true;
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      failedAreas += areas.length - loadedAreas;
      if (!buildings.size && failedAreas) throw lastError instanceof Error ? lastError : new Error('Gebouwdata niet beschikbaar');
      return snapshot();
    } finally {
      finished = true;
      controller.abort();
      clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
    }
  };
  return Object.assign(load, {
    retain(bounds: Bounds | null) {
      wanted = bounds ? buildingAreas(bounds, options.mobile).slice(0, MAX_AREAS) : [];
      for (const job of new Set(inFlight.values())) {
        job.held = job.areas.some(area => wanted.some(view => intersects(area, view)));
        cancelUnused(job);
      }
    },
  });
}

export const fetchBuildings = createBuildingLoader();
