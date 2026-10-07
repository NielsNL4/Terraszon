import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTreeViewLoader, missingTreeBounds, treeDataKey } from '../src/tree-loader';
import { parseTrees, type TreeAreaData } from '../src/trees';

const view = { south: 53.21, north: 53.22, west: 6.56, east: 6.58 };
const trees = parseTrees({ elements: [{ type: 'node', id: 1, lat: 53.215, lon: 6.57, tags: { natural: 'tree', height: '10' } }] });
const data: TreeAreaData = { trees, status: 'complete', source: 'osm', capped: false, failed: false, requests: 1 };
afterEach(() => vi.useRealTimers());
describe('boomdata met buffer', () => {
  it('hergebruikt bomen bij herhaald schuiven binnen het geladen gebied', async () => {
    const fetch = vi.fn().mockResolvedValue(data);
    const load = createTreeViewLoader(fetch);
    const first = await load(view, new AbortController().signal);
    for (let i = 0; i < 20; i++) {
      const delta = i * 0.00005;
      const next = await load({ ...view, west: view.west + delta, east: view.east + delta }, new AbortController().signal);
      expect(treeDataKey(next.trees)).toBe(treeDataKey(first.trees));
    }
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('vraagt bij een nieuwe rand alleen ontbrekende stroken op en dedupliceert IDs', async () => {
    const fetch = vi.fn().mockResolvedValue(data);
    const load = createTreeViewLoader(fetch);
    await load(view, new AbortController().signal);
    const moved = { ...view, west: 6.566, east: 6.586 };
    const next = await load(moved, new AbortController().signal);
    expect(next.trees).toHaveLength(1);
    const newRequests = fetch.mock.calls.slice(1).map(([bounds]) => bounds);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests.every(bounds => bounds.west >= 6.585 - 0.000001 || bounds.east <= 6.555 + 0.000001
      || bounds.north <= 53.2075 + 0.000001 || bounds.south >= 53.2225 - 0.000001)).toBe(true);
  });
  it('bewaart de cache bij mislukte uitbreidingen', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(data).mockRejectedValue(new Error('Timeout'));
    const load = createTreeViewLoader(fetch);
    const first = await load(view, new AbortController().signal);
    const failed = await load({ ...view, east: 6.59 }, new AbortController().signal);
    expect(failed).toMatchObject({ status: 'partial', trees });
    expect(failed.failedAreas).toBeGreaterThan(0);
    expect(await load(view, new AbortController().signal)).toEqual(first);
  });
  it('maakt voor een geheel gedekt gebied geen nieuwe query', () => {
    expect(missingTreeBounds(view, [view])).toEqual([]);
  });

  it('probeert gedeeltelijke dekking opnieuw in plaats van het hele gebied als geladen te onthouden', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ...data, status: 'partial' }).mockResolvedValue(data);
    const load = createTreeViewLoader(fetch);
    expect((await load(view, new AbortController().signal)).status).toBe('partial');
    expect((await load(view, new AbortController().signal)).status).toBe('complete');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('behoudt eerdere records wanneer een gedeeltelijke herpoging minder bomen bevat', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ...data, status: 'partial' })
      .mockResolvedValueOnce({ ...data, status: 'partial', trees: [], failed: true });
    const load = createTreeViewLoader(fetch);
    await load(view, new AbortController().signal);
    expect(await load(view, new AbortController().signal)).toMatchObject({ status: 'partial', failedAreas: 1, trees });
  });

  it('splitst afgekapt gebied en gebruikt volledige kinderen als dekking', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ...data, status: 'partial', capped: true }).mockResolvedValue(data);
    const load = createTreeViewLoader(fetch);
    expect(await load(view, new AbortController().signal)).toMatchObject({ status: 'complete', capped: false, trees });
    expect(fetch).toHaveBeenCalledTimes(3);
    await load(view, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('behoudt succesvolle kinderen bij een mislukte deelquery en vraagt alleen ontbrekende dekking opnieuw', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ...data, status: 'partial', capped: true })
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce({ ...data, status: 'failed', trees: [], failed: true })
      .mockResolvedValue(data);
    const load = createTreeViewLoader(fetch);
    expect(await load(view, new AbortController().signal)).toMatchObject({ status: 'partial', failedAreas: 1, trees });
    expect((await load(view, new AbortController().signal)).status).toBe('complete');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[3][0]).toEqual(fetch.mock.calls[2][0]);
  });

  it('begrenst vervolgqueries zonder gedeeltelijk gebied als volledig te markeren', async () => {
    const fetch = vi.fn().mockResolvedValue({ ...data, status: 'partial', capped: true });
    const load = createTreeViewLoader(fetch, { maximumRequests: 5, maximumDepth: 8 });
    expect(await load(view, new AbortController().signal)).toMatchObject({ status: 'partial', capped: true });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('onthoudt volledige lege gebieden kort en probeert ze daarna opnieuw', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue({ ...data, trees: [], status: 'empty' });
    const load = createTreeViewLoader(fetch);
    expect((await load(view, new AbortController().signal)).status).toBe('empty');
    await load(view, new AbortController().signal);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_001);
    await load(view, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('scheidt meer dan 1.000 opgehaalde bomen van het renderbudget en kiest zichtbare bomen vóór bufferbomen', async () => {
    const many = parseTrees({ elements: Array.from({ length: 1_001 }, (_, id) => ({
      type: 'node', id, lat: id === 1_000 ? 53.2099 : 53.215, lon: 6.57, tags: { natural: 'tree' },
    })) });
    const load = createTreeViewLoader(vi.fn().mockResolvedValue({ ...data, trees: many }));
    const result = await load(view, new AbortController().signal);
    expect(result).toMatchObject({ status: 'complete', renderLimited: true, capped: false });
    expect(result.trees).toHaveLength(1_000);
    expect(result.trees.some(tree => tree.properties.id === 'tree/1000')).toBe(false);
  });
});
