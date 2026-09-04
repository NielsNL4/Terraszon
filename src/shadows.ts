import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from 'geojson';
import {
  union,
  type MultiPolygon as ClippingMultiPolygon,
  type Pair,
  type Polygon as ClippingPolygon,
} from 'polygon-clipping';
import type { BuildingFeature } from './types';

const EARTH_METERS_PER_DEGREE = 111_320;
const MIN_SUN_ALTITUDE = 0.5;
const MAX_SHADOW_LENGTH = 500;

type ShadowFeature = Feature<MultiPolygon, { buildingId: string }>;

function translatePosition(position: Position, eastMeters: number, northMeters: number): Position {
  const latitude = position[1];
  const longitudeScale = EARTH_METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  return [
    position[0] + eastMeters / Math.max(longitudeScale, 1),
    latitude + northMeters / EARTH_METERS_PER_DEGREE,
  ];
}

function polygonsOf(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function projectPolygon(
  polygon: Position[][],
  eastMeters: number,
  northMeters: number,
): Position[][][] | null {
  const source = polygon.map((ring) => ring.map((point) => [point[0], point[1]] as Pair));
  const pieces: ClippingPolygon[] = [source];

  for (const ring of source) {
    const translated = ring.map((point) => translatePosition(point, eastMeters, northMeters) as Pair);
    pieces.push([translated]);

    for (let index = 0; index < ring.length - 1; index += 1) {
      pieces.push([[
        ring[index],
        ring[index + 1],
        translated[index + 1],
        translated[index],
        ring[index],
      ]]);
    }
  }

  try {
    return union(pieces[0], ...pieces.slice(1));
  } catch {
    return null;
  }
}

function unionShadowGeometries(geometries: ClippingMultiPolygon[]): ClippingMultiPolygon {
  if (geometries.length === 0) return [];
  return union(geometries[0], ...geometries.slice(1));
}

export function shadowVector(
  height: number,
  altitudeDegrees: number,
  azimuthDegrees: number,
): { east: number; north: number; length: number } | null {
  if (altitudeDegrees <= 0) return null;
  const safeAltitude = Math.max(altitudeDegrees, MIN_SUN_ALTITUDE);
  const length = Math.min(
    Math.max(height, 0) / Math.tan((safeAltitude * Math.PI) / 180),
    MAX_SHADOW_LENGTH,
  );
  const shadowBearing = ((azimuthDegrees + 180) * Math.PI) / 180;

  return {
    east: Math.sin(shadowBearing) * length,
    north: Math.cos(shadowBearing) * length,
    length,
  };
}

export function buildShadows(
  buildings: BuildingFeature[],
  altitudeDegrees: number,
  azimuthDegrees: number,
): FeatureCollection<MultiPolygon, { buildingId: string }> {
  const geometries: ClippingMultiPolygon[] = [];

  for (const building of buildings) {
    const vector = shadowVector(building.properties.height, altitudeDegrees, azimuthDegrees);
    if (!vector) continue;

    const projected: Position[][][] = [];
    for (const polygon of polygonsOf(building.geometry)) {
      const result = projectPolygon(polygon, vector.east, vector.north);
      if (result) projected.push(...result);
    }

    if (projected.length > 0) geometries.push(projected as ClippingMultiPolygon);
  }

  if (geometries.length === 0) return { type: 'FeatureCollection', features: [] };

  const merged = unionShadowGeometries(geometries);
  const feature: ShadowFeature = {
    type: 'Feature',
    properties: { buildingId: 'merged' },
    geometry: { type: 'MultiPolygon', coordinates: merged },
  };

  return { type: 'FeatureCollection', features: [feature] };
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    const crosses = currentY > point[1] !== previousY > point[1]
      && point[0] < ((previousX - currentX) * (point[1] - currentY))
        / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: Position[][]): boolean {
  if (!pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

export function isPointInShadows(
  point: Point,
  shadows: FeatureCollection<MultiPolygon>,
): boolean {
  return shadows.features.some((feature) =>
    feature.geometry.coordinates.some((polygon) => pointInPolygon(point.coordinates, polygon)),
  );
}
