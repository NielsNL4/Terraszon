import type { SearchResult } from './search';
import type { TerraceFeature, TerraceEvidence } from './types';

export type PlaceCoordinates = [number, number];
export type PlaceKind = 'venue' | 'address' | 'custom';
export type PlaceSource = { provider: string; id: string; storage: 'open' | 'reference-only'; url?: string };
export type AnalysisPoint = { id: string; label: string; coordinates: PlaceCoordinates };
export type Place = {
  id: string;
  kind: PlaceKind;
  name: string;
  coordinates: PlaceCoordinates;
  address?: string;
  sources: PlaceSource[];
  venue?: {
    amenity: string;
    evidence: TerraceEvidence;
    cuisine?: string;
    openingHours?: string;
    website?: string;
    phone?: string;
    wheelchair?: string;
    covered?: string;
  };
};
export type PersonalPlaceData = {
  favorite: boolean;
  name?: string;
  note?: string;
  type?: 'terrace' | 'garden' | 'park' | 'other';
  analysisPoints: AnalysisPoint[];
};
export type PlaceSnapshot = Pick<Place, 'name' | 'coordinates' | 'address'>;
export type SavedPlace = {
  id: string;
  kind: PlaceKind;
  sources: PlaceSource[];
  snapshot?: PlaceSnapshot;
  personal: PersonalPlaceData;
  createdAt: number;
  updatedAt: number;
};

export class PlacesFormatError extends Error {
  constructor(message: string) { super(message); this.name = 'PlacesFormatError'; }
}

export function placeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlacesFormatError('Ongeldige locatiegegevens.');
  return value as Record<string, unknown>;
}

function placeText(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new PlacesFormatError(`Ongeldige ${label}.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, maximum = 200): string | undefined {
  if (value === undefined || (typeof value === 'string' && !value.trim())) return undefined;
  return placeText(value, label, maximum);
}

export function placeCoordinates(value: unknown): PlaceCoordinates {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number'
    || !Number.isFinite(value[0]) || !Number.isFinite(value[1])
    || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new PlacesFormatError('Ongeldige locatiecoördinaten.');
  return [value[0], value[1]];
}

function placeKind(value: unknown): PlaceKind {
  if (value !== 'venue' && value !== 'address' && value !== 'custom') throw new PlacesFormatError('Onbekend locatietype.');
  return value;
}

function placeSources(value: unknown): PlaceSource[] {
  if (!Array.isArray(value) || value.length > 4) throw new PlacesFormatError('Ongeldige locatiebronnen.');
  return Array.from(value, raw => {
    const source = placeObject(raw);
    const provider = placeText(source.provider, 'bron', 40);
    if (!/^[a-z][a-z0-9-]*$/.test(provider)) throw new PlacesFormatError('Ongeldige bronidentiteit.');
    const id = placeText(source.id, 'bron-ID');
    if (source.storage !== 'open' && source.storage !== 'reference-only') throw new PlacesFormatError('Onbekend opslagbeleid voor brongegevens.');
    const url = source.storage === 'open' ? optionalText(source.url, 'bronlink', 2_048) : undefined;
    if (url && !/^https?:\/\//i.test(url)) throw new PlacesFormatError('Ongeldige bronlink.');
    return { provider, id, storage: source.storage, ...(url ? { url } : {}) };
  });
}

function personalData(value: unknown): PersonalPlaceData {
  const personal = placeObject(value);
  if (typeof personal.favorite !== 'boolean' || !Array.isArray(personal.analysisPoints)
    || personal.analysisPoints.length > 8) throw new PlacesFormatError('Ongeldige persoonlijke locatiegegevens.');
  const type = personal.type;
  if (type !== undefined && type !== 'terrace' && type !== 'garden' && type !== 'park' && type !== 'other') throw new PlacesFormatError('Onbekend persoonlijk locatietype.');
  const points = Array.from(personal.analysisPoints, raw => {
    const point = placeObject(raw);
    return { id: placeText(point.id, 'analysepunt-ID'), label: placeText(point.label, 'analysepuntnaam', 80), coordinates: placeCoordinates(point.coordinates) };
  });
  if (new Set(points.map(point => point.id)).size !== points.length) throw new PlacesFormatError('Dubbele analysepunt-ID.');
  return { favorite: personal.favorite, name: optionalText(personal.name, 'eigen naam'),
    note: optionalText(personal.note, 'notitie', 2_000), type, analysisPoints: points };
}

export function normalizeSavedPlace(value: unknown): SavedPlace {
  const record = placeObject(value);
  const id = placeText(record.id, 'locatie-ID', 1_000);
  if (!/^[a-z][a-z0-9-]*:.+/.test(id)) throw new PlacesFormatError('Locatie-ID mist een bronnamespace.');
  const kind = placeKind(record.kind), sources = placeSources(record.sources);
  const personal = personalData(record.personal);
  let snapshot: PlaceSnapshot | undefined;
  if (record.snapshot !== undefined) {
    if (sources.some(source => source.storage !== 'open')) throw new PlacesFormatError('Beperkte brongegevens mogen niet in een locatiesnapshot staan.');
    const data = placeObject(record.snapshot);
    snapshot = { name: placeText(data.name, 'locatienaam'), coordinates: placeCoordinates(data.coordinates),
      address: optionalText(data.address, 'adres', 500) };
  }
  if (kind === 'custom' && !snapshot && !personal.analysisPoints.length) throw new PlacesFormatError('Een eigen locatie heeft een positie nodig.');
  const { createdAt, updatedAt } = record;
  if (typeof createdAt !== 'number' || typeof updatedAt !== 'number' || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)
    || createdAt < 0 || updatedAt < createdAt) throw new PlacesFormatError('Ongeldige locatiedatums.');
  // Only the explicit personal DTO is retained. Venue details, photos, ratings,
  // provider payloads and arbitrary import properties never enter storage.
  return { id, kind, sources, snapshot, personal, createdAt, updatedAt };
}

export function savePlaceRecord(place: Place, previous?: SavedPlace, personal: Partial<PersonalPlaceData> = {}, now = Date.now()): SavedPlace {
  if (previous && previous.id !== place.id) throw new PlacesFormatError('Persoonlijke gegevens horen bij een andere locatie.');
  const sources = placeSources(place.sources);
  return normalizeSavedPlace({ id: place.id, kind: place.kind, sources,
    snapshot: sources.every(source => source.storage === 'open')
      ? { name: place.name, coordinates: place.coordinates, address: place.address } : undefined,
    personal: { favorite: true, analysisPoints: [], ...previous?.personal, ...personal },
    createdAt: previous?.createdAt ?? now, updatedAt: Math.max(now, previous?.updatedAt ?? 0) });
}

export function terracePlace(feature: TerraceFeature): Place {
  const p = feature.properties;
  const sourceId = `${p.osmType}/${p.osmId}`;
  return { id: `osm:${sourceId}`, kind: 'venue', name: p.name, coordinates: placeCoordinates(feature.geometry.coordinates), address: p.address,
    sources: [{ provider: 'osm', id: sourceId, storage: 'open', url: `https://www.openstreetmap.org/${sourceId}` }],
    venue: { amenity: p.amenity, evidence: p.evidence, cuisine: p.cuisine, openingHours: p.openingHours,
      website: p.website, phone: p.phone, wheelchair: p.wheelchair, covered: p.covered } };
}

export function addressPlace(result: SearchResult): Place {
  const coordinates = placeCoordinates(result.coordinates);
  const sourceId = result.osm ? `${result.osm.type}/${result.osm.id}` : undefined;
  return { id: sourceId ? `osm:${sourceId}` : `address:${encodeURIComponent(result.label.toLocaleLowerCase('nl-NL'))}:${coordinates.map(value => value.toFixed(6)).join(':')}`,
    kind: 'address', name: result.label, address: [result.label, result.detail].filter(Boolean).join(', '), coordinates,
    sources: sourceId ? [{ provider: 'osm', id: sourceId, storage: 'open', url: `https://www.openstreetmap.org/${sourceId}` }] : [] };
}

export function customPlace(name: string, coordinates: PlaceCoordinates, id: string = crypto.randomUUID()): Place {
  const sourceId = placeText(id, 'eigen locatie-ID');
  return { id: `custom:${sourceId}`, kind: 'custom', name: placeText(name, 'locatienaam'), coordinates: placeCoordinates(coordinates),
    sources: [{ provider: 'user', id: sourceId, storage: 'open' }] };
}

export function resolveSavedPlace(record: SavedPlace, live?: Place): Place | null {
  if (live && live.id !== record.id) throw new PlacesFormatError('Brongegevens horen bij een andere locatie.');
  const coordinates = live?.coordinates ?? record.snapshot?.coordinates ?? record.personal.analysisPoints[0]?.coordinates;
  if (!coordinates) return null; // reference-only favorites require a fresh provider lookup or an own point
  return { ...live, id: record.id, kind: live?.kind ?? record.kind,
    name: live?.name ?? record.snapshot?.name ?? record.personal.name ?? 'Opgeslagen locatie',
    coordinates: [...coordinates], address: live?.address ?? record.snapshot?.address, sources: structuredClone(record.sources) };
}

export type PlaceSelection = { place: Place; name: string; analysisPoint: AnalysisPoint };

export function createPlaceSelection(lookup: (id: string) => SavedPlace | undefined = () => undefined) {
  let selected: Place | null = null;
  const listeners = new Set<(selection: PlaceSelection | null) => void>();
  const snapshot = (): PlaceSelection | null => {
    if (!selected) return null;
    const personal = lookup(selected.id)?.personal;
    return structuredClone({ place: selected, name: personal?.name ?? selected.name,
      analysisPoint: personal?.analysisPoints[0] ?? { id: `${selected.id}:default`, label: 'Locatiepunt', coordinates: selected.coordinates } });
  };
  const notify = () => { for (const listener of listeners) listener(snapshot()); };
  return {
    get: snapshot,
    select(place: Place | null) { selected = place ? structuredClone(place) : null; notify(); },
    refresh(place: Place) { if (selected?.id === place.id) { selected = structuredClone(place); notify(); } },
    subscribe(listener: (selection: PlaceSelection | null) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
