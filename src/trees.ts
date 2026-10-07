import type { FeatureCollection, Point } from 'geojson';
import type { TreeFeature } from './types';
import { OVERPASS_ENDPOINTS } from './terraces';
import { stableTreeFraction, TREE_PROFILES, treeIdentity } from './tree-profiles';
import { aborted, requestJSON } from './requests';
import type { DataBounds, DataCoverage } from './data-coverage';

export const TREE_PAGE_SIZE = 1_000;
const MAX_MUNICIPAL_PAGES = 4;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const EARTH_METERS_PER_DEGREE = 111_320;
const GRONINGEN_TREES = 'https://services2.arcgis.com/chCSiGO4ORzXeSGk/arcgis/rest/services/Bomen_gemeente_Groningen/FeatureServer/0/query';
const GRONINGEN_EXTENT = { south: 53.1, west: 6.3, north: 53.38, east: 6.85 };

type Bounds = DataBounds;
export type TreeAreaData = {
  trees: TreeFeature[];
  status: DataCoverage;
  source: 'groningen' | 'osm';
  capped: boolean;
  failed: boolean;
  requests: number;
};
type TreeElement = { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string> };
type MunicipalTree = {
  id?: number;
  geometry?: { type: string; coordinates: unknown };
  properties?: { OBJECTID?: number; BOOMHOOGTE?: string; BOOMSOORT?: string; LATIJNSE_NAAM?: string };
};

function meters(value: string | undefined, fallback: number, maximum: number): number {
  if (!value) return fallback;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(m|meters?|metres?)?\s*$/i.exec(value);
  if (!match) return fallback;
  const result = Number(match[1].replace(',', '.'));
  return result >= 1 && result <= maximum ? result : fallback;
}

function estimatedHeight(id: string, minimum: number, maximum: number): number {
  let hash = 2_166_136_261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  // Stay away from the class boundaries: these are estimates, not measurements.
  const fraction = 0.15 + 0.7 * (hash >>> 0) / 0xffffffff;
  return Math.round((minimum + (maximum - minimum) * fraction) * 10) / 10;
}

function municipalHeight(id: string, value: string | undefined): number {
  if (value) {
    const range = /^\s*(\d+)\s+tot\s+(\d+)\s*m\.?\s*$/i.exec(value);
    if (range) return estimatedHeight(id, Number(range[1]), Number(range[2]));
    const young = /^\s*tot\s+(\d+)\s*m\.?\s*$/i.exec(value);
    if (young) return estimatedHeight(id, 2, Number(young[1]));
    const tall = /^\s*(\d+)\s*m\.?\s*en\s*hoger\s*$/i.exec(value);
    if (tall) return estimatedHeight(id, Number(tall[1]), Math.min(Number(tall[1]) + 6, 40));
    const exact = meters(value, NaN, 40);
    if (Number.isFinite(exact)) return exact;
  }
  return estimatedHeight(id, 8, 12);
}

function estimatedDiameter(height: number): number {
  return Math.max(4, Math.min(12, height * 0.7));
}

function treeFeature(id: string, latitude: number, longitude: number, height: number, diameter: number,
  details: Partial<TreeFeature['properties']> = {}): TreeFeature {
  const radius = diameter / 2;
  const ring: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const angle = 2 * Math.PI * i / 12;
    ring.push([
      longitude + radius * Math.cos(angle) / (EARTH_METERS_PER_DEGREE * Math.cos(latitude * Math.PI / 180)),
      latitude + radius * Math.sin(angle) / EARTH_METERS_PER_DEGREE,
    ]);
  }
  ring.push(ring[0]);
  return {
    type: 'Feature',
    properties: { id, height, crownRadius: radius, rotation: stableTreeFraction(id) * Math.PI * 2, ...details },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function parseTrees(data: { elements: TreeElement[] }): TreeFeature[] {
  return data.elements.flatMap((element) => {
    if (element.type !== 'node' || element.tags?.natural !== 'tree'
      || !Number.isFinite(element.lat) || !Number.isFinite(element.lon)
      || Math.abs(element.lat!) > 85 || Math.abs(element.lon!) > 180) return [];
    const latitude = element.lat!, longitude = element.lon!;
    const id = `tree/${element.id}`;
    const height = meters(element.tags.height, estimatedHeight(id, 8, 12), 40);
    const scientificName = element.tags.species ?? element.tags.genus;
    const species = element.tags['species:nl'];
    const identity = treeIdentity(species, scientificName);
    const cycle = element.tags.leaf_cycle;
    if (cycle === 'evergreen' || cycle === 'deciduous') identity.leafCycle = cycle;
    const diameter = meters(element.tags.diameter_crown, estimatedDiameter(height) * TREE_PROFILES[identity.profile].width, 24);
    return [treeFeature(id, latitude, longitude, height, diameter, { ...identity, scientificName, species })];
  });
}

export function parseMunicipalTrees(data: { features: MunicipalTree[] }): TreeFeature[] {
  return data.features.flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    const id = feature.properties?.OBJECTID ?? feature.id;
    if (feature.geometry?.type !== 'Point' || !Array.isArray(coordinates)
      || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 85
      || !Number.isFinite(id)) return [];
    const treeId = `groningen/${id}`;
    const height = municipalHeight(treeId, feature.properties?.BOOMHOOGTE);
    const species = feature.properties?.BOOMSOORT ?? undefined;
    const scientificName = feature.properties?.LATIJNSE_NAAM ?? undefined;
    const identity = treeIdentity(species, scientificName);
    return [treeFeature(treeId, coordinates[1], coordinates[0], height, estimatedDiameter(height) * TREE_PROFILES[identity.profile].width,
      { ...identity, species, scientificName, heightClass: feature.properties?.BOOMHOOGTE })];
  });
}

export function treeMarkers(trees: TreeFeature[]): FeatureCollection<Point, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: trees.map((tree) => {
      const ring = tree.geometry.coordinates[0];
      return {
        type: 'Feature', properties: { id: tree.properties.id },
        geometry: { type: 'Point', coordinates: [(ring[0][0] + ring[6][0]) / 2, (ring[0][1] + ring[6][1]) / 2] },
      };
    }),
  };
}

function intersectsGroningen(bounds: Bounds): boolean {
  return bounds.west < GRONINGEN_EXTENT.east && bounds.east > GRONINGEN_EXTENT.west
    && bounds.south < GRONINGEN_EXTENT.north && bounds.north > GRONINGEN_EXTENT.south;
}

type MunicipalResponse = {
  features?: Array<{ attributes?: MunicipalTree['properties']; geometry?: { x?: number; y?: number } }>;
  exceededTransferLimit?: boolean;
};

async function fetchMunicipalTrees(bounds: Bounds, signal: AbortSignal,
  request: (url: URL) => Promise<MunicipalResponse>, maximumPages: number): Promise<TreeAreaData> {
  const url = new URL(GRONINGEN_TREES);
  // ArcGIS JSON exposes exceededTransferLimit reliably, unlike GeoJSON output.
  url.searchParams.set('f', 'json');
  url.searchParams.set('where', '1=1');
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('geometry', JSON.stringify({
    xmin: bounds.west, ymin: bounds.south, xmax: bounds.east, ymax: bounds.north,
    spatialReference: { wkid: 4326 },
  }));
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('outFields', 'OBJECTID,BOOMHOOGTE,BOOMSOORT,LATIJNSE_NAAM');
  url.searchParams.set('resultRecordCount', String(TREE_PAGE_SIZE));
  url.searchParams.set('orderByFields', 'OBJECTID ASC');
  const trees = new Map<string, TreeFeature>();
  let offset = 0, valid = true;
  const result = (status: DataCoverage, capped = false, failed = false): TreeAreaData =>
    ({ trees: [...trees.values()], status, source: 'groningen', capped, failed, requests: 0 });
  for (let page = 0; page < maximumPages; page++) {
    url.searchParams.set('resultOffset', String(offset));
    try {
      const payload = await request(new URL(url));
      if (signal.aborted) throw aborted(signal);
      if (!Array.isArray(payload.features)) throw new Error('Ongeldig resultaat van bomenkaart Groningen');
      const records = payload.features.slice(0, TREE_PAGE_SIZE);
      const parsed = parseMunicipalTrees({ features: records.map(feature => ({
        geometry: { type: 'Point', coordinates: [feature.geometry?.x, feature.geometry?.y] },
        properties: feature.attributes,
      })) });
      valid &&= parsed.length === records.length;
      const previousCount = trees.size;
      for (const tree of parsed) trees.set(tree.properties.id, tree);
      const more = payload.exceededTransferLimit === true
        || (payload.exceededTransferLimit !== false && records.length === TREE_PAGE_SIZE);
      if (payload.features.length > TREE_PAGE_SIZE) return result('partial', true);
      if (!more) return result(valid ? (trees.size ? 'complete' : 'empty') : 'partial');
      // An empty or repeated page cannot establish coverage, even if the
      // server keeps claiming there are more records.
      if (!records.length || trees.size === previousCount) return result('partial', true);
      offset += records.length;
    } catch (error) {
      if (signal.aborted) throw aborted(signal);
      if (!trees.size) throw error;
      return result('partial', false, true);
    }
  }
  return result('partial', true);
}

export async function fetchTrees(bounds: Bounds, signal: AbortSignal, maximumRequests = 6): Promise<TreeAreaData> {
  if (signal.aborted) throw aborted(signal);
  const values = [bounds.south, bounds.west, bounds.north, bounds.east].map((value, index) => {
    const scaled = value * 1_000_000;
    return ((index < 2 ? Math.floor(scaled) : Math.ceil(scaled)) / 1_000_000).toFixed(6);
  });
  const key = `terraszon:v5:trees:${values.join(':')}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { savedAt: number; data: TreeAreaData };
      if (parsed.data?.status === 'complete' && ['groningen', 'osm'].includes(parsed.data.source)
        && Array.isArray(parsed.data.trees) && parsed.data.trees.length && parsed.data.trees.length <= TREE_PAGE_SIZE * MAX_MUNICIPAL_PAGES
        && Number.isFinite(parsed.savedAt) && Date.now() - parsed.savedAt < CACHE_TTL) {
        return { ...parsed.data, requests: 0 };
      }
    }
  } catch { /* A blocked cache should not prevent loading trees. */ }

  let requests = 0;
  const save = (data: TreeAreaData): TreeAreaData => {
    if (signal.aborted) throw aborted(signal);
    const result = { ...data, requests };
    if (result.status === 'complete' && result.trees.length) {
      try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: result })); } catch { /* Cache is optional. */ }
    }
    return result;
  };
  if (intersectsGroningen(bounds) && maximumRequests > 0) {
    try {
      const municipal = await fetchMunicipalTrees({ south: Number(values[0]), west: Number(values[1]),
        north: Number(values[2]), east: Number(values[3]) }, signal, (url) => {
        requests++;
        return requestJSON<MunicipalResponse>(url, signal, 8_000);
      }, Math.min(MAX_MUNICIPAL_PAGES, maximumRequests));
      if (municipal.status !== 'empty') return save(municipal);
    } catch {
      if (signal.aborted) throw aborted(signal);
      // The worldwide OSM source remains available when the municipal service fails.
    }
  }

  const query = `[out:json][timeout:20];node["natural"="tree"](${values.join(',')});out body ${TREE_PAGE_SIZE + 1};`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal.aborted) throw aborted(signal);
    if (requests >= maximumRequests) break;
    try {
      requests++;
      const payload = await requestJSON<{ elements: TreeElement[]; remark?: string }>(endpoint, signal, 8_000,
        { method: 'POST', body: new URLSearchParams({ data: query }) });
      if (payload.remark || !Array.isArray(payload.elements)) throw new Error('Onvolledig Overpass-resultaat');
      const records = payload.elements.slice(0, TREE_PAGE_SIZE);
      const trees = parseTrees({ elements: records });
      const capped = payload.elements.length > TREE_PAGE_SIZE;
      return save({ trees, source: 'osm', status: capped || trees.length !== records.length ? 'partial' : trees.length ? 'complete' : 'empty',
        capped, failed: false, requests });
    } catch {
      if (signal.aborted) throw aborted(signal);
    }
  }
  return { trees: [], source: 'osm', status: 'failed', capped: false, failed: true, requests };
}
