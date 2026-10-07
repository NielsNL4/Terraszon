import { describe, expect, it } from 'vitest';
import { addressPlace, createPlaceSelection, customPlace, normalizeSavedPlace, placeCoordinates,
  resolveSavedPlace, savePlaceRecord, terracePlace, type Place } from '../src/places';
import { parseOverpass } from '../src/terraces';
import { parseSearchResults } from '../src/search';

const venue = () => terracePlace(parseOverpass({ elements: [{ type: 'node', id: 42, lat: 53.21, lon: 6.57,
  tags: { amenity: 'cafe', name: 'De Zon', outdoor_seating: 'yes', opening_hours: 'Mo-Su 10:00-22:00' } }] })[0]);

describe('gedeeld locatiemodel', () => {
  it('houdt dezelfde OSM-identiteit bij horeca en een geocoderresultaat, ook wanneer de naam verandert', () => {
    const results = parseSearchResults({ features: [{ geometry: { type: 'Point', coordinates: [6.57, 53.21] },
      properties: { name: 'Andere bronnaam', osm_type: 'N', osm_id: 42 } }] });
    expect(addressPlace(results[0]).id).toBe(venue().id);
    expect(venue().id).toBe('osm:node/42');
    expect(venue().venue?.openingHours).toBe('Mo-Su 10:00-22:00');
  });

  it('kan adressen zonder OSM-ID en eigen kaartpunten modelleren zonder een horecarecord te verzinnen', () => {
    const address = addressPlace({ label: 'Tuinadres', detail: 'Groningen', kind: 'address', coordinates: [6.57, 53.21] });
    const own = customPlace('Mijn tuin', [6.58, 53.22], 'garden');
    expect(address.id).toMatch(/^address:/);
    expect(address.venue).toBeUndefined();
    expect(own).toMatchObject({ id: 'custom:garden', kind: 'custom', coordinates: [6.58, 53.22] });
    expect(own.venue).toBeUndefined();
  });

  it('laat source-refresh persoonlijke analysepunten, namen en notities intact', () => {
    const first = venue();
    const saved = savePlaceRecord(first, undefined, { name: 'Ons terras', note: 'Achter de zaak',
      analysisPoints: [{ id: 'terrace', label: 'Achterterras', coordinates: [6.571, 53.211] }] }, 100);
    const selection = createPlaceSelection(id => id === saved.id ? saved : undefined);
    selection.select(first);
    const fresh: Place = { ...first, name: 'Nieuwe zaaknaam', coordinates: [6.572, 53.212] };
    selection.refresh(fresh);
    expect(selection.get()).toMatchObject({ name: 'Ons terras', place: { name: 'Nieuwe zaaknaam' },
      analysisPoint: { coordinates: [6.571, 53.211] } });
    const refreshed = savePlaceRecord(fresh, saved, {}, 200);
    expect(refreshed.personal).toEqual(saved.personal);
    expect(refreshed.snapshot?.coordinates).toEqual([6.572, 53.212]);
    expect(refreshed.createdAt).toBe(100);
    expect(refreshed.updatedAt).toBe(200);
  });

  it('gebruikt dezelfde selectiestroom voor horeca, adres en eigen punten en deelt geen mutable state', () => {
    const selection = createPlaceSelection();
    const own = customPlace('Mijn tuin', [6.58, 53.22], 'garden');
    for (const place of [venue(), addressPlace({ label: 'Adres', detail: '', kind: 'address', coordinates: [6.57, 53.21] }), own]) {
      selection.select(place);
      expect(selection.get()?.analysisPoint.coordinates).toEqual(place.coordinates);
    }
    const snapshot = selection.get()!;
    snapshot.analysisPoint.coordinates[0] = 0;
    snapshot.place.name = 'Gewijzigd buiten de store';
    expect(selection.get()?.place.name).toBe('Mijn tuin');
    expect(selection.get()?.analysisPoint.coordinates).toEqual([6.58, 53.22]);
    selection.refresh(venue());
    expect(selection.get()?.place.id).toBe(own.id);
  });

  it('bewaart bij beperkte providers alleen identifiers en persoonlijke gegevens', () => {
    const restricted: Place = { ...venue(), id: 'google:place-id', sources: [{ provider: 'google', id: 'place-id',
      storage: 'reference-only', url: 'https://example.test/privileged' }] };
    const saved = savePlaceRecord(restricted, undefined, { note: 'Mijn notitie' }, 100);
    expect(saved.snapshot).toBeUndefined();
    expect(saved.sources[0].url).toBeUndefined();
    expect(resolveSavedPlace(saved)).toBeNull();
    expect(resolveSavedPlace(saved, restricted)?.venue?.openingHours).toBe('Mo-Su 10:00-22:00');
    expect(saved).not.toHaveProperty('venue');
  });

  it('valideert coördinaten, dubbele analysepunten en persoonlijke records', () => {
    for (const point of [[181, 53], [6, 91], [NaN, 53], [6, 53, 10], ['6', 53], new Array(2)]) {
      expect(() => placeCoordinates(point)).toThrow('coördinaten');
    }
    const saved = savePlaceRecord(venue(), undefined, {}, 100);
    expect(() => normalizeSavedPlace({ ...saved, personal: { ...saved.personal,
      analysisPoints: [{ id: 'a', label: 'A', coordinates: [6, 53] }, { id: 'a', label: 'B', coordinates: [6, 53] }] } })).toThrow('Dubbele');
    expect(() => normalizeSavedPlace({ ...saved, updatedAt: 99 })).toThrow('datums');
    expect(() => savePlaceRecord(customPlace('Tuin', [6, 53], 'garden'), saved)).toThrow('andere locatie');
  });
});
