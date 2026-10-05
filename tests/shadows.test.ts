import { describe, expect, it } from 'vitest';
import {
  buildShadowMesh,
  classifyTerracePoints,
  isPointInBuildingShadows,
  prepareShadowPolygons,
  shadowVector,
} from '../src/shadows';
import type { BuildingFeature, TreeFeature } from '../src/types';
import { parseTrees } from '../src/trees';
import { prepareTreeObstacles, possibleTreeShade } from '../src/tree-shadows';

const building: BuildingFeature = {
  type: 'Feature',
  properties: { id: 'one', height: 10 },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [6, 53],
      [6.00005, 53],
      [6.00005, 53.00002],
      [6, 53.00002],
      [6, 53],
    ]],
  },
};

describe('shadow projection', () => {
  it('projects away from the sun with the expected length', () => {
    const vector = shadowVector(10, 45, 180);
    expect(vector?.length).toBeCloseTo(10, 5);
    expect(vector?.north).toBeCloseTo(10, 5);
    expect(vector?.east).toBeCloseTo(0, 5);
  });

  it('limits extreme shadows and returns none at night', () => {
    expect(shadowVector(100, 0.01, 90)?.length).toBe(500);
    expect(shadowVector(10, -1, 90)).toBeNull();
  });

  it('builds one static triangle mesh for GPU projection', () => {
    const mesh = buildShadowMesh(prepareShadowPolygons([building]));
    expect(mesh.vertices).toBeInstanceOf(Float32Array);
    expect(mesh.vertices).toHaveLength(36 * 5);
    expect([...mesh.vertices].every(Number.isFinite)).toBe(true);
    expect(new Set([...mesh.vertices].filter((_, index) => index % 5 === 4)))
      .toEqual(new Set([0, 1]));
  });

  it('classifies a point against the swept footprint without creating polygons', () => {
    const polygons = prepareShadowPolygons([building]);
    expect(isPointInBuildingShadows([6.000025, 53.00007], polygons, 45, 180)).toBe(true);
    expect(isPointInBuildingShadows([6.001, 53], polygons, 45, 180)).toBe(false);
  });

  it('keeps courtyard holes open when the sun is directly overhead', () => {
    const withCourtyard: BuildingFeature = {
      ...building,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[6, 53], [6.0001, 53], [6.0001, 53.0001], [6, 53.0001], [6, 53]],
          [[6.00003, 53.00003], [6.00007, 53.00003], [6.00007, 53.00007], [6.00003, 53.00007], [6.00003, 53.00003]],
        ],
      },
    };
    const polygons = prepareShadowPolygons([withCourtyard]);
    expect(isPointInBuildingShadows([6.00005, 53.00005], polygons, 90, 180)).toBe(false);
    expect(isPointInBuildingShadows([6.00001, 53.00011], polygons, 45, 180)).toBe(true);
  });

  it('returns compact statuses and applies night as an explicit override', () => {
    const polygons = prepareShadowPolygons([building]);
    const terraces = [{ id: 'one', coordinates: [6.000025, 53.00007] }];
    expect(classifyTerracePoints(terraces, polygons, 45, 180, true)).toEqual([
      { id: 'one', status: 'shade', shadeSource: 'building' },
    ]);
    expect(classifyTerracePoints(terraces, polygons, 45, 180, false)).toEqual([
      { id: 'one', status: 'night' },
    ]);
  });

  it('does not shade a POI located inside its containing building', () => {
    const polygons = prepareShadowPolygons([building]);
    const terraces = [{ id: 'inside', coordinates: [6.000025, 53.00001] }];
    expect(classifyTerracePoints(terraces, polygons, 45, 180, true)).toEqual([
      { id: 'inside', status: 'sun' },
    ]);
  });

  it('shades under a tree canopy and down-sun, but not when trees are switched off', () => {
    const trees: TreeFeature[] = parseTrees({ elements: [{
      type: 'node', id: 7, lat: 53, lon: 6, tags: { natural: 'tree', height: '10', diameter_crown: '6' },
    }] });
    const canopy = prepareTreeObstacles(trees);
    const terraces = [
      { id: 'under', coordinates: [6, 53] },
      { id: 'behind', coordinates: [6, 53.00009] },
      { id: 'away', coordinates: [6.001, 53] },
    ];
    expect(classifyTerracePoints(terraces, [], 45, 180, true, canopy)).toEqual([
      { id: 'under', status: 'filtered', shadeSource: 'tree' },
      { id: 'behind', status: 'filtered', shadeSource: 'tree' },
      { id: 'away', status: 'sun' },
    ]);
    expect(classifyTerracePoints(terraces, [], 45, 180, true)).toEqual(
      terraces.map(({ id }) => ({ id, status: 'sun' })),
    );
    expect(classifyTerracePoints(terraces, [], 45, 180, false, canopy)).toEqual(
      terraces.map(({ id }) => ({ id, status: 'night' })),
    );
  });

  it('laat een bladloze kroon licht door, behoudt takschaduw en rekent een hoge kroon niet als grondvolume', () => {
    const trees = parseTrees({ elements: [{ type: 'node', id: 1, lat: 53, lon: 6,
      tags: { natural: 'tree', species: 'Tilia x europaea', height: '15', diameter_crown: '8' } }] });
    trees[0].properties.rotation = 0;
    const prepared = prepareTreeObstacles(trees);
    const underEdge = [6 + 2 / (111_320 * Math.cos(53 * Math.PI / 180)), 53];
    expect(possibleTreeShade(underEdge, prepared, 90, 180, '2026-07-15')).toBe(true);
    expect(possibleTreeShade(underEdge, prepared, 90, 180, '2026-01-15')).toBe(false);
    expect(possibleTreeShade([6, 53], prepared, 90, 180, '2026-01-15')).toBe(true);
    expect(possibleTreeShade(underEdge, prepared, 10, 0, '2026-07-15')).toBe(false);
    const evergreen = parseTrees({ elements: [{ type: 'node', id: 2, lat: 53, lon: 6,
      tags: { natural: 'tree', species: 'Picea abies', height: '15', diameter_crown: '8' } }] });
    expect(possibleTreeShade(underEdge, prepareTreeObstacles(evergreen), 90, 180, '2026-01-15')).toBe(true);
  });

  it('houdt gebouwschaduw doorslaggevend, ook wanneer een boom eveneens licht kan afschermen', () => {
    const trees = prepareTreeObstacles(parseTrees({ elements: [{ type: 'node', id: 1, lat: 53.00007, lon: 6.000025,
      tags: { natural: 'tree', species: 'Tilia x europaea', height: '15' } }] }));
    expect(classifyTerracePoints([{ id: 'one', coordinates: [6.000025, 53.00007] }],
      prepareShadowPolygons([building]), 45, 180, true, trees, '2026-07-15')).toEqual([
      { id: 'one', status: 'shade', shadeSource: 'building' },
    ]);
  });
});
