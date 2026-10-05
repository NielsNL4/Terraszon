import type { GeoJSONSourceDiff } from 'maplibre-gl';
import type { Polygon, MultiPolygon } from 'geojson';
import { buildingBox, createTileHeightResolver, mergeBuildingGeometry } from './building-types';
import type { CategorizedBuilding } from './types';

export type BuildingBounds = { south: number; west: number; north: number; east: number };
export type BuildingTile = { geometry: Polygon | MultiPolygon; properties: Record<string, unknown> | null };

export function createBuildingGeometry() {
  const hashes = new WeakMap<object, string>();
  const boxes = new WeakMap<object, ReturnType<typeof buildingBox>>();
  const hash = (geometry: Polygon | MultiPolygon) => {
    const cached = hashes.get(geometry);
    if (cached) return cached;
    let value = 2_166_136_261, count = 0;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const rings of polygons) for (const ring of rings) {
      value = Math.imul(value ^ ring.length, 16_777_619);
      for (const point of ring) {
        value = Math.imul(value ^ Math.round(point[0] * 10_000_000), 16_777_619);
        value = Math.imul(value ^ Math.round(point[1] * 10_000_000), 16_777_619);
        count++;
      }
    }
    const result = `${count}:${value >>> 0}`;
    hashes.set(geometry, result);
    return result;
  };
  const signature = (feature: CategorizedBuilding) => `${feature.properties.id}:${hash(feature.geometry)}:${feature.properties.height}:${feature.properties.minHeight}:${feature.properties.buildingType}`;
  const box = (geometry: Polygon | MultiPolygon) => {
    if (!boxes.has(geometry)) boxes.set(geometry, buildingBox(geometry));
    return boxes.get(geometry)!;
  };
  let known: CategorizedBuilding[] = [], knownKey = '';
  let fallback: CategorizedBuilding[] = [];
  let resolveHeights = createTileHeightResolver([]);
  let previous = new Map<string, string>();
  let reset = false;
  return {
    setKnown(buildings: CategorizedBuilding[]) {
      if (!buildings.length) return false; // retain previous valid data through outages
      const key = buildings.map(signature).sort().join('|');
      if (key === knownKey) return false;
      knownKey = key; known = buildings;
      return true;
    },
    prepare(bounds: BuildingBounds, tiles?: BuildingTile[]): { diff: GeoJSONSourceDiff; count: number; changed: boolean } {
      if (tiles) {
        resolveHeights = createTileHeightResolver(tiles);
        const unique = new Map<string, CategorizedBuilding>();
        for (const tile of tiles) {
          const height = Number(tile.properties?.render_height) || 9;
          const minHeight = Number(tile.properties?.render_min_height) || 0;
          const polygons = tile.geometry.type === 'Polygon' ? [tile.geometry.coordinates] : tile.geometry.coordinates;
          for (const coordinates of polygons) {
            const geometry: Polygon = { type: 'Polygon', coordinates };
            const id = `tile:${height}:${minHeight}:${hash(geometry)}`;
            if (!unique.has(id)) unique.set(id, { type: 'Feature', id, geometry,
              properties: { id, height, minHeight, hasHeight: true, buildingType: 'yes', isPart: false } });
          }
        }
        fallback = [...unique.values()];
      }
      const intersects = (feature: CategorizedBuilding) => {
        const b = box(feature.geometry);
        return b.west <= bounds.east && b.east >= bounds.west && b.south <= bounds.north && b.north >= bounds.south;
      };
      const features = mergeBuildingGeometry(resolveHeights(known.filter(intersects)), fallback.filter(intersects));
      const next = new Map<string, string>();
      const add: CategorizedBuilding[] = [], remove: string[] = [];
      for (const feature of features) {
        const id = feature.properties.id, key = signature(feature);
        next.set(id, key);
        if (previous.get(id) !== key) {
          if (previous.has(id)) remove.push(id);
          add.push(feature);
        }
      }
      for (const id of previous.keys()) if (!next.has(id)) remove.push(id);
      previous = next;
      const diff = { add, remove, ...(reset ? { removeAll: true } : {}) };
      const changed = reset || !!(add.length || remove.length);
      reset = false;
      return { diff, count: next.size, changed };
    },
    reset() { previous.clear(); reset = true; },
  };
}
