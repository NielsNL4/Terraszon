import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildingLoader, MAX_FETCHED_BUILDINGS } from '../src/building-loader';

const bounds = { south: 53.211, west: 6.563, north: 53.213, east: 6.567 };
const building = (id: number, west = 6.561) => ({ type: 'way', id, tags: { building: 'house' }, geometry: [
  { lon: west, lat: 53.211 }, { lon: west + 0.0001, lat: 53.211 },
  { lon: west + 0.0001, lat: 53.2111 }, { lon: west, lat: 53.2111 }, { lon: west, lat: 53.211 },
] });
const cappedElements = () => [building(1), ...Array.from({ length: MAX_FETCHED_BUILDINGS }, (_, id) => ({ type: 'way', id: id + 100 }))];
const response = (elements: unknown[]) => ({ ok: true, json: async () => ({ elements }) });
function setup() {
  const fetch = vi.fn();
  const records = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => records.set(key, value));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('localStorage', { getItem: (key: string) => records.get(key) ?? null, setItem });
  return { fetch, setItem };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('adaptieve gebouwdekking', () => {
  it('splitst een afgekapt batch eerst in afzonderlijke cellen en cachet de complete resultaten', async () => {
    const { fetch, setItem } = setup();
    fetch.mockResolvedValueOnce(response(cappedElements()))
      .mockResolvedValueOnce(response([building(1)]))
      .mockResolvedValueOnce(response([building(2, 6.581)]));
    const load = createBuildingLoader();
    const view = { ...bounds, west: 6.5799, east: 6.5801 };
    const result = await load(view, new AbortController().signal);
    expect(result).toMatchObject({ status: 'complete', capped: false, completeAreas: 2, partialAreas: 0, failedAreas: 0 });
    expect(result.buildings.map(feature => feature.properties.id).sort()).toEqual(['way/1', 'way/2']);
    expect(fetch).toHaveBeenCalledTimes(3);
    const queries = fetch.mock.calls.map(([url]) => url.searchParams.get('data'));
    expect(queries[0]).toContain('53.210000,6.560000,53.220000,6.600000');
    expect(queries[1]).toContain('53.210000,6.560000,53.220000,6.580000');
    expect(queries[2]).toContain('53.210000,6.580000,53.220000,6.600000');
    expect(setItem.mock.calls.every(([, value]) => JSON.parse(value).status === 'complete')).toBe(true);
    await load(view, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('splitst een te dichte cel ruimtelijk zonder footprintgeometrie af te snijden', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValueOnce(response(cappedElements()))
      .mockResolvedValueOnce(response([building(1)]))
      .mockResolvedValueOnce(response([building(2, 6.571)]));
    const load = createBuildingLoader();
    expect(await load(bounds, new AbortController().signal)).toMatchObject({ status: 'complete', completeAreas: 1, capped: false });
    const queries = fetch.mock.calls.map(([url]) => url.searchParams.get('data'));
    expect(queries[1]).toContain('53.210000,6.560000,53.220000,6.570000');
    expect(queries[2]).toContain('53.210000,6.570000,53.220000,6.580000');
    expect(queries.every(query => /out geom \d+;/.test(query))).toBe(true);
  });

  it('bewaart gedeeltelijke records en succesvolle kinderen bij fouten, zonder de oudercel compleet te cachen', async () => {
    const { fetch, setItem } = setup();
    let recover = false;
    fetch.mockImplementation(async (url: URL) => {
      const query = url.searchParams.get('data')!;
      if (query.includes('53.210000,6.560000,53.220000,6.580000')) return response(cappedElements());
      if (query.includes('53.210000,6.560000,53.220000,6.570000')) return response([building(1)]);
      if (recover) return response([building(2, 6.571)]);
      throw new Error('Deelgebied niet bereikbaar');
    });
    const load = createBuildingLoader();
    const partial = await load(bounds, new AbortController().signal);
    expect(partial).toMatchObject({ status: 'partial', completeAreas: 0, partialAreas: 1, failedAreas: 1 });
    expect(partial.buildings).toHaveLength(1);
    expect(setItem.mock.calls.every(([key]) => !key.endsWith('53.210000:6.560000:53.220000:6.580000'))).toBe(true);
    const calls = fetch.mock.calls.length;
    recover = true;
    const full = await load(bounds, new AbortController().signal);
    expect(full).toMatchObject({ status: 'complete', completeAreas: 1, failedAreas: 0, capped: false });
    expect(full.buildings).toHaveLength(2);
    expect(fetch.mock.calls.slice(calls).some(([url]) => url.searchParams.get('data')!.includes('53.210000,6.560000,53.220000,6.570000'))).toBe(false);
  });

  it('rapporteert succesvolle en mislukte cellen afzonderlijk na een afgekapt batch', async () => {
    const { fetch } = setup();
    fetch.mockImplementation(async (url: URL) => {
      const query = url.searchParams.get('data')!;
      if (query.includes('53.210000,6.560000,53.220000,6.600000')) return response(cappedElements());
      if (query.includes('53.210000,6.560000,53.220000,6.580000')) return response([building(1)]);
      throw new Error('Andere cel niet bereikbaar');
    });
    const load = createBuildingLoader();
    expect(await load({ ...bounds, west: 6.5799, east: 6.5801 }, new AbortController().signal))
      .toMatchObject({ status: 'partial', completeAreas: 1, failedAreas: 1, loadedAreas: 2, totalAreas: 2 });
  });

  it('begrenst vervolgqueries en houdt bruikbare records zichtbaar zonder volledige dekking te claimen', async () => {
    const { fetch, setItem } = setup();
    fetch.mockResolvedValue(response(cappedElements()));
    const load = createBuildingLoader({ maximumRefinements: 2, maximumDepth: 8 });
    expect(await load(bounds, new AbortController().signal))
      .toMatchObject({ status: 'partial', capped: true, completeAreas: 0, partialAreas: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('onthoudt volledige leegte kort in geheugen, maar niet 24 uur in permanente opslag', async () => {
    vi.useFakeTimers();
    const { fetch, setItem } = setup();
    fetch.mockResolvedValue(response([]));
    const load = createBuildingLoader();
    expect(await load(bounds, new AbortController().signal)).toMatchObject({ status: 'empty', completeAreas: 1, emptyAreas: 1 });
    await load(bounds, new AbortController().signal);
    expect(fetch).toHaveBeenCalledOnce();
    expect(setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_001);
    await load(bounds, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('past geen resultaat of cache toe als een vervolgquery na annuleren alsnog antwoordt', async () => {
    const { fetch, setItem } = setup();
    let finish: ((value: ReturnType<typeof response>) => void) | undefined;
    fetch.mockResolvedValueOnce(response(cappedElements()))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const load = createBuildingLoader();
    const controller = new AbortController(), progress = vi.fn();
    const pending = load(bounds, controller.signal, progress);
    const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(finish).toBeDefined());
    const progressCalls = progress.mock.calls.length;
    controller.abort();
    await check;
    finish!(response([building(1)]));
    await Promise.resolve();
    expect(setItem).not.toHaveBeenCalled();
    expect(progress.mock.calls).toHaveLength(progressCalls);
  });

  it('behoudt al ontvangen records wanneer een vervolgquery de totale deadline overschrijdt', async () => {
    vi.useFakeTimers();
    const { fetch } = setup();
    fetch.mockResolvedValueOnce(response(cappedElements())).mockImplementation(() => new Promise(() => {}));
    const load = createBuildingLoader({ deadline: 100 });
    const progress = vi.fn();
    const pending = load(bounds, new AbortController().signal, progress);
    await vi.advanceTimersByTimeAsync(101);
    const result = await pending;
    expect(result).toMatchObject({ status: 'partial', completeAreas: 0, failedAreas: 1 });
    expect(result.buildings.map(feature => feature.properties.id)).toEqual(['way/1']);
    expect(progress.mock.calls.some(([data]) => data.status === 'partial' && data.buildings.length === 1)).toBe(true);
  });

  it('vervangt voorlopige records door het uiteindelijke complete resultaat', async () => {
    const { fetch } = setup();
    fetch.mockResolvedValueOnce(response(cappedElements()))
      .mockResolvedValueOnce(response([building(2)]))
      .mockResolvedValueOnce(response([building(3, 6.571)]));
    const load = createBuildingLoader(), progress = vi.fn();
    const result = await load(bounds, new AbortController().signal, progress);
    expect(progress.mock.calls.some(([data]) => data.buildings.some((feature: { properties: { id: string } }) => feature.properties.id === 'way/1'))).toBe(true);
    expect(result.status).toBe('complete');
    expect(result.buildings.map(feature => feature.properties.id).sort()).toEqual(['way/2', 'way/3']);
  });
});
