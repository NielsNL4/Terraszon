import type { TreeFeature } from './types';

const offsets = Array.from({ length: 12 }, (_, i) => [Math.cos(2 * Math.PI * i / 12), Math.sin(2 * Math.PI * i / 12)]);
export type TreeRecord = [longitude: number, latitude: number, properties: TreeFeature['properties']];
export function treeFromRecord([longitude, latitude, properties]: TreeRecord): TreeFeature {
  const radius = properties.crownRadius!, longitudeScale = 111_320 * Math.cos(latitude * Math.PI / 180);
  const ring = offsets.map(([cos, sin]) => [longitude + radius * cos / longitudeScale, latitude + radius * sin / 111_320]);
  // Keep the same arithmetic and 12-sided crown as the existing source parser.
  ring.push(ring[0]); return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } };
}
export function treeRecord(tree: TreeFeature): TreeRecord {
  const ring = tree.geometry.coordinates[0];
  return [(ring[0][0] + ring[6][0]) / 2, (ring[0][1] + ring[6][1]) / 2, tree.properties];
}
