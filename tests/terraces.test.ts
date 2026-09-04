import { describe, expect, it } from 'vitest';
import { applyTerraceStatuses, parseOverpass } from '../src/terraces';
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

  it('applies compact worker statuses by terrace id', () => {
    expect(applyTerraceStatuses([terrace], [{ id: 'node/1', status: 'shade' }])[0].properties.status)
      .toBe('shade');
    expect(applyTerraceStatuses([terrace], [{ id: 'node/1', status: 'night' }])[0].properties.status)
      .toBe('night');
  });
});
