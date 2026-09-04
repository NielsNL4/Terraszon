import { describe, expect, it } from 'vitest';
import { buildShadows, isPointInShadows, shadowVector } from '../src/shadows';
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

  it('creates polygons usable for point classification', () => {
    const shadows = buildShadows([building], 45, 180);
    expect(shadows.features).toHaveLength(1);
    expect(isPointInShadows(
      { type: 'Point', coordinates: [6.000025, 53.00007] },
      shadows,
    )).toBe(true);
    expect(isPointInShadows(
      { type: 'Point', coordinates: [6.001, 53] },
      shadows,
    )).toBe(false);
  });

  it('merges overlapping shadows into one renderable feature', () => {
    const overlappingBuilding: BuildingFeature = {
      ...building,
      properties: { id: 'two', height: 8 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [6.00002, 53],
          [6.00007, 53],
          [6.00007, 53.00002],
          [6.00002, 53.00002],
          [6.00002, 53],
        ]],
      },
    };
    const shadows = buildShadows([building, overlappingBuilding], 45, 180);

    expect(shadows.features).toHaveLength(1);
    expect(isPointInShadows(
      { type: 'Point', coordinates: [6.00006, 53.00007] },
      shadows,
    )).toBe(true);
  });

  it('returns safely when the global union cannot be completed', () => {
    const malformed = {
      ...building,
      properties: { id: 'broken', height: 8 },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [6.00001, 53],
          [6.00001, 53],
          [6.00001, 53],
        ]],
      },
    };
    expect(() => buildShadows([building, malformed], 45, 180)).not.toThrow();
  });
});
