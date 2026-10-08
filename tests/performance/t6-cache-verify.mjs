import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext(), page = await context.newPage();
  await page.route('**/__cache', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>Cache verification' })); await page.goto(new URL('__cache', server.resolvedUrls.local[0]).href);
  const result = await page.evaluate(async () => {
    await new Promise((resolve, reject) => { const request = indexedDB.open('terraszon-data-v1', 1); request.onupgradeneeded = () => request.result.createObjectStore('areas');
      request.onerror = reject; request.onsuccess = () => { const db = request.result, tx = db.transaction('areas', 'readwrite'); tx.objectStore('areas').put({ savedAt: Date.now(), buildings: [] }, 'legacy'); tx.oncomplete = () => { db.close(); resolve(); }; }; });
    localStorage.setItem('terraszon:personal-places', 'personal'); localStorage.setItem('palette', 'colors'); localStorage.setItem('terraszon:v5:trees:legacy', 'derived');
    const { createAreaCache } = await import('/src/area-cache.ts'), { retireLegacyTreeCache, encodeTreeCache, decodeTreeCache } = await import('/src/tree-cache.ts'), { parseMunicipalTrees } = await import('/src/trees.ts');
    const store = createAreaCache({ entries: 3, records: 5 }), ensure = (value, message) => { if (!value) throw new Error(message); };
    ensure(await store.get('legacy') === null, 'v1 geometry must be invalidated');
    const now = Date.now(); await store.set('a', { id: 'a' }, { expiresAt: now + 100000, records: 2 }); await store.set('b', { id: 'b' }, { expiresAt: now + 100000, records: 2 });
    await store.get('a'); await new Promise(resolve => setTimeout(resolve, 20)); await store.set('c', { id: 'c' }, { expiresAt: now + 100000, records: 2 });
    ensure(await store.get('b') === null, 'record budget must evict LRU'); ensure((await store.get('a')).id === 'a', 'recent access must retain a');
    await store.set('oversized', {}, { expiresAt: now + 100000, records: 6 }); ensure(await store.get('oversized') === null, 'oversized entry must not persist');
    await store.set('expired', {}, { expiresAt: now - 1, records: 1 }); ensure(await store.get('expired') === null, 'expired entry must not persist');
    await store.set('unclonable', { value() {} }); ensure(await store.get('unclonable') === null, 'failed write must remain an optional miss');
    await new Promise(resolve => { const request = indexedDB.open('terraszon-data-v1'); request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['areas', 'metadata'], 'readwrite');
      tx.objectStore('areas').put({ id: 'corrupt' }, 'corrupt'); tx.objectStore('metadata').put({ key: 'corrupt', expiresAt: now + 100000, usedAt: now, records: NaN });
      tx.oncomplete = () => { db.close(); resolve(); };
    }; }); ensure(await store.get('corrupt') === null, 'corrupt budget metadata must not authorize a cache hit');
    await store.set('short', {}, { expiresAt: Date.now() + 30, records: 1 }); await new Promise(resolve => setTimeout(resolve, 50)); ensure(await store.get('short') === null, 'TTL read must reject expired data'); await new Promise(resolve => setTimeout(resolve, 50));
    const entries = await new Promise(resolve => { const req = indexedDB.open('terraszon-data-v1'); req.onsuccess = () => { const db = req.result, query = db.transaction('metadata').objectStore('metadata').getAll(); query.onsuccess = () => { resolve(query.result); db.close(); }; }; });
    ensure(entries.length <= 3 && entries.reduce((sum, entry) => sum + entry.records, 0) <= 5, 'persistent budget'); ensure(!entries.some(entry => entry.key === 'short'), 'TTL metadata cleanup');
    retireLegacyTreeCache(); ensure(localStorage.getItem('terraszon:v5:trees:legacy') === null, 'legacy cache retirement'); ensure(localStorage.getItem('terraszon:personal-places') === 'personal' && localStorage.getItem('palette') === 'colors', 'personal data must remain');
    const trees = parseMunicipalTrees({ features: Array.from({ length: 4000 }, (_, i) => ({ id: i, geometry: { type: 'Point', coordinates: [6.565 + (i % 80) * 0.00007, 53.217 + Math.floor(i / 80) * 0.000045] }, properties: { OBJECTID: i, BOOMHOOGTE: '12 tot 15 m.', LATIJNSE_NAAM: 'Tilia x europaea', BOOMSOORT: 'Hollandse linde' } })) });
    const source = { trees, status: 'complete', source: 'groningen', failed: false, capped: false, requests: 4 }, encoded = encodeTreeCache(source), restored = decodeTreeCache(structuredClone(encoded));
    ensure(JSON.stringify(restored.trees) === JSON.stringify(trees), 'all crowns/profiles must round-trip exactly');
    return { migration: true, LRU: true, budgets: { entries: entries.length, records: entries.reduce((sum, entry) => sum + entry.records, 0) }, expiryAndCleanup: true, failedWriteFallback: true, corruptMetadataMiss: true, personalPreserved: true,
      trees: trees.length, exactRoundTrip: true, serializedFullUTF16Bytes: JSON.stringify(source).length * 2, serializedCompactUTF16Bytes: JSON.stringify(encoded).length * 2 };
  });
  assert.equal(result.exactRoundTrip, true);
  await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({ json: { version: 8, sources: { base: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers: [{ id: 'background', type: 'background' }, { id: 'building-3d', type: 'fill-extrusion', source: 'base', paint: { 'fill-extrusion-height': 8 } }] } }));
  const diffResult = await page.evaluate(async () => {
    const { createTerraceMap } = await import('/src/map.ts'), { createBuildingGeometry } = await import('/src/building-geometry.ts'), { parseBuildings } = await import('/src/building-types.ts');
    const root = document.createElement('div'); root.style.cssText = 'position:absolute;inset:0'; document.body.append(root);
    let ready; const loaded = new Promise(resolve => { ready = resolve; });
    const map = createTerraceMap(root, { onMapReady: ready, onBuildings() {}, onViewChange() {}, onError(message) { throw new Error(message); } }); await loaded; await new Promise(resolve => map.map.once('idle', resolve));
    const buildings = parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: 'house', height: '8' }, geometry: [{ lon: 6.568, lat: 53.218 }, { lon: 6.569, lat: 53.218 }, { lon: 6.569, lat: 53.219 }, { lon: 6.568, lat: 53.219 }, { lon: 6.568, lat: 53.218 }] }] });
    const engine = createBuildingGeometry(), bounds = { south: 53.21, north: 53.23, west: 6.55, east: 6.58 }; engine.setKnown(buildings);
    const source = map.map.getSource('terraszon-buildings'); await source.updateData(engine.prepare(bounds).diff, true);
    const changed = buildings.map(feature => ({ ...feature, properties: { ...feature.properties, buildingType: 'office', height: 12 } })); engine.setKnown(changed);
    const diff = engine.prepare(bounds).diff; await source.updateData(diff, true); const data = await source.getData();
    if (data.features[0].properties.buildingType !== 'office' || data.features[0].properties.height !== 12 || JSON.stringify(data.features[0].geometry) !== JSON.stringify(buildings[0].geometry)) throw new Error('MapLibre property diff failed');
    map.map.remove(); return { add: diff.add.length, remove: diff.remove.length, updates: diff.update.length, nativeMapLibrePropertyPatch: true };
  });
  console.log(JSON.stringify({ result: 'passed', ...result, ...diffResult }, null, 2)); await context.close();
} finally { await browser.close(); await server.close(); }
