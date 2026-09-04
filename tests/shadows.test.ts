import { describe, expect, it } from 'vitest';
import {
  buildShadowMesh,
  classifyTerracePoints,
  isPointInBuildingShadows,
  prepareShadowPolygons,
  shadowVector,
} from '../src/shadows';
import type { BuildingFeature } from '../src/types';

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
      { id: 'one', status: 'shade' },
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
});
