import { buildingBox, parseBuildings } from './building-types';
import { OVERPASS_ENDPOINTS } from './terraces';
import type { CategorizedBuilding } from './types';
import { abortable, aborted, requestJSON } from './requests';
import { splitDataBounds, type DataCoverage } from './data-coverage';

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
};
export const MAX_FETCHED_BUILDINGS = 20_000; // minimum per-request limit, not a screen-wide limit
const MAX_VIEW_BUILDINGS = 60_000;
const MAX_AREAS = 24;
const CACHE_TTL = 24 * 60 * 60 * 1000;
export type CachedArea = { savedAt: number; buildings: CategorizedBuilding[]; status: 'complete' | 'empty'; source: 'osm' };
type AreaStore = { get: (key: string) => Promise<CachedArea | null>; set: (key: string, value: CachedArea) => Promise<void> };
type LoaderOptions = { mobile?: boolean; store?: AreaStore; deadline?: number; maximumDepth?: number; maximumRefinements?: number };
type AreaResult = { buildings: CategorizedBuilding[]; status: DataCoverage; capped: boolean; failedAreas: number; areaStatuses: DataCoverage[] };

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
  const store: AreaStore = options.store ?? {
    async get(key) { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } },
    async set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Memory remains available. */ } },
  };
  const latitudeScale = options.mobile ? 200 : 100, longitudeScale = options.mobile ? 100 : 50;
  const batchSize = options.mobile ? 2 : 4;
  const memory = new Map<string, CachedArea>();
  const keyFor = (area: Bounds) => `terraszon:v4:building-cell:${[area.south, area.west, area.north, area.east].map(v => v.toFixed(6)).join(':')}`;
  const remember = (key: string, cached: CachedArea) => {
    memory.delete(key);
    memory.set(key, cached);
    let count = [...memory.values()].reduce((sum, area) => sum + area.buildings.length, 0);
    while (memory.size > MAX_AREAS || count > MAX_VIEW_BUILDINGS) {
      const first = memory.keys().next().value!;
      count -= memory.get(first)!.buildings.length;
      memory.delete(first);
    }
  };
  const cachedArea = async (area: Bounds): Promise<CachedArea | null> => {
    const key = keyFor(area);
    let cached = memory.get(key);
    if (!cached) {
      cached = await store.get(key) ?? undefined;
    }
    if (!cached || cached.source !== 'osm' || !['complete', 'empty'].includes(cached.status)
      || !Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt >= (cached.status === 'empty' ? 60_000 : CACHE_TTL) || !Array.isArray(cached.buildings)
      || cached.buildings.length > MAX_VIEW_BUILDINGS) return null;
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
      remember(key, cached);
      statuses.push(cached.status);
      // Complete empty areas are remembered briefly in memory, not for 24 hours.
      if (subset.length) void store.set(key, cached).catch(() => {});
    }
    return statuses;
  };

  const loadArea = async (areas: Bounds[], signal: AbortSignal) => {
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
    const limit = options.mobile ? Math.max(4_000, 3_000 * areas.length) : Math.max(MAX_FETCHED_BUILDINGS, 8_000 * areas.length);
    const query = `[out:json][timeout:15][maxsize:67108864];(${selectors});out geom ${limit + 1};`;
    let lastError: unknown;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      try {
        const url = new URL(endpoint);
        url.searchParams.set('data', query);
        const payload = await requestJSON<Parameters<typeof parseBuildings>[0] & { remark?: string }>(url, signal, 18_000);
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

  return async (bounds: Bounds, signal: AbortSignal, onProgress?: (data: BuildingData) => void): Promise<BuildingData> => {
    if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
    const allAreas = buildingAreas(bounds, options.mobile), areas = allAreas.slice(0, MAX_AREAS);
    const buildings = new Map<string, CategorizedBuilding>();
    const contributions = new Map<string, CategorizedBuilding[]>();
    let capped = areas.length < allAreas.length, failedAreas = 0, loadedAreas = 0;
    let viewLimited = false;
    let completeAreas = 0, emptyAreas = 0, partialAreas = 0;
    let lastError: unknown;
    const snapshot = (): BuildingData => ({ buildings: [...buildings.values()], capped: capped || viewLimited, failedAreas, loadedAreas, totalAreas: areas.length,
      completeAreas, emptyAreas, partialAreas, source: 'osm',
      status: capped || viewLimited || failedAreas || partialAreas || loadedAreas < areas.length ? 'partial' : buildings.size ? 'complete' : 'empty' });
    const merge = (features: CategorizedBuilding[]) => {
      for (const building of features) {
        if (buildings.size >= MAX_VIEW_BUILDINGS && !buildings.has(building.properties.id)) { viewLimited = true; break; }
        buildings.set(building.properties.id, building);
      }
    };
    const replaceContribution = (key: string, features: CategorizedBuilding[]) => {
      contributions.set(key, features);
      buildings.clear(); viewLimited = false;
      for (const records of contributions.values()) merge(records);
    };
    const controller = new AbortController();
    const abort = () => controller.abort(aborted(signal));
    signal.addEventListener('abort', abort, { once: true });
    // Bound total waiting time even if every public instance is overloaded.
    const deadline = setTimeout(() => controller.abort(new DOMException('Gebouwdata reageerde niet op tijd', 'TimeoutError')), options.deadline ?? 45_000);
    let finished = false;
    const pending: Bounds[] = [];
    let refinements = options.maximumRefinements ?? (options.mobile ? 8 : 16);
    const resolveArea = async (batch: Bounds[], depth: number, report: (features: CategorizedBuilding[]) => void, initial = false): Promise<AreaResult> => {
      if (controller.signal.aborted) throw aborted(controller.signal);
      if (!initial && batch.length === 1) {
        const cached = await abortable(cachedArea(batch[0]), controller.signal);
        if (cached) {
          report(cached.buildings);
          return { buildings: cached.buildings, status: cached.status, capped: false, failedAreas: 0, areaStatuses: [cached.status] };
        }
      }
      if (!initial && refinements-- <= 0) return { buildings: [], status: 'partial', capped: true, failedAreas: 0, areaStatuses: batch.map(() => 'partial') };
      let result: Awaited<ReturnType<typeof loadArea>>;
      try { result = await loadArea(batch, controller.signal); }
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
        if (unique.size >= MAX_VIEW_BUILDINGS && !unique.has(building.properties.id)) { limited = true; continue; }
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
      const cached = await abortable(Promise.all(areas.map(cachedArea)), controller.signal);
      for (let index = 0; index < areas.length; index++) {
        const record = cached[index];
        if (record) {
          contributions.set(keyFor(areas[index]), record.buildings);
          merge(record.buildings); loadedAreas++; completeAreas++; if (record.status === 'empty') emptyAreas++;
        }
        else pending.push(areas[index]);
      }
      if (loadedAreas) onProgress?.(snapshot());
      const rows = new Map<number, Bounds[]>();
      for (const area of pending) {
        if (!rows.has(area.south)) rows.set(area.south, []);
        rows.get(area.south)!.push(area);
      }
      const batches = [...rows.values()].flatMap(row => Array.from({ length: Math.ceil(row.length / batchSize) },
        (_, index) => row.slice(index * batchSize, index * batchSize + batchSize)));
      let next = 0;
      try { await abortable(Promise.all(Array.from({ length: Math.min(options.mobile ? 1 : 2, batches.length) }, async () => {
        while (next < batches.length && !controller.signal.aborted) {
          const batch = batches[next++];
          const key = batch.map(keyFor).join('|');
          const provisional = new Map<string, CategorizedBuilding>();
          try {
            const result = await resolveArea(batch, 0, (features) => {
              if (finished || controller.signal.aborted) return;
              for (const feature of features) {
                if (provisional.size < MAX_VIEW_BUILDINGS || provisional.has(feature.properties.id)) provisional.set(feature.properties.id, feature);
              }
              replaceContribution(key, [...provisional.values()]);
              onProgress?.(snapshot());
            }, true);
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
}

export const fetchBuildings = createBuildingLoader();
