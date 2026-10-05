// Large dataset caches use structured-clone IndexedDB records, not synchronous
// JSON.parse/stringify in localStorage (which is reserved for UI preferences).
export function createAreaCache<T>() {
  let connection: Promise<IDBDatabase | null> | null = null;
  const open = () => connection ??= new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let finished = false;
    const finish = (db: IDBDatabase | null) => {
      if (finished) { db?.close(); return; }
      finished = true; clearTimeout(timer); resolve(db);
    };
    const timer = setTimeout(() => finish(null), 500);
    try {
      const request = indexedDB.open('terraszon-data-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('areas')) request.result.createObjectStore('areas'); };
      request.onsuccess = () => finish(request.result);
      request.onerror = request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  const transact = async (key: string, value?: T): Promise<T | null> => {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 500);
      const finish = (result: T | null) => { clearTimeout(timer); resolve(result); };
      try {
        const store = db.transaction('areas', value === undefined ? 'readonly' : 'readwrite').objectStore('areas');
        const request = value === undefined ? store.get(key) : store.put(value, key);
        request.onsuccess = () => finish(value === undefined ? request.result ?? null : value);
        request.onerror = () => finish(null);
      } catch { finish(null); }
    });
  };
  return { get: (key: string) => transact(key), set: async (key: string, value: T) => { await transact(key, value); } };
}
