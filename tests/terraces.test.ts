import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTerraceStatuses, fetchTerraces, parseOverpass } from '../src/terraces';
import type { TerraceFeature } from '../src/types';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const terrace: TerraceFeature = {
  type: 'Feature',
  properties: {
    id: 'node/1',
    name: 'Test',
    amenity: 'cafe',
    status: 'night',
    evidence: 'confirmed',
    osmType: 'node',
    osmId: 1,
  },
  geometry: { type: 'Point', coordinates: [6.5, 53.2] },
};

describe('terrace data', () => {
  it('parses nodes and way centers and skips entries without coordinates', () => {
    const result = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 53.2, lon: 6.5, tags: { name: 'Cafe', amenity: 'cafe' } },
        { type: 'way', id: 2, center: { lat: 53.21, lon: 6.51 }, tags: { amenity: 'restaurant' } },
        { type: 'relation', id: 3 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].properties.name).toBe('Cafe');
    expect(result[1].properties.name).toBe('Naamloze horecalocatie');
  });

  it('keeps the source parser focused on named cafe and restaurant records', () => {
    const result = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 53.2, lon: 6.5, tags: { name: 'Cafe', amenity: 'cafe', outdoor_seating: 'yes' } },
        { type: 'node', id: 2, lat: 53.21, lon: 6.51, tags: { name: 'Bar', amenity: 'bar', outdoor_seating: 'yes' } },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((feature) => feature.properties.amenity)).toEqual(['cafe', 'bar']);
  });

  it('parses broader horeca and separately mapped outdoor seating with useful details', () => {
    const result = parseOverpass({
      elements: [
        {
          type: 'way',
          id: 3,
          center: { lat: 53.2, lon: 6.5 },
          tags: {
            amenity: 'pub',
            name: 'De Zon',
            outdoor_seating: 'terrace',
            cuisine: 'dutch;burger',
            opening_hours: 'Mo-Su 10:00-22:00',
            website: 'https://example.test',
            'addr:street': 'Zonnestraat',
            'addr:housenumber': '4',
          },
        },
        {
          type: 'node',
          id: 4,
          lat: 53.201,
          lon: 6.501,
          tags: { leisure: 'outdoor_seating', capacity: '20', covered: 'yes' },
        },
      ],
    });
    expect(result[0].properties).toMatchObject({
      amenity: 'pub',
      evidence: 'confirmed',
      cuisine: 'dutch;burger',
      address: 'Zonnestraat 4',
    });
    expect(result[1].properties).toMatchObject({
      amenity: 'outdoor seating',
      evidence: 'mapped',
      capacity: '20',
    });
  });

  it('applies compact worker statuses by terrace id', () => {
    expect(applyTerraceStatuses([terrace], [{ id: 'node/1', status: 'shade' }])[0].properties.status)
      .toBe('shade');
    expect(applyTerraceStatuses([terrace], [{ id: 'node/1', status: 'night' }])[0].properties.status)
      .toBe('night');
  });

  it('begrenst de hele horeca-aanvraag wanneer response-bodies blijven hangen', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const check = expect(fetchTerraces({ south: 53.21, west: 6.56, north: 53.22, east: 6.58 }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(45_001);
    await check;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('cachet geen geannuleerd horecaresultaat als een late body alsnog voltooit', async () => {
    let finish: ((value: { elements: unknown[] }) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) }));
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    const controller = new AbortController();
    const pending = fetchTerraces({ south: 53.21, west: 6.56, north: 53.22, east: 6.58 }, controller.signal);
    const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeDefined());
    controller.abort(); await check;
    finish!({ elements: [] }); await Promise.resolve();
    expect(setItem).not.toHaveBeenCalled();
  });
});
