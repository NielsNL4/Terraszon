import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMunicipalTrees, parseTrees, fetchTrees, type TreeAreaData } from '../src/trees';
import { decodeTreeCache, encodeTreeCache, retireLegacyTreeCache, type TreeCacheStore } from '../src/tree-cache';
import { treeDataKey } from '../src/tree-profiles';
import { prepareTreeObstacles, possibleTreeShade } from '../src/tree-shadows';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const trees = parseMunicipalTrees({ features: Array.from({ length: 200 }, (_, i) => ({ id: i,
  geometry: { type: 'Point', coordinates: [6.56 + i * 0.000001, 53.21] },
  properties: { OBJECTID: i, BOOMHOOGTE: '12 tot 15 m.', LATIJNSE_NAAM: 'Tilia x europaea' } })) });
const data: TreeAreaData = { trees, source: 'groningen', status: 'complete', capped: false, failed: false, requests: 2 };
describe('compacte boomcache', () => {
  it('bewaart alle profielen en geometrie zonder de polygonen te serialiseren', () => {
    const compact = encodeTreeCache(data)!;
    const restored = decodeTreeCache(structuredClone(compact))!;
    expect(restored).toMatchObject({ status: 'complete', source: 'groningen', requests: 0 });
    expect(restored.trees).toEqual(trees); expect(treeDataKey(restored.trees)).toBe(treeDataKey(trees));
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(data).length * 0.5);
    const point = [6.56, 53.21];
    for (const date of ['2026-03-21', '2026-09-21']) expect(possibleTreeShade(point, prepareTreeObstacles(restored.trees), 45, 180, date)).toBe(possibleTreeShade(point, prepareTreeObstacles(trees), 45, 180, date));
  });
  it('weigert afkapping, bronfouten, onbekende versie en corrupte dimensies', () => {
    expect(encodeTreeCache({ ...data, status: 'partial', capped: true })).toBeNull();
    expect(encodeTreeCache({ ...data, failed: true })).toBeNull();
    const cached = encodeTreeCache(data)!;
    expect(decodeTreeCache({ ...cached, version: 99 } as never)).toBeNull();
    const corrupt = structuredClone(cached); corrupt.records[0][2].crownRadius = NaN; expect(decodeTreeCache(corrupt)).toBeNull();
    const invalidProfile = structuredClone(cached); invalidProfile.records[0][2].profile = 'not-a-profile' as never; expect(decodeTreeCache(invalidProfile)).toBeNull();
    expect(decodeTreeCache({ ...cached, status: 'empty' })).toBeNull();
  });
  it('laat volledige leegte na één minuut en complete records na 24 uur verlopen', () => {
    vi.useFakeTimers();
    const cached = encodeTreeCache(data)!;
    const empty = encodeTreeCache({ ...data, trees: [], status: 'empty' })!;
    expect(decodeTreeCache(empty)?.status).toBe('empty');
    vi.advanceTimersByTime(60_000); expect(decodeTreeCache(empty)).toBeNull(); expect(decodeTreeCache(cached)).not.toBeNull();
    vi.advanceTimersByTime(86_400_000); expect(decodeTreeCache(cached)).toBeNull();
    expect(decodeTreeCache({ ...cached, savedAt: Date.now() + 10_000 })).toBeNull();
  });
  it('kan asynchroon zonder localStorage laden en hergebruikt dezelfde cachebron in workers', async () => {
    const cache = encodeTreeCache(data)!;
    const store: TreeCacheStore = { get: vi.fn(async () => cache), set: vi.fn(async () => {}) };
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await fetchTrees({ south: 53.2, north: 53.22, west: 6.55, east: 6.58 }, new AbortController().signal, 6, store);
    expect(result).toMatchObject({ requests: 0, status: 'complete', trees }); expect(fetch).not.toHaveBeenCalled();
  });
  it('behoudt source loading bij een kapotte cache en annuleert een genegeerde cache-read', async () => {
    const trees = parseTrees({ elements: [{ type: 'node', id: 1, lat: 53, lon: 6, tags: { natural: 'tree' } }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [{ type: 'node', id: 1, lat: 53, lon: 6, tags: { natural: 'tree' } }] }) }));
    const store: TreeCacheStore = { get: async () => { throw new Error('blocked'); }, set: async () => { throw new Error('quota'); } };
    expect((await fetchTrees({ south: 53, north: 53.01, west: 6, east: 6.01 }, new AbortController().signal, 6, store)).trees).toEqual(trees);
    const controller = new AbortController(), pending = fetchTrees({ south: 53, north: 53.01, west: 6, east: 6.01 }, controller.signal, 0,
      { get: () => new Promise(() => {}), set: async () => {} });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await assertion;
  });
  it('ruimt alleen oude boomgeometrie op, niet persoonlijke plekken of voorkeuren', () => {
    const values = new Map([['terraszon:v5:trees:one', 'legacy'], ['terraszon:personal-places', 'personal'], ['palette', 'colors']]);
    vi.stubGlobal('localStorage', { get length() { return values.size; }, key: (i: number) => [...values.keys()][i], removeItem: (key: string) => values.delete(key) });
    retireLegacyTreeCache(); expect([...values.keys()]).toEqual(['terraszon:personal-places', 'palette']);
  });
});
