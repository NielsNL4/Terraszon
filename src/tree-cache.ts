import { createAreaCache, type AreaCachePolicy } from './area-cache';
import { TREE_PROFILES } from './tree-profiles';
import { treeFromRecord, treeRecord, type TreeRecord } from './tree-records';
import type { TreeAreaData } from './trees';

export type CachedTrees = { version: 1; savedAt: number; status: 'complete' | 'empty'; source: TreeAreaData['source']; records: TreeRecord[] };
export type TreeCacheStore = { get: (key: string) => Promise<CachedTrees | null>; set: (key: string, value: CachedTrees, policy?: AreaCachePolicy) => Promise<void> };
type StoredTrees = Omit<CachedTrees, 'records'> & { payload: string };
const disk = createAreaCache<StoredTrees>();
const memory = new Map<string, CachedTrees>();
const decoded = new WeakMap<CachedTrees, TreeAreaData>();
const ttl = (data: CachedTrees) => data.status === 'empty' ? 60_000 : 86_400_000;
const remember = (key: string, data: CachedTrees) => {
  for (const [id, value] of memory) if (Date.now() - value.savedAt >= ttl(value)) memory.delete(id);
  memory.delete(key); memory.set(key, data);
  let count = [...memory.values()].reduce((sum, value) => sum + value.records.length, 0);
  while (memory.size > 8 || count > 12_000) { const oldest = memory.keys().next().value!; count -= memory.get(oldest)!.records.length; memory.delete(oldest); }
};
export const treeCacheStore: TreeCacheStore = {
  async get(key) {
    const cached = memory.get(key);
    if (cached && Date.now() - cached.savedAt < ttl(cached)) { remember(key, cached); return cached; }
    memory.delete(key);
    const stored = await disk.get(key);
    if (!stored || typeof stored.payload !== 'string' || stored.payload.length > 4_000_000) return null;
    try { const { payload, ...header } = stored; const data: CachedTrees = { ...header, records: JSON.parse(payload) }; if (!decodeTreeCache(data)) return null; remember(key, data); return data; }
    catch { return null; }
  },
  async set(key, data, policy) {
    // Serialize compact records, never the 13-point GeoJSON crowns. A string
    // avoids expensive IndexedDB cloning of thousands of nested record objects.
    const { records, ...header } = data;
    await disk.set(key, { ...header, payload: JSON.stringify(records) }, policy);
    remember(key, data);
  },
};
export function encodeTreeCache(data: TreeAreaData): CachedTrees | null {
  if (data.capped || data.failed || !['complete', 'empty'].includes(data.status)) return null;
  const cached: CachedTrees = { version: 1, savedAt: Date.now(), status: data.status as 'complete' | 'empty', source: data.source, records: data.trees.map(treeRecord) };
  decoded.set(cached, { ...data, requests: 0 }); return cached;
}
export function decodeTreeCache(value: CachedTrees | null): TreeAreaData | null {
  if (!value || value.version !== 1 || !['complete', 'empty'].includes(value.status) || !['osm', 'groningen'].includes(value.source)
    || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() || Date.now() - value.savedAt >= (value.status === 'empty' ? 60_000 : 86_400_000)
    || !Array.isArray(value.records) || value.records.length > 4_000 || (value.status === 'empty') !== (value.records.length === 0)) return null;
  const reused = decoded.get(value); if (reused) return reused;
  for (const record of value.records) {
    if (!Array.isArray(record) || record.length !== 3 || !Number.isFinite(record[0]) || Math.abs(record[0]) > 180 || !Number.isFinite(record[1]) || Math.abs(record[1]) > 85) return null;
    const p = record[2];
    if (!p || typeof p.id !== 'string' || !p.id || !Number.isFinite(p.height) || p.height <= 0 || p.height > 40
      || !Number.isFinite(p.crownRadius) || p.crownRadius! <= 0 || p.crownRadius! > 24 || !Number.isFinite(p.rotation)
      || !p.profile || !Object.hasOwn(TREE_PROFILES, p.profile) || !['evergreen', 'deciduous', 'unknown'].includes(p.leafCycle ?? '')
      || !Number.isFinite(p.phenologyShift) || ['species', 'scientificName', 'heightClass'].some(key => p[key as 'species'] !== undefined && typeof p[key as 'species'] !== 'string')) return null;
  }
  const data: TreeAreaData = { trees: value.records.map(treeFromRecord), source: value.source, status: value.status, capped: false, failed: false, requests: 0 };
  decoded.set(value, data); return data;
}

// Retire derived v5 geometry, not personal records/preferences. Workers have
// no localStorage; shared IndexedDB is the cache for both execution contexts.
export function retireLegacyTreeCache() {
  try {
    const start = Math.max(0, localStorage.length - 512);
    for (let i = localStorage.length - 1; i >= start; i--) {
      const key = localStorage.key(i); if (key?.startsWith('terraszon:v5:trees:')) localStorage.removeItem(key);
    }
  } catch { /* blocked/worker storage does not prevent source loading */ }
}
