import type { TerraceEvidence, TerraceFeature, TerraceStatusResult } from './types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 'v3';
const REQUEST_TIMEOUT = 8_000;

type Bounds = { south: number; west: number; north: number; east: number };

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

function cacheKey(bounds: Bounds): string {
  const values = normalizedBounds(bounds);
  return `terraszon:${CACHE_VERSION}:terraces:${values.join(':')}`;
}

function normalizedBounds(bounds: Bounds): string[] {
  return [bounds.south, bounds.west, bounds.north, bounds.east]
    .map((value) => value.toFixed(4));
}

function value(tags: Record<string, string> | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const result = tags?.[key]?.trim();
    if (result) return result;
  }
  return undefined;
}

function address(tags: Record<string, string> | undefined): string | undefined {
  const street = value(tags, 'addr:street');
  const house = value(tags, 'addr:housenumber');
  const postcode = value(tags, 'addr:postcode');
  const city = value(tags, 'addr:city');
  const line = [street && house ? `${street} ${house}` : street ?? house, postcode, city]
    .filter(Boolean)
    .join(', ');
  return line || undefined;
}

function evidenceFor(tags: Record<string, string> | undefined): TerraceEvidence {
  if (tags?.leisure === 'outdoor_seating') return 'mapped';
  const seating = tags?.outdoor_seating?.toLowerCase();
  return seating && seating !== 'no' ? 'confirmed' : 'possible';
}

function isVenue(element: OverpassElement): boolean {
  return Boolean(element.tags?.amenity || element.tags?.leisure === 'outdoor_seating');
}

export function parseOverpass(data: OverpassResponse): TerraceFeature[] {
  const seen = new Set<string>();
  return data.elements.flatMap((element) => {
    if (!isVenue(element)) return [];
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude === undefined || longitude === undefined) return [];
    const id = `${element.type}/${element.id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const tags = element.tags;

    return [{
      type: 'Feature' as const,
      properties: {
        id,
        name: value(tags, 'name', 'brand') ?? 'Naamloze horecalocatie',
        amenity: tags?.amenity ?? 'outdoor seating',
        status: 'night' as const,
        evidence: evidenceFor(tags),
        cuisine: value(tags, 'cuisine'),
        openingHours: value(tags, 'opening_hours'),
        website: value(tags, 'website', 'contact:website'),
        phone: value(tags, 'phone', 'contact:phone'),
        address: address(tags),
        wheelchair: value(tags, 'wheelchair'),
        capacity: value(tags, 'capacity:outdoor', 'capacity'),
        covered: value(tags, 'covered'),
        outdoorSeating: value(tags, 'outdoor_seating'),
        seasonal: value(tags, 'seasonal'),
        osmType: element.type,
        osmId: element.id,
      },
      geometry: { type: 'Point' as const, coordinates: [longitude, latitude] },
    }];
  });
}

export async function fetchTerraces(bounds: Bounds, signal?: AbortSignal): Promise<TerraceFeature[]> {
  const key = cacheKey(bounds);
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { savedAt: number; features: TerraceFeature[] };
      if (Date.now() - parsed.savedAt < CACHE_TTL) return parsed.features;
    }
  } catch {
    // Storage can be unavailable in privacy modes; the network path still works.
  }

  const [south, west, north, east] = normalizedBounds(bounds);
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:20];(nwr["amenity"~"^(bar|biergarten|cafe|fast_food|food_court|ice_cream|pub|restaurant)$"]["outdoor_seating"!~"^no$"](${bbox});nwr["leisure"="outdoor_seating"](${bbox}););out center tags;`;
  let lastError: unknown;
  let features: TerraceFeature[] | undefined;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT);
    const abortFromCaller = () => timeoutController.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: timeoutController.signal,
      });
      if (!response.ok) throw new Error(`${endpoint} gaf status ${response.status}`);
       const payload = await response.json() as OverpassResponse & { remark?: string };
       if (payload.remark) throw new Error(`Onvolledig Overpass-resultaat: ${payload.remark}`);
       features = parseOverpass(payload);
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (!features) throw lastError instanceof Error ? lastError : new Error('Geen Overpass-server beschikbaar');
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), features }));
  } catch {
    // A full or blocked cache should not hide fresh results.
  }
  return features;
}

export function applyTerraceStatuses(
  terraces: TerraceFeature[],
  statuses: TerraceStatusResult[],
): TerraceFeature[] {
  const statusById = new Map(statuses.map(({ id, status }) => [id, status]));
  return terraces.map((terrace) => ({
    ...terrace,
    properties: {
      ...terrace.properties,
      status: statusById.get(terrace.properties.id) ?? terrace.properties.status,
    },
  }));
}
