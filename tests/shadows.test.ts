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

});
