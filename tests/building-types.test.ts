import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildingContains, fetchBuildings, MAX_FETCHED_BUILDINGS, parseBuildings, withTileHeights } from '../src/building-types';
import { prepareShadowPolygons, shadowVector } from '../src/shadows';

afterEach(() => vi.unstubAllGlobals());

const ring = (west = 6, south = 53, size = 0.001) => [
  { lon: west, lat: south }, { lon: west + size, lat: south },
  { lon: west + size, lat: south + size }, { lon: west, lat: south + size }, { lon: west, lat: south },
];
const bounds = { south: 53.21, west: 6.56, north: 53.23, east: 6.58 };

describe('afzonderlijke OSM-gebouwen', () => {
  it('houdt gebouwen los, ook als de kaarttegel ze onder één ID samenvoegt', () => {
    const buildings = parseBuildings({ elements: [
      { type: 'way', id: 1, tags: { building: 'house' }, geometry: ring() },
      { type: 'way', id: 2, tags: { building: 'retail', height: '14 m' }, geometry: ring(6.002) },
    ] });
    const tiles = [{
      geometry: { type: 'MultiPolygon' as const, coordinates: buildings.map((building) =>
        building.geometry.type === 'Polygon' ? building.geometry.coordinates : building.geometry.coordinates[0]) },
      properties: { render_height: 8, render_min_height: 0 },
    }];
    const colored = withTileHeights(buildings, tiles);
    expect(colored.map((building) => building.properties.id)).toEqual(['way/1', 'way/2']);
    expect(colored.map((building) => building.properties.buildingType)).toEqual(['house', 'retail']);
    expect(colored.map((building) => building.properties.height)).toEqual([8, 14]);
    expect(prepareShadowPolygons(colored).map((polygon) => polygon.height)).toEqual([8, 14]);
    expect(shadowVector(colored[1].properties.height, 45, 180)?.length).toBeCloseTo(14);
    expect(buildings[0].properties.height).toBe(9); // cached data is not mutated
  });

  it('leest niveaus, dakhoogte en verhoogde gebouwonderdelen en erft het type', () => {
    const buildings = parseBuildings({ elements: [
      { type: 'way', id: 1, tags: { building: 'church', 'building:levels': '3', 'roof:height': '4,5' }, geometry: ring() },
      { type: 'way', id: 2, tags: { 'building:part': 'yes', height: '34', min_height: '10' }, geometry: ring(6.0002, 53.0002, 0.0002) },
      { type: 'way', id: 3, tags: { building: 'no' }, geometry: ring(6.002) },
      { type: 'way', id: 4, tags: { building: 'house' }, geometry: ring().slice(0, 3) },
      { type: 'way', id: 5, tags: { building: 'house' }, geometry: [{ lon: NaN, lat: 53 }] },
    ] });
    expect(buildings).toHaveLength(2);
    expect(buildings[0].properties.height).toBe(13.5);
    expect(buildings[1].properties).toMatchObject({ buildingType: 'church', height: 34, minHeight: 10, isPart: true });
  });

  it('assembleert multipolygonen uit omgekeerde segmenten, behoudt binnenplaatsen en voorkomt dubbele outlines', () => {
    const outer = ring(), hole = ring(6.0002, 53.0002, 0.0002);
    const buildings = parseBuildings({ elements: [
      { type: 'way', id: 1, tags: { building: 'yes' }, geometry: outer },
      { type: 'relation', id: 8, tags: { building: 'university', type: 'multipolygon' }, members: [
        { type: 'way', ref: 1, role: 'outer', geometry: outer.slice(0, 3) },
        { type: 'way', ref: 2, role: 'outer', geometry: outer.slice(2).reverse() },
        { type: 'way', ref: 3, role: 'inner', geometry: hole },
        { type: 'way', ref: 4, role: 'outer', geometry: ring(6.002) },
      ] },
    ] });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].properties).toMatchObject({ id: 'relation/8', buildingType: 'university' });
    expect(buildings[0].geometry.type).toBe('MultiPolygon');
    expect(buildingContains(buildings[0], [6.0001, 53.0001])).toBe(true);
    expect(buildingContains(buildings[0], [6.0003, 53.0003])).toBe(false);
    expect(buildingContains(buildings[0], [6.0025, 53.0005])).toBe(true);
    expect(parseBuildings({ elements: [{ type: 'relation', id: 9,
      tags: { type: 'multipolygon', building: 'school' },
      members: [{ type: 'way', ref: 10, role: 'outer' }],
    }] })).toEqual([]);
  });
});

describe('gebouwdata laden', () => {
  function setup(elements: unknown[], remark?: string) {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements, remark }) });
    const storage = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem });
    return { fetchMock, setItem };
  }

  it('vraagt contouren, relaties en onderdelen op en hergebruikt de cache', async () => {
    const { fetchMock, setItem } = setup([
      { type: 'way', id: 1, tags: { building: 'house' }, geometry: ring() },
    ]);
    const result = await fetchBuildings(bounds, new AbortController().signal);
    const query = fetchMock.mock.calls[0][1].body.get('data');
    expect(query).toContain('way["building"](53.2100,6.5600,53.2300,6.5800)');
    expect(query).toContain('relation["building"]["type"="multipolygon"]');
    expect(query).toContain('way["building:part"]');
    expect(query).toContain('[maxsize:67108864]');
    expect(query).toContain(`out geom ${MAX_FETCHED_BUILDINGS + 1}`);
    expect(result.buildings[0].properties.buildingType).toBe('house');
    expect(setItem).toHaveBeenCalledOnce();
    expect(await fetchBuildings(bounds, new AbortController().signal)).toEqual(result);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('geeft afgekapt, leeg of onvolledig resultaat niet door als een volledig gecachet gebied', async () => {
    let mocks = setup(Array.from({ length: MAX_FETCHED_BUILDINGS + 1 }, (_, id) => ({ type: 'way', id })));
    expect(await fetchBuildings(bounds, new AbortController().signal)).toEqual({ buildings: [], capped: true });
    expect(mocks.setItem).not.toHaveBeenCalled();
    mocks = setup([]);
    expect(await fetchBuildings(bounds, new AbortController().signal)).toEqual({ buildings: [], capped: false });
    expect(mocks.setItem).not.toHaveBeenCalled();
    mocks = setup([], 'runtime error: Query timed out');
    await expect(fetchBuildings(bounds, new AbortController().signal)).rejects.toThrow('Onvolledig');
    expect(mocks.setItem).not.toHaveBeenCalled();
  });

  it('valt terug op de volgende server en negeert een geannuleerde aanvraag', async () => {
    const { fetchMock, setItem } = setup([
      { type: 'way', id: 1, tags: { building: 'house' }, geometry: ring() },
    ]);
    fetchMock.mockRejectedValueOnce(new Error('Server niet beschikbaar'));
    expect((await fetchBuildings(bounds, new AbortController().signal)).buildings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = new AbortController();
    request.abort();
    await expect(fetchBuildings(bounds, request.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(setItem).toHaveBeenCalledOnce();
  });
});
