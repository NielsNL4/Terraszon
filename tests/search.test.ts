import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSearchResults, searchPlaces } from '../src/search';

afterEach(() => vi.unstubAllGlobals());

describe('locaties zoeken', () => {
  it('verwerkt wereldwijde Photon-resultaten en negeert ongeldige coördinaten', () => {
    expect(parseSearchResults({ features: [
      { geometry: { type: 'Point', coordinates: [6.56, 53.21] }, properties: { name: 'Grote Markt', housenumber: '1', city: 'Groningen', country: 'Nederland' } },
      { geometry: { type: 'Point', coordinates: [6.567, 53.218] }, properties: { name: 'Groningen City Hall', street: 'Grote Markt', housenumber: '1', city: 'Groningen', country: 'Netherlands' } },
      { geometry: { type: 'Point', coordinates: [2.35, 48.86] }, properties: { name: 'Paris', country: 'France' } },
      { geometry: { type: 'Point', coordinates: [999, 53] }, properties: { name: 'Ongeldig' } },
    ] })).toEqual([
      { coordinates: [6.56, 53.21], label: 'Grote Markt 1', detail: 'Groningen, Nederland', kind: 'address' },
      { coordinates: [6.567, 53.218], label: 'Grote Markt 1', detail: 'Groningen City Hall, Groningen, Netherlands', kind: 'address' },
      { coordinates: [2.35, 48.86], label: 'Paris', detail: 'France', kind: 'place' },
    ]);
  });

  it('gebruikt een begrensde Photon-query en geeft een serverfout door', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await expect(searchPlaces('Groningen', controller.signal)).resolves.toEqual([]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.searchParams.get('q')).toBe('Groningen');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(options.signal).toBe(controller.signal);
    await expect(searchPlaces('Groningen', controller.signal)).rejects.toThrow('Photon gaf status 429');
  });

  it('verzint geen OSM-identiteit bij ongeldige geocodermetadata', () => {
    const results = parseSearchResults({ features: [
      { geometry: { type: 'Point', coordinates: [6.57, 53.21] }, properties: { name: 'A', osm_type: 'constructor', osm_id: 42 } },
      { geometry: { type: 'Point', coordinates: [6.57, 53.21] }, properties: { name: 'B', osm_type: 'N', osm_id: true } },
      { geometry: { type: 'Point', coordinates: [6.57, 53.21] }, properties: { name: 'C', osm_type: 'W', osm_id: { valueOf: 0, toString: 0 } } },
    ] });
    expect(results).toHaveLength(3);
    expect(results.every(result => result.osm === undefined)).toBe(true);
  });
});
