import type { TerraceFeature, TerraceStatusResult } from './types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 'v2';
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
  const values = [bounds.south, bounds.west, bounds.north, bounds.east]
    .map((value) => value.toFixed(2));
  return `terraszon:${CACHE_VERSION}:terraces:${values.join(':')}`;
}

export function parseOverpass(data: OverpassResponse): TerraceFeature[] {
  return data.elements.flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (latitude === undefined || longitude === undefined) return [];

    return [{
      type: 'Feature' as const,
      properties: {
        id: `${element.type}/${element.id}`,
        name: element.tags?.name ?? 'Naamloos terras',
        amenity: element.tags?.amenity ?? 'horeca',
        status: 'night' as const,
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

  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:20];nwr["amenity"~"^(cafe|restaurant)$"]["outdoor_seating"="yes"](${bbox});out center tags;`;
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
      features = parseOverpass(await response.json() as OverpassResponse);
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
