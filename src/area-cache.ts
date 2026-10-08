export const AREA_CACHE_VERSION = 2;
export const AREA_CACHE_MAX_ENTRIES = 64;
export const AREA_CACHE_MAX_RECORDS = 60_000;
type Metadata = { key: string; expiresAt: number; usedAt: number; records: number };
export type AreaCachePolicy = { expiresAt?: number; records?: number };

// Public source data only. Metadata stays small so expiry/LRU cleanup never
// reads every cached geometry. v1's unbounded public cache is invalidated once.
export function createAreaCache<T>(limits = { entries: AREA_CACHE_MAX_ENTRIES, records: AREA_CACHE_MAX_RECORDS }) {
  let connection: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> => {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return connection ??= new Promise(resolve => {
      let finished = false;
      const finish = (db: IDBDatabase | null) => {
        if (finished) { db?.close(); return; }
        finished = true; clearTimeout(timer); resolve(db);
      };
      const timer = setTimeout(() => finish(null), 500);
      try {
        const request = indexedDB.open('terraszon-data-v1', AREA_CACHE_VERSION);
        request.onupgradeneeded = () => {
          if (request.result.objectStoreNames.contains('areas')) request.transaction!.objectStore('areas').clear();
          else request.result.createObjectStore('areas');
          if (!request.result.objectStoreNames.contains('metadata')) request.result.createObjectStore('metadata', { keyPath: 'key' });
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); connection = null; };
          finish(db);
        };
        request.onerror = request.onblocked = () => finish(null);
      } catch { finish(null); }
    });
  };
  const transact = async (key: string, value?: T, policy: AreaCachePolicy = {}, readValue = true): Promise<T | null> => {
    const db = await open(); if (!db) return null;
    return new Promise(resolve => {
      let done = false, result: T | null = null;
      const finish = (value: T | null) => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { try { transaction?.abort(); } catch { /* already settled */ } finish(null); }, 500);
      let transaction: IDBTransaction | undefined;
      try {
        transaction = db.transaction(['areas', 'metadata'], 'readwrite');
        transaction.oncomplete = () => finish(result);
        transaction.onabort = transaction.onerror = () => finish(null);
        const areas = transaction.objectStore('areas'), metadata = transaction.objectStore('metadata'), now = Date.now();
        if (value !== undefined) {
          const data = value as { savedAt?: number; buildings?: unknown[]; records?: unknown[] };
          const savedAt = data.savedAt ?? now;
          const entry: Metadata = { key, usedAt: now, expiresAt: policy.expiresAt ?? savedAt + 24 * 60 * 60 * 1_000,
            records: Math.max(1, policy.records ?? data.buildings?.length ?? data.records?.length ?? 1) };
          if (!Number.isFinite(entry.records) || entry.records > limits.records || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) { areas.delete(key); metadata.delete(key); }
          else { areas.put(value, key); metadata.put(entry); }
        }
        const request = metadata.getAll();
        request.onsuccess = () => {
          const kept: Metadata[] = [];
          for (const entry of request.result as Metadata[]) {
            if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= now || !Number.isFinite(entry.records) || entry.records < 1 || entry.records > limits.records || !Number.isFinite(entry.usedAt)) { areas.delete(entry.key); metadata.delete(entry.key); }
            else kept.push(entry);
          }
          const wanted = kept.find(entry => entry.key === key);
          if (wanted) { wanted.usedAt = now; metadata.put(wanted); }
          kept.sort((a, b) => a.key === key ? 1 : b.key === key ? -1 : a.usedAt - b.usedAt || a.key.localeCompare(b.key));
          let records = kept.reduce((sum, entry) => sum + entry.records, 0);
          while (kept.length > limits.entries || records > limits.records) {
            const removed = kept.shift()!; records -= removed.records; areas.delete(removed.key); metadata.delete(removed.key);
          }
          if (!kept.some(entry => entry.key === key)) { areas.delete(key); return; }
          if (value !== undefined) { result = value; return; }
          if (!readValue) return;
          const read = areas.get(key); read.onsuccess = () => { result = read.result ?? null; };
        };
      } catch { try { transaction?.abort(); } catch { /* optional cache */ } finish(null); }
    });
  };
  const get = async (key: string): Promise<T | null> => {
    const db = await open(); if (!db) return null;
    const value = await new Promise<T | null>(resolve => {
      let result: T | null = null, done = false;
      const finish = (value: T | null) => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { try { transaction?.abort(); } catch { /* already settled */ } finish(null); }, 500);
      let transaction: IDBTransaction | undefined;
      try {
        // Concurrent building-cell reads must not serialize large geometry
        // clones behind metadata writes. Touch/prune separately after the read.
        transaction = db.transaction(['areas', 'metadata'], 'readonly');
        transaction.oncomplete = () => finish(result);
        transaction.onabort = transaction.onerror = () => finish(null);
        const meta = transaction.objectStore('metadata').get(key);
        meta.onsuccess = () => {
          const entry = meta.result as Metadata | undefined;
          if (!entry || entry.key !== key || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()
            || !Number.isFinite(entry.records) || entry.records < 1 || entry.records > limits.records || !Number.isFinite(entry.usedAt)) return;
          const read = transaction!.objectStore('areas').get(key); read.onsuccess = () => { result = read.result ?? null; };
        };
      } catch { finish(null); }
    });
    void transact(key, undefined, {}, false);
    return value;
  };
  return { get, set: async (key: string, value: T, policy?: AreaCachePolicy) => { await transact(key, value, policy); } };
}
