import { distanceMeters, type DiscoveryContext } from './discovery';
import { placeCoordinates, PlacesFormatError, resolveSavedPlace, terracePlace, type PersonalPlaceData, type Place, type PlaceCoordinates, type SavedPlace } from './places';
import type { createSavedPlacesStore } from './saved-places';

export type SavedPlacesStore = ReturnType<typeof createSavedPlacesStore>;
export type PlaceDraft = { name: string; type: PersonalPlaceData['type']; note: string; coordinates: PlaceCoordinates };
export const personalTypeLabel = (type?: PersonalPlaceData['type']) => type === 'terrace' ? 'Terras' : type === 'garden' ? 'Tuin' : type === 'park' ? 'Park' : 'Overige plek';

export function liveSavedPlace(record: SavedPlace, context: DiscoveryContext): Place | null {
  const live = context.terraces.find(feature => `osm:${feature.properties.osmType}/${feature.properties.osmId}` === record.id);
  return resolveSavedPlace(record, live ? terracePlace(live) : undefined);
}

export function personalPlaceRows(records: SavedPlace[], context: DiscoveryContext, query = '') {
  const normalized = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('nl-NL');
  const tokens = normalized(query).trim().split(/\s+/).filter(Boolean);
  return records.flatMap(record => {
    const place = liveSavedPlace(record, context);
    const name = record.personal.name ?? place?.name ?? 'Opgeslagen locatie';
    if (!tokens.every(token => normalized(`${name} ${record.personal.note ?? ''} ${personalTypeLabel(record.personal.type)}`).includes(token))) return [];
    const coordinates = record.personal.analysisPoints[0]?.coordinates ?? place?.coordinates;
    return [{ record, place, name, coordinates, distance: coordinates ? distanceMeters(context.origin, coordinates) : null }];
  }).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, 'nl-NL') || a.record.id.localeCompare(b.record.id));
}

export function savePlaceDraft(store: SavedPlacesStore, place: Place, draft: PlaceDraft): SavedPlace {
  if (!draft.name.trim()) throw new PlacesFormatError('Geef de plek een naam.');
  const previous = store.get(place.id);
  const coordinates = placeCoordinates(draft.coordinates);
  const primary = previous?.personal.analysisPoints[0];
  const analysisPoints = [{ id: primary?.id ?? `${place.kind === 'custom' ? 'own' : 'seat'}:${crypto.randomUUID()}`,
    label: primary?.label ?? 'Mijn punt', coordinates }, ...(previous?.personal.analysisPoints.slice(1) ?? [])];
  const base = place.kind === 'custom' ? { ...place, name: draft.name, coordinates } : place;
  return store.save(base, { name: draft.name, type: draft.type, note: draft.note, analysisPoints });
}

export function personalMapPoints(records: SavedPlace[]) {
  return records.flatMap(record => {
    const coordinates = record.personal.analysisPoints[0]?.coordinates ?? record.snapshot?.coordinates;
    if (!coordinates) return [];
    const moved = record.personal.analysisPoints.length > 0 && (!record.snapshot || distanceMeters(coordinates, record.snapshot.coordinates) > 0.5);
    if (record.kind === 'venue' && !moved) return [];
    return [{ id: record.id, name: record.personal.name ?? record.snapshot?.name ?? 'Mijn plek', coordinates: [...coordinates] as PlaceCoordinates }];
  });
}
