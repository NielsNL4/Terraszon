import { describe, expect, it, vi } from 'vitest';
import { createTreeViewLoader, missingTreeBounds, treeDataKey } from '../src/tree-loader';
import { parseTrees } from '../src/trees';

const view = { south: 53.21, north: 53.22, west: 6.56, east: 6.58 };
const trees = parseTrees({ elements: [{ type: 'node', id: 1, lat: 53.215, lon: 6.57, tags: { natural: 'tree', height: '10' } }] });
describe('boomdata met buffer', () => {
  it('hergebruikt bomen bij herhaald schuiven binnen het geladen gebied', async () => {
    const fetch = vi.fn().mockResolvedValue(trees);
    const load = createTreeViewLoader(fetch);
    const first = await load(view, new AbortController().signal);
    for (let i = 0; i < 20; i++) {
      const delta = i * 0.00005;
      const next = await load({ ...view, west: view.west + delta, east: view.east + delta }, new AbortController().signal);
      expect(treeDataKey(next)).toBe(treeDataKey(first));
    }
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('vraagt bij een nieuwe rand alleen ontbrekende stroken op en dedupliceert IDs', async () => {
    const fetch = vi.fn().mockResolvedValue(trees);
    const load = createTreeViewLoader(fetch);
    await load(view, new AbortController().signal);
    const moved = { ...view, west: 6.566, east: 6.586 };
    const next = await load(moved, new AbortController().signal);
    expect(next).toHaveLength(1);
    const newRequests = fetch.mock.calls.slice(1).map(([bounds]) => bounds);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests.every(bounds => bounds.west >= 6.585 - 0.000001 || bounds.east <= 6.555 + 0.000001
      || bounds.north <= 53.2075 + 0.000001 || bounds.south >= 53.2225 - 0.000001)).toBe(true);
  });
  it('bewaart de cache bij mislukte uitbreidingen', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(trees).mockRejectedValue(new Error('Timeout'));
    const load = createTreeViewLoader(fetch);
    const first = await load(view, new AbortController().signal);
    await expect(load({ ...view, east: 6.59 }, new AbortController().signal)).rejects.toThrow('Timeout');
    expect(await load(view, new AbortController().signal)).toEqual(first);
  });
  it('maakt voor een geheel gedekt gebied geen nieuwe query', () => {
    expect(missingTreeBounds(view, [view])).toEqual([]);
  });
});
