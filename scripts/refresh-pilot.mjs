import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url)), directory = join(root, 'public/data/groningen');
const server = await createServer({ root, server: { middlewareMode: true, watch: null }, appType: 'custom' });
let revisionDirectory = '', created = false;
const sha = text => createHash('sha256').update(text).digest('hex');
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000), headers: { 'User-Agent': 'Terraszon Groningen pilot refresh (bounded manual snapshot)', ...options.headers } });
  if (!response.ok) throw new Error(`Bron HTTP ${response.status}; refresh gestopt (geen endpointrotatie). ${response.headers.get('retry-after') ? `Retry-After: ${response.headers.get('retry-after')}` : ''}`);
  const text = await response.text(); if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('Bronrespons overschrijdt pilotbudget');
  const data = JSON.parse(text); if (data.error || data.remark) throw new Error('Bron meldt onvolledig resultaat'); return data;
}
try {
  const format = await server.ssrLoadModule('/src/pilot-format.ts'), { parseBuildings, buildingBox } = await server.ssrLoadModule('/src/building-types.ts');
  const { parseMunicipalTrees } = await server.ssrLoadModule('/src/trees.ts'), { treeRecord } = await server.ssrLoadModule('/src/tree-records.ts');
  const b = format.PILOT_BOUNDS; let capturedAt = Date.now();
  const query = `[out:json][timeout:25][maxsize:16777216];(way["building"](${b.south},${b.west},${b.north},${b.east});relation["building"]["type"="multipolygon"](${b.south},${b.west},${b.north},${b.east});way["building:part"](${b.south},${b.west},${b.north},${b.east});relation["building:part"]["type"="multipolygon"](${b.south},${b.west},${b.north},${b.east}););out geom 12001;`;
  const endpoint = process.env.PILOT_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
  const started = performance.now(); let capture = null;
  if (process.env.PILOT_CAPTURE_FILE) try { capture = JSON.parse(await readFile(process.env.PILOT_CAPTURE_FILE, 'utf8')); } catch { /* first capture */ }
  if (capture && (JSON.stringify(capture.bounds) !== JSON.stringify(b) || !Number.isFinite(capture.capturedAt) || capturedAt - capture.capturedAt > 86_400_000)) throw new Error('Capture past niet bij gebied of is verlopen');
  const buildingResponse = capture?.data ?? await json(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (capture) capturedAt = capture.capturedAt;
  const expiresAt = capturedAt + 30 * 86_400_000;
  if (process.env.PILOT_CAPTURE_FILE && !capture) await writeFile(process.env.PILOT_CAPTURE_FILE, JSON.stringify({ bounds: b, capturedAt, data: buildingResponse, downloadMs: performance.now() - started }));
  if (!capture) capture = { bounds: b, capturedAt, data: buildingResponse, downloadMs: performance.now() - started };
  capture.treePages ??= {};
  if (!Array.isArray(buildingResponse.elements) || buildingResponse.elements.length >= 12001) throw new Error('Gebouwbron afgekapt; oude publicatie blijft behouden');
  const buildings = parseBuildings(buildingResponse);
  if (!buildings.length && buildingResponse.elements.length) throw new Error('Gebouwgeometrie niet bruikbaar');
  const buildingMs = capture?.downloadMs ?? performance.now() - started, trees = new Map(), treeStats = [];
  for (const cell of format.PILOT_CELLS) {
    const records = new Map(); let matched = null, count = 0, pages = 0; const start = performance.now();
    for (let offset = 0; offset < 4000; offset += 1000) {
      const url = new URL('https://maps.groningen.nl/geoserver/geo-data/ows');
      const bbox = `${cell.bounds.west},${cell.bounds.south},${cell.bounds.east},${cell.bounds.north},EPSG:4326`;
      url.search = new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName: 'geo-data:Bomen gemeente Groningen', maxFeatures: '1000', startIndex: String(offset),
        outputFormat: 'application/json', srsName: 'EPSG:4326', bbox, sortBy: 'OBJECT' }).toString();
      const pageKey = `${cell.id}:${offset}`;
      const data = capture.treePages[pageKey] ?? await json(url); pages++;
      if (!capture.treePages[pageKey]) { capture.treePages[pageKey] = data; if (process.env.PILOT_CAPTURE_FILE) await writeFile(process.env.PILOT_CAPTURE_FILE, JSON.stringify(capture)); }
      if (!Array.isArray(data.features) || data.features.length > 1000 || !Number.isInteger(data.numberMatched) || data.numberMatched > 4000) throw new Error('Bomenbron te groot/onvolledig voor pilotcel');
      if (matched !== null && matched !== data.numberMatched) throw new Error('Bomenaantal veranderde tijdens paging; probeer later opnieuw'); matched = data.numberMatched;
      const normalized = data.features.map(feature => ({ ...feature, properties: { ...feature.properties, OBJECTID: Number(feature.properties?.OBJECT) } }));
      if (normalized.some(feature => !Number.isSafeInteger(feature.properties.OBJECTID) || feature.properties.OBJECTID <= 0)) throw new Error('Geen stabiele gemeentelijke boom-ID');
      const parsed = parseMunicipalTrees({ features: normalized }); if (parsed.length !== data.features.length) {
        const ids = new Set(parsed.map(tree => tree.properties.id));
        throw new Error(`Ongeldige boomrecords: ${parsed.length}/${data.features.length}; ${JSON.stringify(normalized.filter(feature => !ids.has(`groningen/${feature.properties.OBJECTID}`)).slice(0, 3).map(feature => ({ id: feature.properties.OBJECTID, geometry: feature.geometry })))}`);
      }
      const before = records.size;
      for (const tree of parsed) { tree.properties.id = tree.properties.id.replace('groningen/', 'groningen-wfs/'); records.set(tree.properties.id, tree); }
      count += data.features.length;
      if (records.size !== count || (data.features.length && records.size === before)) throw new Error('Dubbele/herhaalde bomenpagina');
      if (count === matched) break;
      if (data.features.length < 1000) throw new Error('Bomenpagina stopt voor het volledige resultaat');
    }
    if (records.size !== matched) throw new Error('Bomenbron afgekapt; geen nieuwe publicatie');
    const clipped = [...records.values()].filter(tree => {
      const point = treeRecord(tree); return point[0] >= cell.bounds.west && point[0] <= cell.bounds.east && point[1] >= cell.bounds.south && point[1] <= cell.bounds.north;
    }).sort((a, b) => a.properties.id.localeCompare(b.properties.id));
    trees.set(cell.id, clipped);
    treeStats.push({ cell: cell.id, count: clipped.length, sourceMatched: matched, sourceRecords: records.size, pages, liveMs: performance.now() - start });
  }
  const packedCells = format.PILOT_CELLS.map(cell => ({ ...cell,
    buildings: buildings.filter(feature => format.intersectsBuildingBounds(buildingBox(feature.geometry), cell.bounds)).sort((a, b) => a.properties.id.localeCompare(b.properties.id)).map(format.buildingRecord),
    trees: trees.get(cell.id).map(treeRecord),
  }));
  const revision = `r${capturedAt.toString(36)}-${sha(JSON.stringify(packedCells)).slice(0, 12)}`;
  if (process.env.PILOT_CAPTURE_ONLY === '1') { console.log(JSON.stringify({ result: 'captured', revision, buildingCount: buildings.length, treeStats }, null, 2)); }
  else {
  const manifest = { schema: 1, revision, capturedAt, expiresAt, cells: [], sources: {
    buildings: { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors; genormaliseerde OSM-gebouwdata onder ODbL 1.0' },
    trees: { name: 'Gemeente Groningen', url: 'https://data.overheid.nl/dataset/groningen-bomen-gemeente-groningen', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Gemeente Groningen, CC BY 4.0; WFS-boomdata genormaliseerd, hoogte/kroonvorm/bladstand geschat' },
  } };
  revisionDirectory = join(directory, revision); await mkdir(revisionDirectory); created = true;
  let totalBytes = 0;
  for (const cell of packedCells) {
    const published = { id: cell.id, bounds: cell.bounds };
    for (const kind of ['buildings', 'trees']) {
      const records = cell[kind];
      const value = { schema: 1, kind, revision, capturedAt, expiresAt, bounds: cell.bounds, records }, text = JSON.stringify(value), bytes = Buffer.byteLength(text);
      if (bytes > format.PILOT_MAX_BYTES) throw new Error('Celbestand overschrijdt download-/geheugenbudget');
      format.decodePilotCell(value, kind, manifest, cell.bounds, records.length); totalBytes += bytes;
      published[kind] = { path: `${revision}/${cell.id}-${kind}.json`, bytes, sha256: sha(text), count: records.length };
      await writeFile(join(revisionDirectory, `${cell.id}-${kind}.json`), text);
    }
    manifest.cells.push(published);
  }
  format.validatePilotManifest(manifest);
  const text = JSON.stringify(manifest, null, 2); await writeFile(join(revisionDirectory, 'manifest.json.tmp'), text);
  let old = null; try { old = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')); } catch { /* initial publication */ }
  await rename(join(revisionDirectory, 'manifest.json.tmp'), join(directory, 'manifest.json')); created = false;
  if (old?.schema === 1 && /^r[a-z0-9-]{8,64}$/.test(old.revision) && old.revision !== revision) await rm(join(directory, old.revision), { recursive: true, force: true });
  console.log(JSON.stringify({ result: 'published', revision, capturedAt, expiresAt, buildingCount: buildings.length, liveBuildingMs: buildingMs, treeStats, totalBytes, sources: manifest.sources }, null, 2));
  }
} catch (error) {
  if (created) await rm(revisionDirectory, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally { await server.close(); }
