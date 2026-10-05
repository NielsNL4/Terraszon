import type { Polygon, Position } from 'geojson';
import type { CategorizedBuilding } from './types';

type OSMPoint = { lat: number; lon: number };
type OSMMember = { type: string; ref: number; role: string; geometry?: OSMPoint[] };
type OSMElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OSMPoint[];
  members?: OSMMember[];
};

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
  return createTileHeightResolver(tiles)(buildings);
}

export function createTileHeightResolver(
  tiles: Array<{ geometry: CategorizedBuilding['geometry']; properties: Record<string, unknown> | null }>,
) {
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
      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      for (const point of rings[0]) {
        const x = cell(point[0]), y = cell(point[1]);
        west = Math.min(west, x); east = Math.max(east, x);
        south = Math.min(south, y); north = Math.max(north, y);
      }
      const entry = { rings, height };
      for (let x = west; x <= east; x++) {
        for (let y = south; y <= north; y++) {
          const key = `${x}:${y}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key)!.push(entry);
        }
      }
    }
  }
  return (buildings: CategorizedBuilding[]) => buildings.map((building) => {
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

export function buildingBox(geometry: CategorizedBuilding['geometry']) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const box = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  for (const rings of polygons) for (const point of rings[0]) {
    box.west = Math.min(box.west, point[0]); box.east = Math.max(box.east, point[0]);
    box.south = Math.min(box.south, point[1]); box.north = Math.max(box.north, point[1]);
  }
  return box;
}

// Fill unloaded/failed areas with individual neutral tile footprints. Loaded
// OSM polygons replace matching footprints by position, never by a merged ID.
export function mergeBuildingGeometry(known: CategorizedBuilding[], fallback: CategorizedBuilding[]): CategorizedBuilding[] {
  const cell = (value: number) => Math.floor(value * 2_000);
  const cells = new Map<string, CategorizedBuilding[]>();
  const large: CategorizedBuilding[] = [];
  for (const building of known) {
    const box = buildingBox(building.geometry);
    const west = cell(box.west), east = cell(box.east), south = cell(box.south), north = cell(box.north);
    if ((east - west + 1) * (north - south + 1) > 10_000) { large.push(building); continue; }
    for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) {
      const key = `${x}:${y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(building);
    }
  }
  const result = [...known];
  for (const tile of fallback) {
    const point = buildingSample(tile);
    const candidates = [...(cells.get(`${cell(point[0])}:${cell(point[1])}`) ?? []), ...large]
      .filter((building) => buildingContains(building, point));
    const match = candidates.sort((a, b) => b.properties.height - a.properties.height)[0];
    if (!match) result.push(tile);
    else if (tile.properties.height > match.properties.height + 0.1) {
      // Keep tall tile-only parts (e.g. a tower) instead of replacing them with
      // a lower outline, but inherit the containing building's usage/color.
      result.push({ ...tile, properties: { ...tile.properties, buildingType: match.properties.buildingType } });
    }
  }
  return result;
}
