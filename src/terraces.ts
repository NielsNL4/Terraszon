import type { FeatureCollection, MultiPolygon } from 'geojson';
import { isPointInShadows } from './shadows';
import type { TerraceFeature } from './types';

const OVERPASS_ENDPOINT = 'https://overpass.private.coffee/api/interpreter';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 'v2';

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
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!response.ok) throw new Error(`Overpass gaf status ${response.status}`);

  const features = parseOverpass(await response.json() as OverpassResponse);
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), features }));
  } catch {
    // A full or blocked cache should not hide fresh results.
  }
  return features;
}

export function classifyTerraces(
  terraces: TerraceFeature[],
  shadows: FeatureCollection<MultiPolygon>,
  isDaylight: boolean,
): TerraceFeature[] {
  return terraces.map((terrace) => ({
    ...terrace,
    properties: {
      ...terrace.properties,
      status: !isDaylight
        ? 'night'
        : isPointInShadows(terrace.geometry, shadows) ? 'shade' : 'sun',
    },
  }));
}
