import { buildingBox, parseBuildings } from './building-types';
import { OVERPASS_ENDPOINTS } from './terraces';
import type { CategorizedBuilding } from './types';

type Bounds = { south: number; west: number; north: number; east: number };
export type BuildingData = {
  buildings: CategorizedBuilding[];
  capped: boolean;
  failedAreas: number;
  loadedAreas: number;
  totalAreas: number;
};
export const MAX_FETCHED_BUILDINGS = 20_000; // minimum per-request limit, not a screen-wide limit
const MAX_VIEW_BUILDINGS = 60_000;
const MAX_AREAS = 24;
const CACHE_TTL = 24 * 60 * 60 * 1000;
type CachedArea = { savedAt: number; buildings: CategorizedBuilding[] };

export function buildingAreas(bounds: Bounds): Bounds[] {
  const areas: Bounds[] = [];
  const south = Math.floor(bounds.south * 100), north = Math.ceil(bounds.north * 100);
  const west = Math.floor(bounds.west * 50), east = Math.ceil(bounds.east * 50);
  for (let y = south; y < north; y++) for (let x = west; x < east; x++) {
    areas.push({ south: y / 100, north: (y + 1) / 100, west: x / 50, east: (x + 1) / 50 });
  }
  const latitude = (bounds.south + bounds.north) / 2;
  const longitude = (bounds.west + bounds.east) / 2;
  const scale = Math.cos(latitude * Math.PI / 180);
  const distance = (area: Bounds) => ((area.south + area.north) / 2 - latitude) ** 2
    + (((area.west + area.east) / 2 - longitude) * scale) ** 2;
  return areas.sort((a, b) => distance(a) - distance(b));
}

export function createBuildingLoader() {
  const memory = new Map<string, CachedArea>();
  const keyFor = (area: Bounds) => `terraszon:v3:building-cell:${[area.south, area.west, area.north, area.east].map(v => v.toFixed(4)).join(':')}`;
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
  const cachedArea = (area: Bounds): CategorizedBuilding[] | null => {
    const key = keyFor(area);
    let cached = memory.get(key);
    if (!cached) {
      try { cached = JSON.parse(localStorage.getItem(key) ?? 'null') ?? undefined; } catch { /* Optional storage. */ }
    }
    if (!cached || Date.now() - cached.savedAt >= CACHE_TTL || !Array.isArray(cached.buildings)
      || cached.buildings.length > MAX_VIEW_BUILDINGS) return null;
    remember(key, cached);
    return cached.buildings;
  };

  const loadArea = async (areas: Bounds[], signal: AbortSignal) => {
    // Batch up to four neighboring cells into one API request: many separate
    // small queries would exhaust the public instances' per-client quota.
    const envelope = { south: Math.min(...areas.map(a => a.south)), north: Math.max(...areas.map(a => a.north)),
      west: Math.min(...areas.map(a => a.west)), east: Math.max(...areas.map(a => a.east)) };
    const rectangle = Math.round((envelope.north - envelope.south) * 100)
      * Math.round((envelope.east - envelope.west) * 50) === areas.length;
    const selectors = (rectangle ? [envelope] : areas).map((area) => {
      const bbox = [area.south, area.west, area.north, area.east].map(v => v.toFixed(4)).join(',');
      return `way["building"](${bbox});relation["building"]["type"="multipolygon"](${bbox});way["building:part"](${bbox});relation["building:part"]["type"="multipolygon"](${bbox});`;
    }).join('');
    const limit = Math.max(MAX_FETCHED_BUILDINGS, 8_000 * areas.length);
    const query = `[out:json][timeout:15][maxsize:67108864];(${selectors});out geom ${limit + 1};`;
    let lastError: unknown;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = window.setTimeout(abort, 18_000);
      try {
        const url = new URL(endpoint);
        url.searchParams.set('data', query);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${endpoint} gaf status ${response.status}`);
        const payload = await response.json() as Parameters<typeof parseBuildings>[0] & { remark?: string };
        if (payload.remark || !Array.isArray(payload.elements)) throw new Error('Onvolledig Overpass-resultaat');
        if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
        if (payload.elements.length > limit) return { buildings: [], capped: true };
        const buildings = parseBuildings(payload);
        if (buildings.length) {
          const boxes = buildings.map((building) => buildingBox(building.geometry));
          for (const area of areas) {
            const subset = areas.length === 1 ? buildings : buildings.filter((_building, index) => {
              const box = boxes[index];
              return box.east >= area.west && box.west <= area.east && box.north >= area.south && box.south <= area.north;
            });
            if (!subset.length) continue;
            const key = keyFor(area), cached = { savedAt: Date.now(), buildings: subset };
            remember(key, cached);
            try { localStorage.setItem(key, JSON.stringify(cached)); } catch { /* Memory cache still works when browser storage is full. */ }
          }
        }
        return { buildings, capped: false };
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Geen Overpass-server beschikbaar');
  };

  return async (bounds: Bounds, signal: AbortSignal, onProgress?: (data: BuildingData) => void): Promise<BuildingData> => {
    if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
    const allAreas = buildingAreas(bounds), areas = allAreas.slice(0, MAX_AREAS);
    const buildings = new Map<string, CategorizedBuilding>();
    let capped = areas.length < allAreas.length, failedAreas = 0, loadedAreas = 0;
    let lastError: unknown;
    const snapshot = (): BuildingData => ({ buildings: [...buildings.values()], capped, failedAreas, loadedAreas, totalAreas: areas.length });
    const merge = (features: CategorizedBuilding[]) => {
      for (const building of features) {
        if (buildings.size >= MAX_VIEW_BUILDINGS && !buildings.has(building.properties.id)) { capped = true; break; }
        buildings.set(building.properties.id, building);
      }
    };
    const pending: Bounds[] = [];
    for (const area of areas) {
      const cached = cachedArea(area);
      if (cached) { merge(cached); loadedAreas++; } else pending.push(area);
    }
    if (loadedAreas) onProgress?.(snapshot());
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    // Bound total waiting time even if every public instance is overloaded.
    const deadline = window.setTimeout(abort, 45_000);
    const rows = new Map<number, Bounds[]>();
    for (const area of pending) {
      if (!rows.has(area.south)) rows.set(area.south, []);
      rows.get(area.south)!.push(area);
    }
    const batches = [...rows.values()].flatMap(row => Array.from({ length: Math.ceil(row.length / 4) },
      (_, index) => row.slice(index * 4, index * 4 + 4)));
    let next = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(2, batches.length) }, async () => {
        while (next < batches.length && !controller.signal.aborted) {
          const batch = batches[next++];
          try {
            const result = await loadArea(batch, controller.signal);
            capped ||= result.capped;
            merge(result.buildings);
          } catch (error) { failedAreas += batch.length; lastError = error; }
          loadedAreas += batch.length;
          if (!signal.aborted) onProgress?.(snapshot());
        }
      }));
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      failedAreas += areas.length - loadedAreas;
      if (!buildings.size && failedAreas) throw lastError instanceof Error ? lastError : new Error('Gebouwdata niet beschikbaar');
      return snapshot();
    } finally {
      window.clearTimeout(deadline);
      signal.removeEventListener('abort', abort);
    }
  };
}

export const fetchBuildings = createBuildingLoader();
