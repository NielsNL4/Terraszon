import { describe, expect, it, vi } from 'vitest';
import { customPlace, savePlaceRecord, type Place } from '../src/places';
import { createSavedPlacesStore, exportPlacesGeoJSON, MAX_SAVED_PLACES, PLACES_STORAGE_KEY } from '../src/saved-places';

const garden = () => customPlace('Mijn tuin', [6.57, 53.21], 'garden');
function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  return { data, storage, store: createSavedPlacesStore({ storage, now: () => 100 }) };
}

describe('persoonlijke locaties lokaal opslaan', () => {
  it('ondersteunt opslaan, herladen, bewerken en verwijderen met dezelfde identiteit', () => {
    const { storage, store } = setup();
    store.save(garden(), { note: 'Achterin', type: 'garden' });
    const reloaded = createSavedPlacesStore({ storage, now: () => 200 });
    expect(reloaded.get('custom:garden')?.personal).toMatchObject({ favorite: true, note: 'Achterin', type: 'garden' });
    reloaded.update('custom:garden', { name: 'Favoriete zitplek', note: '', favorite: false,
      analysisPoints: [{ id: 'bench', label: 'Bankje', coordinates: [6.571, 53.211] }] });
    const edited = createSavedPlacesStore({ storage }).get('custom:garden')!;
    expect(edited.id).toBe('custom:garden');
    expect(edited.personal).toMatchObject({ favorite: false, name: 'Favoriete zitplek', note: undefined });
    expect(edited.createdAt).toBe(100);
    expect(edited.updatedAt).toBe(200);
    reloaded.remove('custom:garden');
    expect(createSavedPlacesStore({ storage }).list()).toEqual([]);
  });

  it('maakt een GeoJSON-roundtrip van de bronpositie én meerdere eigen analysepunten', () => {
    const { store } = setup();
    store.save(garden(), { name: 'Onze tuin', note: 'Privé', analysisPoints: [
      { id: 'bench', label: 'Bankje', coordinates: [6.571, 53.211] },
      { id: 'table', label: 'Tafel', coordinates: [6.572, 53.212] },
    ] });
    const target = setup();
    expect(target.store.import(store.export())).toEqual({ imported: 1, skipped: 0 });
    expect(target.store.list()).toEqual(store.list());
    const file = JSON.parse(store.export());
    expect(file.features[0].geometry).toEqual({ type: 'Point', coordinates: [6.57, 53.21] });
    expect(file.features[0].properties.name).toBe('Onze tuin');
  });

  it('slaat duplicaten over zonder bestaande notities of analysepunten te overschrijven', () => {
    const { store } = setup();
    store.save(garden(), { note: 'Origineel' });
    const incoming = JSON.parse(exportPlacesGeoJSON([savePlaceRecord(garden(), undefined, { note: 'Import' }, 100)]));
    incoming.features.push(incoming.features[0]);
    expect(store.import(JSON.stringify(incoming))).toEqual({ imported: 0, skipped: 2 });
    expect(store.get('custom:garden')?.personal.note).toBe('Origineel');
  });

  it('weigert een ongeldig bestand volledig zonder een gedeeltelijke import op te slaan', () => {
    const { storage, store } = setup();
    store.save(garden());
    const valid = savePlaceRecord(customPlace('Park', [6.6, 53.2], 'park'), undefined, {}, 100);
    const file = JSON.parse(exportPlacesGeoJSON([valid]));
    file.features.push({ ...file.features[0], id: 'custom:invalid', geometry: { type: 'Point', coordinates: [999, 53] } });
    const calls = storage.setItem.mock.calls.length;
    expect(() => store.import(JSON.stringify(file))).toThrow('coördinaten');
    expect(storage.setItem).toHaveBeenCalledTimes(calls);
    expect(store.list().map(record => record.id)).toEqual(['custom:garden']);
  });

  it('weigert ontbrekende analysepunten in sparse arrays voordat er opslag wordt geschreven', () => {
    const { storage, store } = setup();
    expect(() => store.save(garden(), { analysisPoints: new Array(1) })).toThrow('Ongeldige locatiegegevens');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.list()).toEqual([]);
  });

  it('bewaart onbekende schemaversies en beschadigde opslag zonder die te resetten', () => {
    for (const raw of ['{"version":99,"entries":[]}', '{broken']) {
      const { data, storage, store } = setup();
      data.set(PLACES_STORAGE_KEY, raw);
      expect(store.state().status).toBe('error');
      expect(() => store.save(garden())).toThrow();
      expect(data.get(PLACES_STORAGE_KEY)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('behoudt bestaande data bij opslagquota en kan daarna opnieuw proberen', () => {
    const { storage, store } = setup();
    store.save(garden(), { note: 'Origineel' });
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });
    expect(() => store.update('custom:garden', { note: 'Nieuwe notitie' })).toThrow('opgeslagen');
    expect(store.get('custom:garden')?.personal.note).toBe('Origineel');
    expect(store.state().status).toBe('error');
    store.update('custom:garden', { note: 'Nieuwe notitie' });
    expect(store.get('custom:garden')?.personal.note).toBe('Nieuwe notitie');
    expect(store.state().status).toBe('ready');
  });

  it('kan de laatste geldige geheugenversie exporteren als opslag later beschadigd raakt', () => {
    const { data, store } = setup();
    store.save(garden(), { note: 'Bewaren' });
    data.set(PLACES_STORAGE_KEY, '{broken');
    store.reload();
    expect(store.state().status).toBe('error');
    const target = setup();
    target.store.import(store.export());
    expect(target.store.get('custom:garden')?.personal.note).toBe('Bewaren');
    expect(data.get(PLACES_STORAGE_KEY)).toBe('{broken');
  });

  it('blijft leesbaar met geblokkeerde opslag en weigert onzichtbaar tijdelijk opslaan', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: vi.fn() };
    const store = createSavedPlacesStore({ storage });
    expect(store.list()).toEqual([]);
    expect(store.state().status).toBe('error');
    expect(() => store.save(garden())).toThrow('gelezen');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('detecteert wijzigingen uit een ander tabblad in plaats van ze stil te overschrijven', () => {
    const { storage, store } = setup();
    store.save(garden());
    const second = createSavedPlacesStore({ storage, now: () => 200 });
    second.list();
    store.update('custom:garden', { note: 'Eerste tabblad' });
    expect(() => second.update('custom:garden', { name: 'Tweede tabblad' })).toThrow('ander tabblad');
    second.reload();
    second.update('custom:garden', { name: 'Tweede tabblad' });
    expect(second.get('custom:garden')?.personal).toMatchObject({ name: 'Tweede tabblad', note: 'Eerste tabblad' });
  });

  it('exposeert geen mutable interne records', () => {
    const { store } = setup();
    const returned = store.save(garden());
    returned.personal.name = 'Extern';
    const list = store.list();
    list[0].snapshot!.coordinates[0] = 0;
    expect(store.get('custom:garden')?.personal.name).toBeUndefined();
    expect(store.get('custom:garden')?.snapshot?.coordinates).toEqual([6.57, 53.21]);
  });

  it('exporteert geen beperkte providerpayloads of foto\'s en bewaart wel eigen notities', () => {
    const { store } = setup();
    const restricted: Place = { ...garden(), id: 'provider:id', kind: 'venue', name: 'Beperkte zaaknaam',
      sources: [{ provider: 'provider', id: 'id', storage: 'reference-only' }],
      venue: { amenity: 'cafe', evidence: 'possible', openingHours: 'Mo-Su 10:00-22:00' } };
    store.save(restricted, { name: 'Mijn favoriet', note: 'Eigen notitie' });
    const file = store.export();
    expect(file).not.toContain('Beperkte zaaknaam');
    expect(file).not.toContain('openingHours');
    expect(file).not.toContain('6.57');
    const parsed = JSON.parse(file);
    expect(parsed.features[0].geometry).toBeNull();
    expect(parsed.features[0].properties.personal.note).toBe('Eigen notitie');
    const target = setup();
    target.store.import(file);
    expect(target.store.list()).toEqual(store.list());
  });

  it('begrenst het aantal locaties en weigert onbekende importversies', () => {
    const { store } = setup();
    const file = JSON.parse(exportPlacesGeoJSON([savePlaceRecord(garden(), undefined, {}, 100)]));
    file.terraszon.version = 99;
    expect(() => store.import(JSON.stringify(file))).toThrow('ondersteund');
    file.terraszon.version = 1;
    file.features = Array.from({ length: MAX_SAVED_PLACES + 1 }, (_, i) => ({ ...file.features[0], id: `custom:${i}` }));
    expect(() => store.import(JSON.stringify(file))).toThrow('Te veel');
    expect(store.list()).toEqual([]);
  });
});
