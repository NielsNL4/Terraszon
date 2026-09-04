import { describe, expect, it } from 'vitest';
import { classifyTerraces, parseOverpass } from '../src/terraces';
import type { TerraceFeature } from '../src/types';

const terrace: TerraceFeature = {
  type: 'Feature',
  properties: { id: 'node/1', name: 'Test', amenity: 'cafe', status: 'night' },
  geometry: { type: 'Point', coordinates: [6.5, 53.2] },
};

describe('terrace data', () => {
  it('parses nodes and way centers and skips entries without coordinates', () => {
    const result = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 53.2, lon: 6.5, tags: { name: 'Cafe', amenity: 'cafe' } },
        { type: 'way', id: 2, center: { lat: 53.21, lon: 6.51 }, tags: { amenity: 'restaurant' } },
        { type: 'relation', id: 3 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].properties.name).toBe('Cafe');
    expect(result[1].properties.name).toBe('Naamloos terras');
  });

  it('keeps the source parser focused on named cafe and restaurant records', () => {
    const result = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 53.2, lon: 6.5, tags: { name: 'Cafe', amenity: 'cafe', outdoor_seating: 'yes' } },
        { type: 'node', id: 2, lat: 53.21, lon: 6.51, tags: { name: 'Bar', amenity: 'bar', outdoor_seating: 'yes' } },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((feature) => feature.properties.amenity)).toEqual(['cafe', 'bar']);
  });

  it('uses daylight and shadow geometry to classify a terrace', () => {
    const shadow = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'MultiPolygon' as const,
          coordinates: [[[[6.4, 53.1], [6.6, 53.1], [6.6, 53.3], [6.4, 53.3], [6.4, 53.1]]]],
        },
      }],
    };
    expect(classifyTerraces([terrace], shadow, true)[0].properties.status).toBe('shade');
    expect(classifyTerraces([terrace], shadow, false)[0].properties.status).toBe('night');
  });
});
