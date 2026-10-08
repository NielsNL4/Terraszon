import { describe, expect, it } from 'vitest';
import { createTileHeightResolver, parseBuildings } from '../src/building-types';
import { buildShadowMesh, MAX_SHADOW_MESH_FLOATS, prepareShadowPolygons, selectShadowBuildings } from '../src/shadows';
import type { BuildingFeature } from '../src/types';

const building: BuildingFeature = { type: 'Feature', properties: { id: 'one', height: 10 },
  geometry: { type: 'Polygon', coordinates: [[[6, 53], [6.001, 53], [6.001, 53.001], [6, 53.001], [6, 53]]] } };
describe('geheugenbegrenzing bij opstart', () => {
  it('indexeert een zeer brede tegelcontour zonder miljoenen cellen en houdt de juiste hoogte', () => {
    const resolve = createTileHeightResolver([{ geometry: { type: 'Polygon', coordinates: [[[-170, -80], [170, -80], [170, 80], [-170, 80], [-170, -80]]] }, properties: { render_height: 42 } }]);
    const known = parseBuildings({ elements: [{ type: 'way', id: 1, tags: { building: 'yes' }, geometry: [{ lon: 6, lat: 53 }, { lon: 6.001, lat: 53 }, { lon: 6.001, lat: 53.001 }, { lon: 6, lat: 53 }] }] });
    expect(resolve(known)[0].properties.height).toBe(42);
  });
  it('telt werkelijke polygonen en coördinaten, ook als een tegel één samengevoegd feature heeft', () => {
    const merged: BuildingFeature = { ...building, geometry: { type: 'MultiPolygon', coordinates: Array.from({ length: 2000 }, () => building.geometry.type === 'Polygon' ? building.geometry.coordinates : []) } };
    const selected = selectShadowBuildings([merged]); expect(selected.buildings).toHaveLength(1500); expect(selected.limited).toBe(true);
    const small = selectShadowBuildings([building], 4); expect(small.buildings).toEqual([]); expect(small.limited).toBe(true);
  });
  it('houdt de output én backing buffer van de schaduwmesh binnen 12 MB', () => {
    const polygon = prepareShadowPolygons([building])[0];
    const mesh = buildShadowMesh(Array(20_000).fill(polygon));
    expect(mesh.vertices.buffer.byteLength).toBeLessThanOrEqual(MAX_SHADOW_MESH_FLOATS * 4); expect(mesh.limited).toBe(true);
    const normal = buildShadowMesh([polygon]); expect(normal.vertices).toHaveLength(180); expect(normal.limited).toBeUndefined();
  });
});
