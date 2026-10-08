// Optional captured-source replay. No public source traffic or new app dependency.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), capturePath = process.argv[2];
if (!capturePath) throw new Error('Geef de PILOT_CAPTURE_FILE van data:refresh als eerste argument.');
const capture = JSON.parse(await readFile(capturePath, 'utf8')), manifest = JSON.parse(await readFile(`${root}/public/data/groningen/manifest.json`, 'utf8'));
const assets = new Map([['manifest.json', JSON.stringify(manifest)]]);
for (const cell of manifest.cells) for (const kind of ['buildings', 'trees']) assets.set(cell[kind].path, await readFile(`${root}/public/data/groningen/${cell[kind].path}`, 'utf8'));
let counter = { requests: 0, bytes: 0, decodedBytes: 0 };
const server = await createServer({ root, plugins: [{ name: 'captured-t7-sources', configureServer(server) { server.middlewares.use((req, res, next) => {
  const url = new URL(req.url, 'http://localhost'); let text;
  if (url.pathname === '/__live-buildings') text = JSON.stringify(capture.data);
  else if (url.pathname === '/__live-trees') text = JSON.stringify(capture.treePages[`${url.searchParams.get('cell')}:${url.searchParams.get('offset')}`]);
  else if (url.pathname.startsWith('/data/groningen/')) text = assets.get(url.pathname.split('/data/groningen/')[1]);
  else return next();
  const body = gzipSync(text); counter.requests++; counter.bytes += body.length; counter.decodedBytes += Buffer.byteLength(text);
  setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Encoding', 'gzip'); res.end(body); }, 120);
}); } }], server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), headless: true });
const results = [];
try {
  for (const device of ['desktop', 'mobile']) for (const mode of ['live-replay', 'static']) for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 900 }, timezoneId: 'Europe/Amsterdam' }), page = await context.newPage();
    if (device === 'mobile') await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
    counter = { requests: 0, bytes: 0, decodedBytes: 0 };
    await page.route('**/__t7', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>Pilot verification' })); await page.goto(new URL('__t7', server.resolvedUrls.local[0]).href);
    const result = await page.evaluate(async mode => {
      const { createPilotDataLoader } = await import('/src/pilot-data.ts'), { parseBuildings } = await import('/src/building-types.ts'), { parseMunicipalTrees } = await import('/src/trees.ts');
      const { PILOT_BOUNDS, PILOT_CELLS } = await import('/src/pilot-format.ts'); let buildings, trees; const start = performance.now();
      if (mode === 'static') {
        const loader = createPilotDataLoader(new URL('/data/groningen/manifest.json', location.href)), b = await loader.buildings(PILOT_BOUNDS, new AbortController().signal), t = await loader.trees(PILOT_BOUNDS, new AbortController().signal);
        if (!b || !t || b.missing.length || t.missing.length) throw new Error('Static coverage incomplete/expired'); buildings = b.records; trees = t.records;
      } else {
        buildings = parseBuildings(await (await fetch('/__live-buildings')).json()); const records = new Map();
        for (const cell of PILOT_CELLS) for (let offset = 0; offset < 4000; offset += 1000) {
          const response = await fetch(`/__live-trees?cell=${cell.id}&offset=${offset}`); const data = await response.json();
          const parsed = parseMunicipalTrees({ features: data.features.map(feature => ({ ...feature, properties: { ...feature.properties, OBJECTID: Number(feature.properties.OBJECT) } })) });
          for (const tree of parsed) { tree.properties.id = tree.properties.id.replace('groningen/', 'groningen-wfs/'); records.set(tree.properties.id, tree); }
          if (data.features.length < 1000 || offset + data.features.length === data.numberMatched) break;
        }
        trees = [...records.values()].filter(tree => { const ring = tree.geometry.coordinates[0], x = (ring[0][0] + ring[6][0]) / 2, y = (ring[0][1] + ring[6][1]) / 2; return x >= PILOT_BOUNDS.west && x <= PILOT_BOUNDS.east && y >= PILOT_BOUNDS.south && y <= PILOT_BOUNDS.north; });
      }
      const elapsedMs = performance.now() - start;
      const digest = async records => {
        const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
        const text = JSON.stringify(canonical([...records].sort((a, b) => a.properties.id.localeCompare(b.properties.id))));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('');
      };
      return { elapsedMs, buildings: buildings.length, trees: trees.length, buildingDigest: await digest(buildings), treeDigest: await digest(trees) };
    }, mode);
    results.push({ device, mode, run, requests: counter.requests, gzipBytes: counter.bytes, decodedBytes: counter.decodedBytes, ...result }); await context.close();
  }
  for (const device of ['desktop', 'mobile']) {
    const reference = results.find(row => row.device === device && row.mode === 'live-replay');
    for (const row of results.filter(row => row.device === device)) { assert.equal(row.buildingDigest, reference.buildingDigest); assert.equal(row.treeDigest, reference.treeDigest); }
  }
  const output = { result: 'passed', revision: manifest.revision, conditions: 'Actual bounded source capture replay,120ms per request,gzip,mobileCPU4x,Vite dev modules,3repetitions', results };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2));
} finally { await server.close(); await browser.close(); }
