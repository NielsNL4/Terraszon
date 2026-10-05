import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildingContains, mergeBuildingGeometry, parseBuildings, withTileHeights } from '../src/building-types';
import { buildingAreas, createBuildingLoader, MAX_FETCHED_BUILDINGS } from '../src/building-loader';
import { prepareShadowPolygons, shadowVector } from '../src/shadows';

afterEach(() => vi.unstubAllGlobals());
let fetchBuildings = createBuildingLoader();
beforeEach(() => { fetchBuildings = createBuildingLoader(); });

const ring = (west = 6, south = 53, size = 0.001) => [
  { lon: west, lat: south }, { lon: west + size, lat: south },
  { lon: west + size, lat: south + size }, { lon: west, lat: south + size }, { lon: west, lat: south },
];
const bounds = { south: 53.211, west: 6.563, north: 53.213, east: 6.567 };

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

  it('houdt niet-geladen tegelgebouwen zichtbaar zonder een kleur aan een gedeeld tegel-ID te hangen', () => {
    const known = parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: 'church', height: '34' }, geometry: ring() }] });
    const fallback = parseBuildings({ elements: [
      { type: 'way', id: 11, tags: { building: 'yes', height: '34' }, geometry: ring() },
      { type: 'way', id: 12, tags: { building: 'yes', height: '5' }, geometry: ring(6.002) },
      { type: 'way', id: 13, tags: { building: 'yes', height: '97' }, geometry: ring(6.0002, 53.0002, 0.0002) },
    ] });
    const result = mergeBuildingGeometry(known, fallback);
    expect(result.map(b => [b.properties.id, b.properties.buildingType, b.properties.height])).toEqual([
      ['way/1', 'church', 34], ['way/12', 'yes', 5], ['way/13', 'church', 97],
    ]);
    expect(fallback[2].properties.buildingType).toBe('yes');
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
    const query = fetchMock.mock.calls[0][0].searchParams.get('data');
    expect(query).toContain('way["building"](53.2100,6.5600,53.2200,6.5800)');
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
    expect(await fetchBuildings(bounds, new AbortController().signal)).toMatchObject({ buildings: [], capped: true });
    expect(mocks.setItem).not.toHaveBeenCalled();
    mocks = setup([]);
    expect(await fetchBuildings(bounds, new AbortController().signal)).toMatchObject({ buildings: [], capped: false });
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

  it('laadt op een groot scherm meer dan 20.000 gebouwen zonder alle kleuren weg te gooien', async () => {
    const big = { south: 53.2121, west: 6.5366, north: 53.2355, east: 6.5870 };
    const { fetchMock } = setup([]);
    let call = 0;
    const geometry = ring();
    fetchMock.mockImplementation(async () => {
      const start = call++ * 10_000;
      return { ok: true, json: async () => ({ elements: Array.from({ length: 8_400 }, (_, id) => ({
        type: 'way', id: start + id + 1, tags: { building: 'house' }, geometry,
      })) }) };
    });
    const progress = vi.fn();
    const result = await fetchBuildings(big, new AbortController().signal, progress);
    expect(result.buildings.length).toBeGreaterThan(20_000);
    expect(result.capped).toBe(false);
    expect(result.failedAreas).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(buildingAreas(big).length / 4));
    expect(progress.mock.calls[0][0].buildings).toHaveLength(8_400);
    expect(progress.mock.calls[0][0].loadedAreas).toBeLessThan(result.totalAreas);
  });

  it('dedupliceert grensgebouwen en hergebruikt dezelfde cellen na een kleine kaartbeweging, ook bij volle opslag', async () => {
    const { fetchMock } = setup([{ type: 'way', id: 77, tags: { building: 'retail' }, geometry: ring(6.5799, 53.211, 0.0002) }]);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } });
    const view = { south: 53.211, west: 6.5799, north: 53.213, east: 6.5801 };
    const result = await fetchBuildings(view, new AbortController().signal);
    expect(result.buildings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await fetchBuildings({ ...view, west: 6.5798, east: 6.5802 }, new AbortController().signal)).buildings).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('behoudt succesvolle gebieden wanneer een ander gebied time-outs geeft', async () => {
    const { fetchMock } = setup([]);
    fetchMock.mockImplementation(async (url) => {
      const query = url.searchParams.get('data');
      if (query.includes('53.2100,6.5600,53.2200,6.6400')) return { ok: true, json: async () => ({ elements: [
        { type: 'way', id: 1, tags: { building: 'house' }, geometry: ring() },
      ] }) };
      throw new DOMException('The operation was aborted', 'AbortError');
    });
    const progress = vi.fn();
    const result = await fetchBuildings({ ...bounds, west: 6.55, east: 6.65 }, new AbortController().signal, progress);
    expect(result.buildings).toHaveLength(1);
    expect(result.failedAreas).toBeGreaterThan(0);
    expect(result.loadedAreas).toBe(result.totalAreas);
    expect(progress.mock.calls.some(([data]) => data.buildings.length === 1 && data.loadedAreas < data.totalAreas)).toBe(true);
  });

  it('breekt actieve deelqueries af en past geen verouderde voortgang toe na kaartbeweging', async () => {
    const { fetchMock, setItem } = setup([]);
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Afgebroken', 'AbortError')));
    }));
    const request = new AbortController(), progress = vi.fn();
    const pending = fetchBuildings(bounds, request.signal, progress);
    request.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
