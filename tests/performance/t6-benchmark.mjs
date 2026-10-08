// Optional browser measurement, not a Vitest speed assertion. Use an existing
// Playwright installation via PLAYWRIGHT_MODULE; no application dependency.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = process.env.T6_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)), label = process.argv[2] ?? 'measurement';
const output = process.argv[3] ?? join(os.tmpdir(), `terraszon-t6-${label}.json`);
const conditions = { repetitions: 3, latencyMsPerSourceRequest: 120, desktop: '1366x900, CPU1x', mobile: '390x844, touch, CPU4x emulation; not physical hardware',
  renderer: 'Chromium SwiftShader software GL, synthetic local map style/obstacles', fixtures: '3000 buildings/600 trees dense;600 buildings/4000 trees tree-rich', entry: 'Vite dev ES modules and native workers' };
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [], host = { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version(), cpu: os.cpus()[0].model, logicalCores: os.cpus().length };
try {
  for (const device of ['desktop', 'mobile']) for (const scenario of ['dense-buildings', 'tree-rich']) for (let repetition = 0; repetition < 3; repetition++) {
    const nBuildings = scenario === 'dense-buildings' ? 3000 : 600, nTrees = scenario === 'tree-rich' ? 4000 : 600;
    const buildings = Array.from({ length: nBuildings }, (_, id) => {
      const x = 6.565 + (id % 60) * 0.00008, y = 53.217 + Math.floor(id / 60) * 0.00004;
      return { type: 'way', id: id + 1, tags: { building: 'apartments', height: '12' }, geometry: [{ lon: x, lat: y }, { lon: x + 0.00004, lat: y }, { lon: x + 0.00004, lat: y + 0.00002 }, { lon: x, lat: y + 0.00002 }, { lon: x, lat: y }] };
    });
    const trees = Array.from({ length: nTrees }, (_, id) => ({ attributes: { OBJECTID: id + 1, BOOMHOOGTE: '12 tot 15 m.', BOOMSOORT: 'Hollandse linde', LATIJNSE_NAAM: 'Tilia x europaea' }, geometry: { x: 6.565 + (id % 80) * 0.00007, y: 53.217 + Math.floor(id / 80) * 0.000045 } }));
    const context = await browser.newContext({ viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: device === 'mobile', hasTouch: device === 'mobile', timezoneId: 'Europe/Amsterdam' });
    const page = await context.newPage(), cdp = await context.newCDPSession(page); if (device === 'mobile') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let requestCount = 0, bytes = 0;
    await page.route('**/__t6', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="map" style="position:absolute;inset:0"></div>' }));
    await page.route('**/api/interpreter**', async route => { const payload = JSON.stringify({ elements: buildings }); requestCount++; bytes += Buffer.byteLength(payload); await new Promise(resolve => setTimeout(resolve, 120)); await route.fulfill({ contentType: 'application/json', body: payload }); });
    await page.route('**/FeatureServer/0/query?**', async route => { const offset = Number(new URL(route.request().url()).searchParams.get('resultOffset') ?? 0), payload = JSON.stringify({ features: trees.slice(offset, offset + 1000), exceededTransferLimit: offset + 1000 < trees.length });
      requestCount++; bytes += Buffer.byteLength(payload); await new Promise(resolve => setTimeout(resolve, 120)); await route.fulfill({ contentType: 'application/json', body: payload }); });
    await page.route('https://tiles.openfreemap.org/styles/liberty', route => route.fulfill({ json: { version: 8, sources: { buildings: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9e5da' } }, { id: 'building-3d', type: 'fill-extrusion', source: 'buildings', paint: { 'fill-extrusion-height': 12 } }] } }));
    await page.goto(new URL('__t6', server.resolvedUrls.local[0]).href);
    const result = await page.evaluate(async ({ nTrees }) => {
      const treeModule = await import('/src/trees.ts'), { bufferedTreeBounds } = await import('/src/tree-loader.ts'), { reportObstacleBounds } = await import('/src/report-obstacles.ts');
      const { createBuildingGeometry } = await import('/src/building-geometry.ts'), { parseBuildings } = await import('/src/building-types.ts');
      const { createSunReportClient } = await import('/src/sun-report-client.ts'), { createTerraceMap } = await import('/src/map.ts');
      const { buildShadowMesh, prepareShadowPolygons } = await import('/src/shadows.ts');
      const longTasks = [], observer = new PerformanceObserver(entries => longTasks.push(...entries.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))); observer.observe({ type: 'longtask', buffered: false });
      const target = { id: 't6:controlled', coordinates: [6.5682, 53.2203] }, bounds = reportObstacleBounds(target.coordinates), treeBounds = bufferedTreeBounds(bounds), signal = () => new AbortController().signal;
      const start = performance.now(), first = await treeModule.fetchTrees(treeBounds, signal()), coldTreeMs = performance.now() - start;
      const warmStart = performance.now(), warm = await treeModule.fetchTrees(treeBounds, signal()), warmTreeMs = performance.now() - warmStart;
      const sourceTasks = longTasks.filter(task => task.start >= start && task.start < performance.now());
      if (first.trees.length !== nTrees || warm.trees.length !== nTrees) throw new Error('Tree completeness changed');
      const client = createSunReportClient(), progress = [], workerStart = performance.now();
      const report = await client.day(target, '2026-06-21', signal(), undefined, value => progress.push({ ...value, at: performance.now() - workerStart }));
      const workerFreshAfterSourceWarmMs = performance.now() - workerStart;
      const warmWorkerStart = performance.now(); const repeated = await client.day(target, '2026-06-21', signal()); const workerWarmMs = performance.now() - warmWorkerStart;
      await new Promise(resolve => setTimeout(resolve, 150)); client.destroy();
      const reloadedClient = createSunReportClient(), reloadStart = performance.now(); const reloaded = await reloadedClient.day(target, '2026-06-21', signal()); const workerReloadMs = performance.now() - reloadStart; reloadedClient.destroy();
      if (JSON.stringify(report.totals) !== JSON.stringify(repeated.totals) || JSON.stringify(report.totals) !== JSON.stringify(reloaded.totals)) throw new Error('Report totals changed across cache');
      const geometryResponse = await fetch('https://overpass-api.de/api/interpreter?data=benchmark'), parsed = parseBuildings(await geometryResponse.json());
      const geometry = createBuildingGeometry(), knownStart = performance.now(); geometry.setKnown(parsed); const knownMs = performance.now() - knownStart;
      const shapeStart = performance.now(), shape = geometry.prepare(bounds), geometryColdMs = performance.now() - shapeStart;
      const warmShapes = []; for (let i = 0; i < 10; i++) { const before = performance.now(); geometry.prepare(bounds); warmShapes.push(performance.now() - before); }
      const changed = parsed.map((building, i) => i < 100 ? { ...building, properties: { ...building.properties, buildingType: 'office' } } : building);
      const changedStart = performance.now(); geometry.setKnown(changed); const diff = geometry.prepare(bounds), propertyChangeMs = performance.now() - changedStart, propertyDiffBytes = JSON.stringify(diff.diff).length;
      const renderStart = performance.now(); let ready; const loaded = new Promise(resolve => { ready = resolve; });
      const map = createTerraceMap(document.querySelector('#map'), { onBuildings() {}, onViewChange() {}, onError(message) { throw new Error(message); }, onMapReady() { ready(); } }); await loaded;
      map.setBuildings(parsed); map.setTrees(first.trees.slice(0, 1000)); map.setTreeDate('2026-06-21'); map.setSunLight(45, 180, true); map.setShadowMesh(buildShadowMesh(prepareShadowPolygons(parsed.slice(0, 1500))));
      await Promise.race([new Promise(resolve => map.map.once('idle', resolve)), new Promise((_, reject) => setTimeout(() => reject(new Error('Controlled map did not settle within 30 seconds')), 30_000))]); const renderLoadMs = performance.now() - renderStart;
      const frames = []; let previous = performance.now(); for (let i = 0; i < 30; i++) { map.setSunLight(45, 180 + i * 0.1, true); await new Promise(resolve => requestAnimationFrame(now => { frames.push(now - previous); previous = now; resolve(); })); }
      map.map.remove(); observer.disconnect();
      const legacyTreeBytes = Object.keys(localStorage).filter(key => key.includes(':trees:')).reduce((sum, key) => sum + (localStorage.getItem(key)?.length ?? 0) * 2, 0);
      return { coldTreeMs, warmTreeMs, trees: first.trees.length, treeCoverage: first.status, warmTreeRequests: warm.requests, legacyTreeBytes,
        sourceLongTaskMs: sourceTasks.reduce((sum, task) => sum + task.duration, 0), sourceLongTasks: sourceTasks.length,
        workerFreshAfterSourceWarmMs, workerWarmMs, workerReloadMs,
        workerObstacleMs: progress.find(item => item.phase === 'obstacles' && item.completed === 1)?.at - progress.find(item => item.phase === 'obstacles' && item.completed === 0)?.at,
        workerComputeMs: progress.find(item => item.phase === 'day' && item.completed === 1)?.at - progress.find(item => item.phase === 'day' && item.completed === 0)?.at,
        buildings: parsed.length, knownMs, geometryColdMs, geometryWarmMeanMs: warmShapes.reduce((sum, value) => sum + value, 0) / warmShapes.length, propertyChangeMs, propertyDiffBytes,
        renderLoadMs, frameMeanMs: frames.slice(1).reduce((sum, value) => sum + value, 0) / 29, coverage: report.coverage, totals: report.totals, initialGeometryCount: shape.count };
    }, { nTrees });
    assert.equal(result.trees, nTrees); assert.equal(result.buildings, nBuildings); assert.equal(result.initialGeometryCount, nBuildings);
    rows.push({ device, cpuRate: device === 'mobile' ? 4 : 1, scenario, repetition, requestCount, sourceBytes: bytes, ...result });
    await writeFile(output, JSON.stringify({ label, host, conditions, rows }, null, 2));
    console.log(JSON.stringify({ device, scenario, repetition, requests: requestCount, coldTreeMs: result.coldTreeMs, warmTreeMs: result.warmTreeMs, workerReloadMs: result.workerReloadMs, diffBytes: result.propertyDiffBytes }));
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
