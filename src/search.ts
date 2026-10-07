const PHOTON_URL = 'https://photon.komoot.io/api/';

export type SearchResult = {
  coordinates: [number, number];
  label: string;
  detail: string;
  kind: 'street' | 'place' | 'address';
  osm?: { type: 'node' | 'way' | 'relation'; id: number };
};

type PhotonFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseSearchResults(data: unknown): SearchResult[] {
  if (!data || typeof data !== 'object' || !('features' in data)
    || !Array.isArray(data.features)) return [];

  return (data.features as PhotonFeature[]).flatMap((feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)
      || coordinates.length < 2 || typeof coordinates[0] !== 'number'
      || typeof coordinates[1] !== 'number' || !Number.isFinite(coordinates[0])
      || !Number.isFinite(coordinates[1]) || Math.abs(coordinates[0]) > 180
      || Math.abs(coordinates[1]) > 90) return [];

    const properties = feature.properties ?? {};
    const name = text(properties.name) || text(properties.street) || text(properties.city);
    if (!name) return [];
    const house = text(properties.housenumber);
    const street = text(properties.street);
    const label = house ? `${street || name} ${house}` : name;
    const detail = [house && street && name !== street ? name : '', properties.postcode, properties.city, properties.state, properties.country]
      .map(text)
      .filter((part, index, parts) => part && part !== label && parts.indexOf(part) === index)
      .join(', ');
    const kind = house ? 'address' : street ? 'street' : 'place';
    const rawType = text(properties.osm_type);
    const osmType = rawType === 'N' || rawType === 'node' ? 'node'
      : rawType === 'W' || rawType === 'way' ? 'way' : rawType === 'R' || rawType === 'relation' ? 'relation' : undefined;
    const rawId = properties.osm_id;
    const osmId = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    const osm: SearchResult['osm'] = osmType && Number.isSafeInteger(osmId) && osmId > 0 ? { type: osmType, id: osmId } : undefined;
    return [{ coordinates: [coordinates[0], coordinates[1]] as [number, number], label, detail, kind, ...(osm ? { osm } : {}) }];
  });
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Photon gaf status ${response.status}`);
  return parseSearchResults(await response.json());
}
