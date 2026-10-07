import { describe, expect, it } from 'vitest';
import { discoveryRows, distanceMeters, inDiscoveryBounds, selectionStatus, sourceFact, type DiscoveryContext } from '../src/discovery';
import { createPlaceSelection, terracePlace } from '../src/places';
import { parseOverpass } from '../src/terraces';

const terraces = parseOverpass({ elements: [
  { type: 'node', id: 1, lat: 53.219, lon: 6.568, tags: { amenity: 'cafe', name: 'Café Noord', outdoor_seating: 'yes' } },
  { type: 'node', id: 2, lat: 53.22, lon: 6.569, tags: { amenity: 'restaurant', name: 'De Tafel', outdoor_seating: 'yes' } },
  { type: 'node', id: 3, lat: 53.221, lon: 6.57, tags: { amenity: 'bar', name: 'Boomzicht' } },
  { type: 'node', id: 4, lat: 52.37, lon: 4.9, tags: { amenity: 'cafe', name: 'Andere stad' } },
] });
terraces[0].properties.status = 'sun';
terraces[1].properties.status = 'shade';
terraces[2].properties.status = 'filtered';
const context = (): DiscoveryContext => ({ terraces, bounds: { south: 53.21, north: 53.23, west: 6.56, east: 6.58 },
  origin: [6.568, 53.219], originLabel: 'het kaartcentrum', state: 'ready', onlySunny: false, terracesVisible: true,
  statusPending: false, statusUnavailable: false, timeLabel: '21 jun 2026 · 12:00' });

describe('plekken ontdekken in het kaartgebied', () => {
  it('toont alleen het huidige gebied, gesorteerd op hemelsbrede afstand', () => {
    const rows = discoveryRows(context());
    expect(rows.map(row => row.place.name)).toEqual(['Café Noord', 'De Tafel', 'Boomzicht']);
    expect(rows[0].distance).toBe(0);
    expect(rows[1].distance).toBeLessThan(rows[2].distance);
  });

  it('zoekt lokaal en accentongevoelig zonder zoekdekking buiten het kaartgebied te suggereren', () => {
    expect(discoveryRows(context(), 'cafe noord').map(row => row.place.id)).toEqual(['osm:node/1']);
    expect(discoveryRows(context(), 'Andere stad')).toEqual([]);
    expect(discoveryRows(context(), 'geen bekende naam')).toEqual([]);
  });

  it('laat Alleen zon exact dezelfde zon-/gefilterd-lichtcategorieën gebruiken als de kaart', () => {
    const rows = discoveryRows({ ...context(), onlySunny: true });
    expect(rows.map(row => row.status)).toEqual(['sun', 'filtered']);
    expect(rows.some(row => row.feature.properties.status === 'shade')).toBe(false);
  });

  it('presenteert geen oude status als een nieuwe berekening nog loopt of mislukt is', () => {
    expect(discoveryRows({ ...context(), statusPending: true }).every(row => row.status === null)).toBe(true);
    expect(discoveryRows({ ...context(), statusUnavailable: true }).every(row => row.status === null)).toBe(true);
  });

  it('maakt geen lijst bij uitgezette horeca, ontbrekende bounds of te lage zoom', () => {
    expect(discoveryRows({ ...context(), terracesVisible: false })).toEqual([]);
    expect(discoveryRows({ ...context(), bounds: null })).toEqual([]);
    expect(discoveryRows({ ...context(), state: 'zoom' })).toEqual([]);
  });

  it('kan eerder geladen plekken behouden tijdens een bronfout', () => {
    expect(discoveryRows({ ...context(), state: 'error' })).toHaveLength(3);
  });

  it('bewaart de juiste afstand nabij de datumgrens en ondersteunt gewrapte kaartbounds', () => {
    expect(distanceMeters([179.99, 0], [-179.99, 0])).toBeCloseTo(2_223.9, 0);
    const bounds = { south: -1, north: 1, west: 179, east: 181 };
    expect(inDiscoveryBounds([-179.5, 0], bounds)).toBe(true);
    expect(inDiscoveryBounds([0, 0], bounds)).toBe(false);
  });

  it('koppelt status aan het echte analysepunt en niet blind aan een verplaatste persoonlijke positie', () => {
    const selection = createPlaceSelection();
    selection.select(terracePlace(terraces[0]));
    expect(selectionStatus(selection.get()!, context())).toBe('sun');
    const moved = selection.get()!;
    moved.analysisPoint.coordinates = [6.569, 53.22];
    expect(selectionStatus(moved, context())).toBeNull();
    expect(selectionStatus(selection.get()!, { ...context(), statusUnavailable: true })).toBeNull();
  });

  it('vertaalt bekende broncategorieën en houdt onbekende waarden herkenbaar als brondata', () => {
    expect(sourceFact('terrace', 'yes')).toBe('Ja');
    expect(sourceFact('wheelchair', 'limited')).toBe('Beperkt toegankelijk');
    expect(sourceFact('covered', 'no')).toBe('Niet overdekt');
    expect(sourceFact('seasonal', 'spring;summer')).toBe('Lente, Zomer');
    expect(sourceFact('terrace', 'unusual_value')).toBe('Bronwaarde: unusual_value');
  });
});
