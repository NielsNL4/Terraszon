import { aborted, abortable, requestDeadline } from './requests';
import { buildingBox } from './building-types';
import { describeTree } from './tree-profiles';
import { decodePilotCell, intersectsBounds, intersectsBuildingBounds, PILOT_BOUNDS, PILOT_MAX_BYTES, subtractCoverage, validatePilotManifest,
  type DatasetStamp, type PilotKind, type PilotManifest } from './pilot-format';
import type { DataBounds } from './data-coverage';
import type { CategorizedBuilding, TreeFeature } from './types';

export type PilotResult<T> = { records: T[]; missing: DataBounds[]; dataset: DatasetStamp };
async function boundedResponse(url: URL, signal: AbortSignal, maximum: number, fetcher: typeof fetch, cache?: RequestCache): Promise<Uint8Array> {
  const response = await abortable(fetcher(url, { signal, ...(cache ? { cache } : {}) }), signal); if (!response.ok) throw new Error(`Pilot HTTP ${response.status}`);
  const reader = response.body?.getReader(); if (!reader) throw new Error('Geen pilotresponsbody');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const result = await abortable(reader.read(), signal); if (result.done) break; bytes += result.value.byteLength; if (bytes > maximum) throw new Error('Pilotbestand te groot'); chunks.push(result.value); } }
  catch (error) { void reader.cancel().catch(() => {}); throw error; }
  const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; } return joined;
}
export function createPilotDataLoader(manifestUrl: URL, fetcher: typeof fetch = fetch) {
  let manifest: PilotManifest | null = null, checkedAt = -Infinity;
  let manifestJob: Promise<PilotManifest | null> | null = null;
  const files = new Map<string, { data: CategorizedBuilding[] | TreeFeature[]; bytes: number }>();
  const getManifest = async (signal: AbortSignal): Promise<PilotManifest | null> => {
    if (signal.aborted) throw aborted(signal);
    if (Date.now() - checkedAt < 60_000) {
      if (manifest && manifest.expiresAt <= Date.now()) { manifest = null; files.clear(); }
      return manifest;
    }
    if (!manifestJob) {
      manifestJob = (async () => {
        const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 1500);
        try {
          const bytes = await boundedResponse(manifestUrl, deadline.signal, 32_000, fetcher, 'no-cache'), next = validatePilotManifest(JSON.parse(new TextDecoder().decode(bytes)));
          if (manifest?.revision !== next.revision) files.clear(); manifest = next; return manifest;
        } catch { manifest = null; files.clear(); return null; }
        finally { clearTimeout(timer); checkedAt = Date.now(); manifestJob = null; }
      })();
    }
    return abortable(manifestJob, signal);
  };
  const load = async (kind: PilotKind, bounds: DataBounds, signal: AbortSignal) => {
    if (!intersectsBounds(bounds, PILOT_BOUNDS)) return null;
    const m = await getManifest(signal); if (!m) return null;
    const records = new Map<string, CategorizedBuilding | TreeFeature>(), coverage: DataBounds[] = [];
    for (const cell of m.cells) {
      if (!intersectsBounds(cell.bounds, bounds)) continue;
      const file = cell[kind];
      try {
        let cached = files.get(file.path);
        if (!cached) {
          const deadline = requestDeadline(signal, 3500);
          try {
            const bytes = await boundedResponse(new URL(file.path, manifestUrl), deadline.signal, PILOT_MAX_BYTES, fetcher);
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer))].map(value => value.toString(16).padStart(2, '0')).join('');
            if (bytes.byteLength !== file.bytes || hash !== file.sha256) throw new Error('Pilot checksum mismatch');
            cached = { bytes: bytes.byteLength, data: decodePilotCell(JSON.parse(new TextDecoder().decode(bytes)), kind, m, cell.bounds, file.count) };
            files.set(file.path, cached);
            while (files.size > 2 || [...files.values()].reduce((sum, value) => sum + value.bytes, 0) > 6 * 1024 * 1024 || [...files.values()].reduce((sum, value) => sum + value.data.length, 0) > 12_000) files.delete(files.keys().next().value!);
          } finally { deadline.dispose(); }
        }
        coverage.push(cell.bounds);
        for (const record of cached.data) {
          const box = kind === 'buildings' ? buildingBox(record.geometry) : null;
          const tree = kind === 'trees' ? describeTree(record as TreeFeature) : null;
          if (box ? intersectsBuildingBounds(box, bounds) : tree && tree.longitude >= bounds.west && tree.longitude <= bounds.east && tree.latitude >= bounds.south && tree.latitude <= bounds.north) records.set(record.properties.id, record);
        }
      } catch { if (signal.aborted) throw aborted(signal); }
    }
    if (!coverage.length) return null;
    return { records: [...records.values()], missing: subtractCoverage(bounds, coverage), dataset: { revision: m.revision, capturedAt: m.capturedAt, expiresAt: m.expiresAt } };
  };
  return {
    buildings: (bounds: DataBounds, signal: AbortSignal) => load('buildings', bounds, signal) as Promise<PilotResult<CategorizedBuilding> | null>,
    trees: (bounds: DataBounds, signal: AbortSignal) => load('trees', bounds, signal) as Promise<PilotResult<TreeFeature> | null>,
    async revision(bounds: DataBounds, signal: AbortSignal) { if (!intersectsBounds(bounds, PILOT_BOUNDS)) return null; return (await getManifest(signal))?.revision ?? null; },
  };
}
const runtime = typeof document !== 'undefined' || typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
const path = '../data/groningen/manifest.json';
export const pilotData = runtime ? createPilotDataLoader(new URL(path, import.meta.url)) : null;
