import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPilotDataLoader } from '../src/pilot-data';
import { buildingRecord, decodePilotCell, PILOT_CELLS, PILOT_MAX_BYTES, subtractCoverage, validatePilotManifest, type PilotCell, type PilotManifest } from '../src/pilot-format';
import { parseBuildings } from '../src/building-types';
import { parseMunicipalTrees } from '../src/trees';
import { treeRecord } from '../src/tree-records';

afterEach(() => vi.useRealTimers());
const bounds = PILOT_CELLS[0].bounds, url = new URL('https://example.test/Terraszon/data/groningen/manifest.json');
const buildings = parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: 'house', height: '10' }, geometry: [{ lon: 6.568, lat: 53.218 }, { lon: 6.569, lat: 53.218 }, { lon: 6.569, lat: 53.219 }, { lon: 6.568, lat: 53.219 }, { lon: 6.568, lat: 53.218 }] }] });
const trees = parseMunicipalTrees({ features: [{ properties: { OBJECTID: 1 }, geometry: { type: 'Point', coordinates: [6.568, 53.218] } }] });
async function fixture(revision = 'rfixture-1234') {
  const capturedAt = Date.now() - 1000, expiresAt = capturedAt + 30 * 86_400_000;
  const payloads = new Map<string, string>();
  const cell = { id: 'centrum-zuid', bounds } as PilotManifest['cells'][number];
  for (const kind of ['buildings', 'trees'] as const) {
    const data: PilotCell = { schema: 1, kind, revision, capturedAt, expiresAt, bounds, records: kind === 'buildings' ? buildings.map(buildingRecord) : trees.map(treeRecord) }, text = JSON.stringify(data), bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes), sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    cell[kind] = { path: `${revision}/centrum-zuid-${kind}.json`, bytes: bytes.length, sha256, count: 1 }; payloads.set(cell[kind].path, text);
  }
  const manifest: PilotManifest = { schema: 1, revision, capturedAt, expiresAt, cells: [cell], sources: {
    buildings: { name: 'OSM', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OSM contributors' },
    trees: { name: 'Gemeente Groningen', url: 'https://data.overheid.nl', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Gemeente Groningen' },
  } };
  return { manifest, payloads };
}
describe('statische Groningen-pilot', () => {
  it('laadt een geverifieerde cel op een genest hostingpad en hergebruikt het bestand', async () => {
    const data = await fixture(), fetcher = vi.fn(async (input: URL | RequestInfo) => new Response(String(input).endsWith('manifest.json') ? JSON.stringify(data.manifest) : data.payloads.get(String(input).split('/groningen/')[1])!, { status: 200 }));
    const load = createPilotDataLoader(url, fetcher as typeof fetch);
    const first = await load.buildings(bounds, new AbortController().signal); expect(first).toMatchObject({ records: buildings, missing: [], dataset: { revision: data.manifest.revision } });
    expect(await load.buildings(bounds, new AbortController().signal)).toEqual(first); expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await load.trees(bounds, new AbortController().signal))!.records).toEqual(trees);
  });
  it('benoemt ontbrekende dekking en vraagt buiten Groningen helemaal geen manifest op', async () => {
    const data = await fixture(), fetcher = vi.fn(async (input: URL | RequestInfo) => new Response(String(input).endsWith('manifest.json') ? JSON.stringify(data.manifest) : data.payloads.get(String(input).split('/groningen/')[1])!));
    const load = createPilotDataLoader(url, fetcher as typeof fetch);
    expect(await load.buildings({ south: 52, north: 52.1, west: 5, east: 5.1 }, new AbortController().signal)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
    const partial = await load.trees({ ...bounds, north: 53.225 }, new AbortController().signal);
    expect(partial!.missing).toEqual([{ south: 53.22, north: 53.225, west: 6.56, east: 6.58 }]);
    expect(subtractCoverage(bounds, [bounds])).toEqual([]);
  });
  it('weigert checksum-/formaatfouten zonder vals volledige dekking', async () => {
    const data = await fixture();
    const load = createPilotDataLoader(url, vi.fn(async (input: URL | RequestInfo) => new Response(String(input).endsWith('manifest.json') ? JSON.stringify(data.manifest) : '{}')) as typeof fetch);
    expect(await load.buildings(bounds, new AbortController().signal)).toBeNull();
    const payload = JSON.parse(data.payloads.get(data.manifest.cells[0].buildings.path)!); payload.records[0][6].coordinates[0][0][0] = NaN;
    expect(() => decodePilotCell(payload, 'buildings', data.manifest, bounds, 1)).toThrow();
    const bad = structuredClone(data.manifest); bad.cells[0].trees.path = '../secret.json'; expect(() => validatePilotManifest(bad)).toThrow();
  });
  it('gaat bij verval naar live-fallback en invalideert assets bij een andere revision', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let data = await fixture(); const fetcher = vi.fn(async (input: URL | RequestInfo) => new Response(String(input).endsWith('manifest.json') ? JSON.stringify(data.manifest) : data.payloads.get(String(input).split('/groningen/')[1])!));
    const load = createPilotDataLoader(url, fetcher as typeof fetch); await load.buildings(bounds, new AbortController().signal);
    vi.setSystemTime(Date.now() + 61_000); data = await fixture('rfixture-5678'); expect((await load.buildings(bounds, new AbortController().signal))!.dataset.revision).toBe('rfixture-5678');
    vi.setSystemTime(data.manifest.expiresAt + 1); expect(await load.buildings(bounds, new AbortController().signal)).toBeNull();
  });
  it('begrensde manifestdeadline en caller-abort werken ook bij genegeerde fetch-abort', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(() => new Promise<Response>(() => {})), load = createPilotDataLoader(url, fetcher as typeof fetch);
    const promise = load.buildings(bounds, new AbortController().signal); await vi.advanceTimersByTimeAsync(1501); expect(await promise).toBeNull();
    const controller = new AbortController(); controller.abort(); await expect(load.buildings(bounds, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('houdt de 3 MB-grens en de bronlicenties expliciet', async () => {
    const data = await fixture(); data.manifest.cells[0].buildings.bytes = PILOT_MAX_BYTES + 1; expect(() => validatePilotManifest(data.manifest)).toThrow();
    data.manifest.sources.buildings.license = 'unknown'; expect(() => validatePilotManifest(data.manifest)).toThrow();
  });
});
