import { describe, expect, it } from 'vitest';
import { personalMapPoints, personalPlaceRows, savePlaceDraft } from '../src/personal-places';
import { customPlace, savePlaceRecord, terracePlace } from '../src/places';
import { createSavedPlacesStore } from '../src/saved-places';
import { parseOverpass } from '../src/terraces';
import type { DiscoveryContext } from '../src/discovery';

const venue = terracePlace(parseOverpass({ elements: [{ type: 'node', id: 42, lat: 53.219, lon: 6.568,
  tags: { name: 'Testcafé', amenity: 'cafe', outdoor_seating: 'yes' } }] })[0]);
const context: DiscoveryContext = { terraces: [], bounds: { south: 53.21, north: 53.23, west: 6.56, east: 6.58 },
  origin: [6.568, 53.219], originLabel: 'het kaartcentrum', state: 'ready', onlySunny: true, terracesVisible: false,
  statusPending: false, statusUnavailable: false, timeLabel: 'Testtijd' };
function store() {
  const data = new Map<string, string>();
  return createSavedPlacesStore({ storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, now: () => 200 });
}

describe('persoonlijke plekken gebruiken', () => {
  it('bewerkt de persoonlijke terraspositie zonder bronpin, ID of extra analysepunten te verliezen', () => {
    const places = store();
    places.save(venue, { analysisPoints: [
      { id: 'primary', label: 'Terras', coordinates: [6.5681, 53.2191] },
      { id: 'secondary', label: 'Balkonpunt', coordinates: [6.5682, 53.2192] },
    ] });
    const saved = savePlaceDraft(places, venue, { name: 'Mijn terras', note: 'Achter de zaak', type: 'terrace', coordinates: [6.569, 53.22] });
    expect(saved.id).toBe('osm:node/42');
    expect(saved.snapshot?.coordinates).toEqual([6.568, 53.219]);
    expect(saved.personal.analysisPoints[0]).toMatchObject({ id: 'primary', coordinates: [6.569, 53.22] });
    expect(saved.personal.analysisPoints[1]).toEqual({ id: 'secondary', label: 'Balkonpunt', coordinates: [6.5682, 53.2192] });
    expect(venue.coordinates).toEqual([6.568, 53.219]);
  });

  it('houdt de eigen bronpositie en persoonlijke positie bij eigen punten consistent', () => {
    const places = store(), own = customPlace('Tuin', [6.568, 53.219], 'garden');
    const saved = savePlaceDraft(places, own, { name: 'Mijn tuin', type: 'garden', note: '', coordinates: [6.57, 53.22] });
    expect(saved.snapshot).toMatchObject({ name: 'Mijn tuin', coordinates: [6.57, 53.22] });
    expect(saved.personal.analysisPoints[0].coordinates).toEqual([6.57, 53.22]);
    expect(personalMapPoints([saved])[0]).toMatchObject({ id: 'custom:garden', name: 'Mijn tuin', coordinates: [6.57, 53.22] });
  });

  it('zoekt ook opgeslagen plekken buiten het kaartgebied, zonder de openbare zonfilter toe te passen', () => {
    const outside = savePlaceRecord(customPlace('Parijs', [2.35, 48.86], 'paris'), undefined, { note: 'Mijn café aan het water' }, 100);
    const rows = personalPlaceRows([outside], context, 'cafe water');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Parijs');
    expect(rows[0].distance).toBeGreaterThan(100_000);
    expect(rows[0].place?.venue).toBeUndefined();
  });

  it('behandelt referenties zonder positie als niet selecteerbaar, zonder een punt te verzinnen', () => {
    const record = savePlaceRecord({ ...venue, id: 'provider:id', sources: [{ provider: 'provider', id: 'id', storage: 'reference-only' }] },
      undefined, { name: 'Mijn referentie' }, 100);
    const row = personalPlaceRows([record], context)[0];
    expect(row.place).toBeNull(); expect(row.coordinates).toBeUndefined(); expect(row.distance).toBeNull();
    expect(personalMapPoints([record])).toEqual([]);
  });

  it('tekent geen dubbele horeca-marker voor een gewone favoriet, wel een verplaatst eigen punt', () => {
    const places = store();
    const ordinary = places.save(venue);
    expect(personalMapPoints([ordinary])).toEqual([]);
    const moved = savePlaceDraft(places, venue, { name: 'Mijn zitplek', type: 'terrace', note: '', coordinates: [6.569, 53.22] });
    expect(personalMapPoints([moved])).toHaveLength(1);
  });

  it('weigert lege namen en ongeldige posities voordat de collectie verandert', () => {
    const places = store();
    expect(() => savePlaceDraft(places, venue, { name: ' ', type: 'other', note: '', coordinates: [6, 53] })).toThrow('naam');
    expect(() => savePlaceDraft(places, venue, { name: 'Plek', type: 'other', note: '', coordinates: [181, 53] })).toThrow('coördinaten');
    expect(places.list()).toEqual([]);
  });
});
