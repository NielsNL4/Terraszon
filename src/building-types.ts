import type { Polygon, Position } from 'geojson';
import { OVERPASS_ENDPOINTS } from './terraces';
import type { CategorizedBuilding } from './types';

type Bounds = { south: number; west: number; north: number; east: number };
type OSMPoint = { lat: number; lon: number };
type OSMMember = { type: string; ref: number; role: string; geometry?: OSMPoint[] };
type OSMElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OSMPoint[];
  members?: OSMMember[];
};
export type BuildingData = { buildings: CategorizedBuilding[]; capped: boolean };
export const MAX_FETCHED_BUILDINGS = 20_000;
const CACHE_TTL = 24 * 60 * 60 * 1000;

function samePoint(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function coordinates(points: OSMPoint[] = []): Position[] {
  if (points.some(({ lat, lon }) => !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180)) return [];
  return points.map(({ lat, lon }) => [lon, lat])
    .filter((point, index, ring) => index === 0 || !samePoint(point, ring[index - 1]));
}

function closedRing(ring: Position[]): boolean {
  return ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1]);
}

// Multipolygon boundaries can consist of several ways in either direction.
function joinRings(segments: Position[][]): Position[][] | null {
  if (segments.some((segment) => segment.length < 2)) return null;
  const pending = segments.map((segment) => segment.slice());
  const rings: Position[][] = [];
  while (pending.length) {
    const ring = pending.pop()!;
    if (ring.length < 2) return null;
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const last = ring[ring.length - 1];
      const index = pending.findIndex((segment) => samePoint(last, segment[0])
        || samePoint(last, segment[segment.length - 1]));
      if (index < 0) return null;
      const next = pending.splice(index, 1)[0];
      if (!samePoint(last, next[0])) next.reverse();
      ring.push(...next.slice(1));
    }
    if (!closedRing(ring)) return null;
    rings.push(ring);
  }
  return rings;
}

export function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [previousX, previousY] = ring[j];
    if ((y > point[1]) !== (previousY > point[1])
      && point[0] < (previousX - x) * (point[1] - y) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

export function buildingContains(building: CategorizedBuilding, point: Position): boolean {
  const polygons = building.geometry.type === 'Polygon'
    ? [building.geometry.coordinates] : building.geometry.coordinates;
  return polygons.some((rings) => pointInRing(point, rings[0])
    && !rings.slice(1).some((hole) => pointInRing(point, hole)));
}

export function buildingSample(building: CategorizedBuilding): Position {
  const ring = building.geometry.type === 'Polygon'
    ? building.geometry.coordinates[0] : building.geometry.coordinates[0][0];
  const center = ring.slice(0, -1).reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
    .map((value) => value / (ring.length - 1));
  if (buildingContains(building, center)) return center;
  // Move very slightly inwards from the first edge; unlike a centroid this also
  // works for concave footprints and buildings with a courtyard.
  const a = ring[0], b = ring[1];
  const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const offset = Math.min(length / 10, 0.000002);
  const dx = (b[1] - a[1]) / length * offset;
  const dy = (b[0] - a[0]) / length * offset;
  const left = [midpoint[0] - dx, midpoint[1] + dy];
  return buildingContains(building, left) ? left : [midpoint[0] + dx, midpoint[1] - dy];
}

function geometryFor(element: OSMElement): CategorizedBuilding['geometry'] | null {
  if (element.type === 'way') {
    const ring = coordinates(element.geometry);
    return closedRing(ring) ? { type: 'Polygon', coordinates: [ring] } : null;
  }
  if (element.type !== 'relation' || element.tags?.type !== 'multipolygon') return null;
  const members = (element.members ?? []).filter((member) => member.type === 'way');
  const outer = joinRings(members.filter((member) => member.role === 'outer' || !member.role)
    .map((member) => coordinates(member.geometry)));
  const inner = joinRings(members.filter((member) => member.role === 'inner')
    .map((member) => coordinates(member.geometry)));
  if (!outer?.length || !inner) return null;
  const polygons: Polygon['coordinates'][] = outer.map((ring) => [ring]);
  for (const hole of inner) {
    const polygon = polygons.find((rings) => pointInRing(hole[0], rings[0]));
    if (!polygon) return null;
    polygon.push(hole);
  }
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function meters(value: string | undefined): number | null {
  if (!value || !/^\d+(?:[.,]\d+)?\s*(?:m)?$/.test(value.trim())) return null;
  const result = parseFloat(value.replace(',', '.'));
  return Number.isFinite(result) && result >= 0 && result <= 1_000 ? result : null;
}

export function parseBuildings(data: { elements: OSMElement[] }): CategorizedBuilding[] {
  const buildings: CategorizedBuilding[] = [];
  const relationWays = new Set<number>();
  for (const element of data.elements) {
    const tags = element.tags ?? {};
    const isPart = !!tags['building:part'] && tags['building:part'] !== 'no';
    if ((!tags.building || tags.building === 'no') && !isPart) continue;
    if (!Number.isSafeInteger(element.id) || element.id <= 0) continue;
    const geometry = geometryFor(element);
    if (!geometry) continue;
    const explicitHeight = meters(tags.height);
    const levels = meters(tags['building:levels']);
    const roofHeight = meters(tags['roof:height']) ?? (meters(tags['roof:levels']) ?? 0) * 3;
    const height = explicitHeight ?? (levels !== null ? levels * 3 + roofHeight : 9);
    const minHeight = meters(tags.min_height) ?? (meters(tags['building:min_level']) ?? 0) * 3;
    buildings.push({
      type: 'Feature', id: `${element.type}/${element.id}`, geometry,
      properties: {
        id: `${element.type}/${element.id}`,
        buildingType: tags.building && tags.building !== 'no' ? tags.building.trim() : 'yes',
        height: Math.max(height, minHeight + 1), minHeight,
        hasHeight: explicitHeight !== null || levels !== null, isPart,
      },
    });
    if (element.type === 'relation') {
      for (const member of element.members ?? []) {
        if (member.type === 'way' && ['outer', 'inner', ''].includes(member.role)) relationWays.add(member.ref);
      }
    }
  }
  const unique = buildings.filter((building) => !building.properties.id.startsWith('way/')
    || !relationWays.has(Number(building.properties.id.slice(4))));
  const outlines = unique.filter((building) => !building.properties.isPart);
  for (const part of unique.filter((building) => building.properties.isPart && building.properties.buildingType === 'yes')) {
    const sample = buildingSample(part);
    const parent = outlines.find((building) => buildingContains(building, sample));
    if (parent) part.properties.buildingType = parent.properties.buildingType;
  }
  return unique;
}

export function withTileHeights(
  buildings: CategorizedBuilding[],
  tiles: Array<{ geometry: CategorizedBuilding['geometry']; properties: Record<string, unknown> | null }>,
): CategorizedBuilding[] {
  // Tiles merge thousands of footprints under one ID. Match by position only,
  // never by ID, and index individual polygons to keep the join inexpensive.
  const cells = new Map<string, Array<{ rings: Position[][]; height: number }>>();
  const cell = (value: number) => Math.floor(value * 1_000);
  for (const tile of tiles) {
    const height = Number(tile.properties?.render_height);
    if (!Number.isFinite(height) || height <= 0) continue;
    const polygons = tile.geometry.type === 'Polygon' ? [tile.geometry.coordinates] : tile.geometry.coordinates;
    for (const rings of polygons) {
      if (!rings[0]?.length) continue;
      const xs = rings[0].map((point) => cell(point[0]));
      const ys = rings[0].map((point) => cell(point[1]));
      const entry = { rings, height };
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
          const key = `${x}:${y}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key)!.push(entry);
        }
      }
    }
  }
  return buildings.map((building) => {
    if (building.properties.hasHeight) return building;
    const point = buildingSample(building);
    const candidates = cells.get(`${cell(point[0])}:${cell(point[1])}`) ?? [];
    const match = candidates.find(({ rings }) => pointInRing(point, rings[0])
      && !rings.slice(1).some((hole) => pointInRing(point, hole)));
    return match ? { ...building, properties: {
      ...building.properties, height: Math.max(match.height, building.properties.minHeight + 1),
    } } : building;
  });
}

export async function fetchBuildings(bounds: Bounds, signal: AbortSignal): Promise<BuildingData> {
  if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
  const values = [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => value.toFixed(4));
  const key = `terraszon:v2:building-geometry:${values.join(':')}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { savedAt: number; data: BuildingData };
      if (Date.now() - parsed.savedAt < CACHE_TTL && Array.isArray(parsed.data?.buildings)
        && parsed.data.buildings.length <= MAX_FETCHED_BUILDINGS && parsed.data.capped === false) return parsed.data;
    }
  } catch { /* Browser storage is optional. */ }

  const bbox = values.join(',');
  // A modest memory reservation fits more readily on busy public instances
  // than Overpass's default 512 MB reservation, while covering our bounded area.
  const query = `[out:json][timeout:25][maxsize:67108864];(way["building"](${bbox});relation["building"]["type"="multipolygon"](${bbox});way["building:part"](${bbox});relation["building:part"]["type"="multipolygon"](${bbox}););out geom ${MAX_FETCHED_BUILDINGS + 1};`;
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(endpoint, {
        method: 'POST', body: new URLSearchParams({ data: query }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${endpoint} gaf status ${response.status}`);
      const payload = await response.json() as { elements?: OSMElement[]; remark?: string };
      if (payload.remark || !Array.isArray(payload.elements)) throw new Error('Onvolledig Overpass-resultaat');
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      // Never replace the complete base map with an arbitrarily truncated area.
      if (payload.elements.length > MAX_FETCHED_BUILDINGS) return { buildings: [], capped: true };
      const result = { buildings: parseBuildings({ elements: payload.elements }), capped: false };
      if (result.buildings.length) {
        try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: result })); } catch { /* Cache is optional. */ }
      }
      return result;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Geen Overpass-server beschikbaar');
}
