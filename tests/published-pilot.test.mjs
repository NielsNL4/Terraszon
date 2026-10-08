import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodePilotCell, validatePilotManifest } from '../src/pilot-format';

describe('gepubliceerde Groningen-pilot', () => {
  it('heeft complete begrensde bestanden met passende counts, bronlicenties en checksums', async () => {
    const base = new URL('../public/data/groningen/', import.meta.url), raw = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
    // Validate the immutable snapshot at publication time; aging must trigger
    // runtime fallback, not break future unrelated builds of the repository.
    const manifest = validatePilotManifest(raw, raw.capturedAt + 1), buildings = new Set(), trees = new Set();
    let bytes = 0;
    for (const cell of manifest.cells) for (const kind of ['buildings', 'trees']) {
      const file = cell[kind], data = await readFile(new URL(file.path, base)); bytes += data.byteLength;
      expect(data.byteLength).toBe(file.bytes); expect(createHash('sha256').update(data).digest('hex')).toBe(file.sha256);
      const records = decodePilotCell(JSON.parse(data.toString('utf8')), kind, manifest, cell.bounds, file.count);
      for (const record of records) (kind === 'buildings' ? buildings : trees).add(record.properties.id);
    }
    expect(bytes).toBeLessThan(12 * 1024 * 1024); expect(manifest.cells).toHaveLength(2);
    expect(buildings.size).toBeGreaterThan(1000); expect(trees.size).toBeGreaterThan(1000);
    expect(manifest.sources.buildings.license).toBe('ODbL-1.0'); expect(manifest.sources.trees.license).toBe('CC-BY-4.0');
  });
});
