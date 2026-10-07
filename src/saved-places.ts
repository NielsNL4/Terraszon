import { normalizeSavedPlace, placeCoordinates, placeObject, PlacesFormatError, savePlaceRecord,
  type PersonalPlaceData, type Place, type SavedPlace } from './places';

export const PLACES_STORAGE_KEY = 'terraszon:personal-places';
export const PLACES_SCHEMA_VERSION = 1;
export const MAX_SAVED_PLACES = 500;
const MAX_IMPORT_CHARACTERS = 16_000_000;
type PlacesDocument = { version: number; entries: SavedPlace[] };
type PlacesStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class PlacesStorageError extends Error {
  constructor(message: string) { super(message); this.name = 'PlacesStorageError'; }
}

function entries(value: unknown): SavedPlace[] {
  if (!Array.isArray(value) || value.length > MAX_SAVED_PLACES) throw new PlacesFormatError(`Maximaal ${MAX_SAVED_PLACES} persoonlijke locaties zijn toegestaan.`);
  return Array.from(value, normalizeSavedPlace);
}

// The first release has no legacy personal-place format. All future migrations
// belong here; unsupported versions are kept intact, never silently reset.
export function decodePlacesDocument(value: unknown): PlacesDocument {
  const data = placeObject(value);
  if (data.version !== PLACES_SCHEMA_VERSION) throw new PlacesFormatError('Deze versie van de locatieopslag wordt niet ondersteund.');
  const records = entries(data.entries);
  if (new Set(records.map(record => record.id)).size !== records.length) throw new PlacesFormatError('Dubbele locatie-ID in de opslag.');
  return { version: PLACES_SCHEMA_VERSION, entries: records };
}

export function exportPlacesGeoJSON(records: SavedPlace[], now = Date.now()): string {
  const validated = entries(records);
  const text = JSON.stringify({ type: 'FeatureCollection', terraszon: { version: PLACES_SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(), attribution: validated.some(record => record.sources.some(source => source.provider === 'osm'))
      ? 'OpenStreetMap contributors — https://www.openstreetmap.org/copyright' : undefined },
  features: validated.map(record => {
    const coordinates = record.snapshot?.coordinates ?? record.personal.analysisPoints[0]?.coordinates;
    const { id, ...properties } = record;
    return { type: 'Feature', id, geometry: coordinates ? { type: 'Point', coordinates } : null,
      properties: { ...properties, name: record.personal.name ?? record.snapshot?.name ?? 'Opgeslagen locatie' } };
  }) }, null, 2);
  if (text.length > MAX_IMPORT_CHARACTERS) throw new PlacesFormatError('Het locatiebestand is te groot.');
  return text;
}

export function importPlacesGeoJSON(text: string): { entries: SavedPlace[]; duplicates: number } {
  if (text.length > MAX_IMPORT_CHARACTERS) throw new PlacesFormatError('Het locatiebestand is te groot.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new PlacesFormatError('Het bestand bevat geen geldige JSON.'); }
  const data = placeObject(parsed);
  if (data.type !== 'FeatureCollection' || placeObject(data.terraszon).version !== PLACES_SCHEMA_VERSION) {
    throw new PlacesFormatError('Geen ondersteund Terraszon-locatiebestand.');
  }
  if (!Array.isArray(data.features) || data.features.length > MAX_SAVED_PLACES) throw new PlacesFormatError('Te veel locaties in het bestand.');
  const unique = new Map<string, SavedPlace>();
  let duplicates = 0;
  for (const raw of data.features) {
    const feature = placeObject(raw);
    if (feature.type !== 'Feature') throw new PlacesFormatError('Ongeldige locatiefeature.');
    const record = normalizeSavedPlace({ ...placeObject(feature.properties), id: feature.id });
    const coordinates = record.snapshot?.coordinates ?? record.personal.analysisPoints[0]?.coordinates;
    if (feature.geometry === null) {
      if (coordinates) throw new PlacesFormatError('Locatiepositie ontbreekt in de kaartgeometrie.');
    } else {
      const geometry = placeObject(feature.geometry);
      if (geometry.type !== 'Point') throw new PlacesFormatError('Alleen locatiepunten kunnen worden geïmporteerd.');
      const point = placeCoordinates(geometry.coordinates);
      if (!coordinates || point[0] !== coordinates[0] || point[1] !== coordinates[1]) {
        throw new PlacesFormatError('Kaartgeometrie en locatiepositie komen niet overeen.');
      }
    }
    if (unique.has(record.id)) duplicates++; else unique.set(record.id, record);
  }
  return { entries: [...unique.values()], duplicates };
}

export function createSavedPlacesStore(options: { storage?: PlacesStorage; now?: () => number } = {}) {
  const storage = options.storage ?? { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let records = new Map<string, SavedPlace>(), loaded = false, raw: string | null = null;
  let readError: string | null = null, writeError: string | null = null;
  const notify = () => { for (const listener of listeners) listener(); };
  const read = (force = false) => {
    if (loaded && !force) return;
    loaded = true;
    try {
      const next = storage.getItem(PLACES_STORAGE_KEY);
      const document = next === null ? { version: PLACES_SCHEMA_VERSION, entries: [] } : decodePlacesDocument(JSON.parse(next));
      records = new Map(document.entries.map(record => [record.id, record])); raw = next;
      readError = null; writeError = null;
    } catch (error) {
      readError = error instanceof PlacesFormatError ? error.message : 'Persoonlijke locaties konden niet worden gelezen.';
      // Preserve the last valid in-memory data and the original storage key.
    }
  };
  const write = (next: Map<string, SavedPlace>) => {
    read();
    if (readError) throw new PlacesStorageError(readError);
    const document = decodePlacesDocument({ version: PLACES_SCHEMA_VERSION, entries: [...next.values()] });
    try {
      if (storage.getItem(PLACES_STORAGE_KEY) !== raw) throw new PlacesStorageError('Locaties zijn in een ander tabblad gewijzigd. Laad ze opnieuw voordat je opslaat.');
      const text = JSON.stringify(document);
      storage.setItem(PLACES_STORAGE_KEY, text);
      records = new Map(document.entries.map(record => [record.id, record])); raw = text; writeError = null;
    } catch (error) {
      writeError = error instanceof PlacesStorageError ? error.message : 'Locaties konden niet worden opgeslagen. Controleer de browseropslag en probeer opnieuw.';
      throw new PlacesStorageError(writeError);
    }
    notify();
  };
  return {
    get(id: string): SavedPlace | undefined { read(); const record = records.get(id); return record ? structuredClone(record) : undefined; },
    list(): SavedPlace[] { read(); return structuredClone([...records.values()]); },
    state() { read(); return { status: readError || writeError ? 'error' as const : 'ready' as const, error: readError ?? writeError, count: records.size }; },
    reload() { read(true); notify(); },
    save(place: Place, personal: Partial<PersonalPlaceData> = {}): SavedPlace {
      read();
      const saved = savePlaceRecord(place, records.get(place.id), personal, now());
      const next = new Map(records); next.set(saved.id, saved); write(next);
      return structuredClone(saved);
    },
    update(id: string, personal: Partial<PersonalPlaceData>): SavedPlace {
      read();
      const previous = records.get(id);
      if (!previous) throw new PlacesFormatError('Deze locatie is niet opgeslagen.');
      const saved = normalizeSavedPlace({ ...previous, personal: { ...previous.personal, ...personal }, updatedAt: Math.max(now(), previous.updatedAt) });
      const next = new Map(records); next.set(id, saved); write(next);
      return structuredClone(saved);
    },
    remove(id: string) { read(); if (!records.has(id)) return; const next = new Map(records); next.delete(id); write(next); },
    export() {
      read();
      if (readError && !records.size) throw new PlacesStorageError(readError);
      return exportPlacesGeoJSON([...records.values()], now());
    },
    import(text: string) {
      read();
      const parsed = importPlacesGeoJSON(text), next = new Map(records);
      let imported = 0, skipped = parsed.duplicates;
      for (const record of parsed.entries) {
        if (next.has(record.id)) { skipped++; continue; }
        next.set(record.id, record); imported++;
      }
      if (imported) write(next);
      else if (readError) throw new PlacesStorageError(readError);
      return { imported, skipped };
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
