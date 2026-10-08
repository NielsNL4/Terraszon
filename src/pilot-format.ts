import { buildingBox } from './building-types';
import { decodeTreeCache } from './tree-cache';
import type { DataBounds } from './data-coverage';
import type { CategorizedBuilding, TreeFeature } from './types';
import type { TreeRecord } from './tree-records';

export const PILOT_BOUNDS: DataBounds = { south: 53.21, north: 53.23, west: 6.56, east: 6.58 };
export const PILOT_CELLS = [
  { id: 'centrum-zuid', bounds: { south: 53.21, north: 53.22, west: 6.56, east: 6.58 } },
  { id: 'centrum-noord', bounds: { south: 53.22, north: 53.23, west: 6.56, east: 6.58 } },
];
export const PILOT_MAX_BYTES = 3 * 1024 * 1024;
export type DatasetStamp = { revision: string; capturedAt: number; expiresAt: number };
export type PilotKind = 'buildings' | 'trees';
export type PilotFile = { path: string; bytes: number; sha256: string; count: number };
export type PilotManifest = DatasetStamp & { schema: 1; cells: { id: string; bounds: DataBounds; buildings: PilotFile; trees: PilotFile }[];
  sources: { buildings: { name: string; url: string; license: string; licenseUrl: string; attribution: string }; trees: { name: string; url: string; license: string; licenseUrl: string; attribution: string } } };
export type BuildingRecord = [id: string, height: number, minHeight: number, hasHeight: boolean, isPart: boolean, buildingType: string, geometry: CategorizedBuilding['geometry']];
export type PilotCell = DatasetStamp & { schema: 1; kind: PilotKind; bounds: DataBounds; records: BuildingRecord[] | TreeRecord[] };
export function intersectsBounds(a: DataBounds, b: DataBounds) { return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south; }
export function intersectsBuildingBounds(a: DataBounds, b: DataBounds) { return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south; }
export function validBounds(value: DataBounds): boolean {
  return !!value && [value.west, value.east, value.south, value.north].every(Number.isFinite) && value.west < value.east && value.south < value.north
    && value.west >= -180 && value.east <= 180 && value.south >= -85 && value.north <= 85;
}
export function subtractCoverage(target: DataBounds, coverage: DataBounds[]): DataBounds[] {
  let remaining = [target];
  for (const b of coverage) remaining = remaining.flatMap(a => {
    if (!intersectsBounds(a, b)) return [a];
    const south = Math.max(a.south, b.south), north = Math.min(a.north, b.north), west = Math.max(a.west, b.west), east = Math.min(a.east, b.east);
    return [{ ...a, north: south }, { ...a, south: north }, { south, north, west: a.west, east: west }, { south, north, west: east, east: a.east }].filter(part => part.north > part.south && part.east > part.west);
  });
  return remaining;
}
export function validatePilotManifest(value: unknown, now = Date.now()): PilotManifest {
  const m = value as PilotManifest;
  if (!m || m.schema !== 1 || !/^r[a-z0-9-]{8,64}$/.test(m.revision) || !Number.isFinite(m.capturedAt) || m.capturedAt > now || !Number.isFinite(m.expiresAt)
    || m.expiresAt <= now || m.expiresAt - m.capturedAt > 30 * 86_400_000 || !Array.isArray(m.cells) || m.cells.length < 1 || m.cells.length > 2
    || m.sources?.buildings?.license !== 'ODbL-1.0' || m.sources?.trees?.license !== 'CC-BY-4.0') throw new Error('Ongeldig of verlopen pilotmanifest');
  const ids = new Set<string>();
  for (const cell of m.cells) {
    if (!/^[a-z-]+$/.test(cell.id) || ids.has(cell.id) || !validBounds(cell.bounds) || cell.bounds.west < PILOT_BOUNDS.west || cell.bounds.east > PILOT_BOUNDS.east || cell.bounds.south < PILOT_BOUNDS.south || cell.bounds.north > PILOT_BOUNDS.north) throw new Error('Ongeldige pilotcel');
    ids.add(cell.id);
    for (const kind of ['buildings', 'trees'] as const) {
      const file = cell[kind];
      if (!file || file.path !== `${m.revision}/${cell.id}-${kind}.json` || !Number.isInteger(file.bytes) || file.bytes < 1 || file.bytes > PILOT_MAX_BYTES
        || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.count) || file.count < 0 || file.count > (kind === 'trees' ? 4000 : 12000)) throw new Error('Ongeldig pilotbestand');
    }
  }
  return m;
}
export function buildingRecord(feature: CategorizedBuilding): BuildingRecord {
  const p = feature.properties; return [p.id, p.height, p.minHeight, p.hasHeight, p.isPart, p.buildingType, feature.geometry];
}
export function decodePilotCell(value: unknown, kind: PilotKind, manifest: PilotManifest, bounds: DataBounds, count: number): CategorizedBuilding[] | TreeFeature[] {
  const cell = value as PilotCell;
  if (!cell || cell.schema !== 1 || cell.kind !== kind || cell.revision !== manifest.revision || cell.capturedAt !== manifest.capturedAt || cell.expiresAt !== manifest.expiresAt
    || JSON.stringify(cell.bounds) !== JSON.stringify(bounds) || !Array.isArray(cell.records) || cell.records.length !== count) throw new Error('Pilotbestand wijkt af van manifest');
  if (kind === 'trees') {
    for (const record of cell.records as TreeRecord[]) if (!Array.isArray(record) || record[0] < bounds.west || record[0] > bounds.east || record[1] < bounds.south || record[1] > bounds.north) throw new Error('Boom buiten pilotcel');
    const decoded = decodeTreeCache({ version: 1, savedAt: Date.now(), status: count ? 'complete' : 'empty', source: 'groningen', records: cell.records as TreeRecord[] });
    if (!decoded) throw new Error('Ongeldige boomrecords'); return decoded.trees;
  }
  let coordinates = 0;
  const ids = new Set<string>();
  return (cell.records as BuildingRecord[]).map(record => {
    if (!Array.isArray(record) || record.length !== 7) throw new Error('Ongeldig gebouwrecord');
    const [id, height, minHeight, hasHeight, isPart, buildingType, geometry] = record;
    if (!/^(way|relation)\/\d+$/.test(id) || ids.has(id) || !Number.isFinite(height) || height <= 0 || height > 1001 || !Number.isFinite(minHeight) || minHeight < 0 || minHeight >= height
      || typeof hasHeight !== 'boolean' || typeof isPart !== 'boolean' || typeof buildingType !== 'string' || buildingType.length > 200 || !geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error('Ongeldige gebouweigenschappen');
    ids.add(id);
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length) throw new Error('Ongeldige geometrie');
    for (const rings of polygons) {
      if (!Array.isArray(rings) || !rings.length) throw new Error('Ongeldige polygonen');
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4) throw new Error('Ongeldige ring');
        coordinates += ring.length; if (coordinates > 125_000) throw new Error('Pilotgeometrie overschrijdt geheugenbudget');
        for (const p of ring) if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || Math.abs(p[0]) > 180 || !Number.isFinite(p[1]) || Math.abs(p[1]) > 90) throw new Error('Ongeldige coördinaten');
        if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) throw new Error('Open ring');
      }
    }
    const feature: CategorizedBuilding = { type: 'Feature', id, properties: { id, height, minHeight, hasHeight, isPart, buildingType }, geometry };
    if (!intersectsBuildingBounds(buildingBox(geometry), bounds)) throw new Error('Gebouw buiten pilotcel'); return feature;
  });
}
