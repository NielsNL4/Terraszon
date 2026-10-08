import { describe, expect, it } from 'vitest';
import { createBuildingGeometry } from '../src/building-geometry';
import { parseBuildings } from '../src/building-types';

const bounds = { west: 6, east: 6.01, south: 53, north: 53.01 };
const geometry = [{ lon: 6.001, lat: 53.001 }, { lon: 6.002, lat: 53.001 },
  { lon: 6.002, lat: 53.002 }, { lon: 6.001, lat: 53.002 }, { lon: 6.001, lat: 53.001 }];
const feature = (type: string) => parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: type, height: '8' }, geometry }] })[0];

describe('incrementele gebouwweergave', () => {
  it('vervangt een neutraal gebouw door zijn eigen contour en stuurt daarna geen identieke geometrie opnieuw', () => {
    const engine = createBuildingGeometry();
    const tile = { geometry: feature('yes').geometry, properties: { render_height: 8, render_min_height: 0 } };
    const neutral = engine.prepare(bounds, [tile]);
    expect(neutral.diff.add).toHaveLength(1);
    engine.setKnown([feature('house')]);
    const colored = engine.prepare(bounds);
    expect(colored.diff.remove).toHaveLength(1);
    expect(colored.diff.add).toHaveLength(1);
    expect(colored.diff.add![0].properties!.buildingType).toBe('house');
    expect(engine.setKnown([feature('house')])).toBe(false);
    expect(engine.prepare(bounds).changed).toBe(false);
  });
  it('stuurt alleen het gewijzigde object bij een typewijziging', () => {
    const engine = createBuildingGeometry();
    engine.setKnown([feature('house')]);
    engine.prepare(bounds);
    engine.setKnown([feature('apartments')]);
    const result = engine.prepare(bounds);
    expect(result.diff.remove).toEqual([]);
    expect(result.diff.add).toEqual([]);
    expect(result.diff.update).toEqual([{ id: 'way/1', addOrUpdateProperties: [{ key: 'buildingType', value: 'apartments' }] }]);
  });
  it('behoudt bekende informatie na een leeg/mislukt resultaat en bouwt na contextreset opnieuw op', () => {
    const engine = createBuildingGeometry();
    engine.setKnown([feature('house')]);
    engine.prepare(bounds);
    expect(engine.setKnown([])).toBe(false);
    expect(engine.prepare(bounds).count).toBe(1);
    engine.reset();
    expect(engine.prepare(bounds).diff.add).toHaveLength(1);
  });
  it('invalideert de hergebruikte voorbereiding bij bounds, geometrie en hoogteevidentie', () => {
    const engine = createBuildingGeometry(), first = feature('house'); engine.setKnown([first]); engine.prepare(bounds);
    expect(engine.prepare(bounds)).toMatchObject({ changed: false, count: 1 });
    expect(engine.prepare({ ...bounds, west: 7, east: 8 })).toMatchObject({ changed: true, count: 0 });
    engine.prepare(bounds);
    expect(engine.setKnown([{ ...first, properties: { ...first.properties, hasHeight: false } }])).toBe(true);
    expect(engine.prepare(bounds).changed).toBe(true);
    const moved = structuredClone(first); if (moved.geometry.type === 'Polygon') moved.geometry.coordinates[0][0][0] += 0.0001;
    engine.setKnown([moved]); const result = engine.prepare(bounds);
    expect(result.diff.remove).toEqual(['way/1']); expect(result.diff.add).toHaveLength(1);
  });
});
