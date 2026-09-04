import earcut, { flatten } from 'earcut';
import type { Position } from 'geojson';
import type {
  BuildingFeature,
  ShadowMesh,
  TerracePoint,
  TerraceStatusResult,
} from './types';

const EARTH_METERS_PER_DEGREE = 111_320;
const EARTH_CIRCUMFERENCE = 40_075_016.68557849;
const MAX_MERCATOR_LATITUDE = 85.051129;
export const MIN_SUN_ALTITUDE = 0.5;
export const MAX_SHADOW_LENGTH = 500;
export const SHADOW_VERTEX_STRIDE = 5;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PreparedShadowPolygon = Bounds & {
  height: number;
  rings: Position[][];
};

function cleanRing(ring: Position[]): Position[] {
  if (ring.length < 3) return [];
  const end = ring.length - 1;
  const isClosed = ring[0][0] === ring[end][0] && ring[0][1] === ring[end][1];
  return (isClosed ? ring.slice(0, end) : ring)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function polygonsOf(building: BuildingFeature): Position[][][] {
  return building.geometry.type === 'Polygon'
    ? [building.geometry.coordinates]
    : building.geometry.coordinates;
}

export function prepareShadowPolygons(buildings: BuildingFeature[]): PreparedShadowPolygon[] {
  const polygons: PreparedShadowPolygon[] = [];

  for (const building of buildings) {
    for (const polygon of polygonsOf(building)) {
      const outerRing = cleanRing(polygon[0] ?? []);
      if (outerRing.length < 3) continue;
      const rings = [
        outerRing,
        ...polygon.slice(1).map(cleanRing).filter((ring) => ring.length >= 3),
      ];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of rings[0]) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
      polygons.push({
        height: Math.max(0, building.properties.height),
        rings,
        minX,
        minY,
        maxX,
        maxY,
      });
    }
  }

  return polygons;
}

function mercatorPosition(position: Position): [number, number, number] {
  const longitude = position[0];
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, position[1]));
  const latitudeRadians = latitude * Math.PI / 180;
  const x = (longitude + 180) / 360;
  const y = (180 - 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))) / 360;
  const metersToMercator = 1 / (EARTH_CIRCUMFERENCE * Math.cos(latitudeRadians));
  return [x, y, metersToMercator];
}

function addVertex(
  vertices: number[],
  position: Position,
  origin: [number, number],
  height: number,
  projected: number,
): void {
  const [x, y, metersToMercator] = mercatorPosition(position);
  vertices.push(
    x - origin[0],
    y - origin[1],
    height * metersToMercator,
    MAX_SHADOW_LENGTH * metersToMercator,
    projected,
  );
}

export function buildShadowMesh(polygons: PreparedShadowPolygon[]): ShadowMesh {
  const firstPoint = polygons[0]?.rings[0]?.[0];
  const [originX, originY] = firstPoint ? mercatorPosition(firstPoint) : [0, 0, 0];
  const origin: [number, number] = [originX, originY];
  const vertices: number[] = [];

  for (const polygon of polygons) {
    const flattened = flatten(polygon.rings);
    const triangles = earcut(flattened.vertices, flattened.holes, flattened.dimensions);
    const pointAt = (index: number): Position => [
      flattened.vertices[index * flattened.dimensions],
      flattened.vertices[index * flattened.dimensions + 1],
    ];

    for (let index = 0; index < triangles.length; index += 3) {
      for (const projected of [0, 1]) {
        addVertex(vertices, pointAt(triangles[index]), origin, polygon.height, projected);
        addVertex(vertices, pointAt(triangles[index + 1]), origin, polygon.height, projected);
        addVertex(vertices, pointAt(triangles[index + 2]), origin, polygon.height, projected);
      }
    }

    for (const ring of polygon.rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const current = ring[index];
        const next = ring[(index + 1) % ring.length];
        addVertex(vertices, current, origin, polygon.height, 0);
        addVertex(vertices, next, origin, polygon.height, 0);
        addVertex(vertices, next, origin, polygon.height, 1);
        addVertex(vertices, current, origin, polygon.height, 0);
        addVertex(vertices, next, origin, polygon.height, 1);
        addVertex(vertices, current, origin, polygon.height, 1);
      }
    }
  }

  return { origin, vertices: new Float32Array(vertices) };
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

function translatePosition(position: Position, eastMeters: number, northMeters: number): Position {
  const latitude = position[1];
  const longitudeScale = EARTH_METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  return [
    position[0] + eastMeters / Math.max(longitudeScale, 1),
    latitude + northMeters / EARTH_METERS_PER_DEGREE,
  ];
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

function pointInPolygon(point: Position, rings: Position[][]): boolean {
  if (!pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function orientation(a: Position, b: Position, c: Position): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  const epsilon = 1e-12;
  return Math.abs(orientation(start, end, point)) <= epsilon
    && point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function segmentIntersectsPolygon(start: Position, end: Position, polygon: PreparedShadowPolygon): boolean {
  if (pointInPolygon(start, polygon.rings) || pointInPolygon(end, polygon.rings)) return true;
  return polygon.rings.some((ring) => ring.some((current, index) =>
    segmentsIntersect(start, end, current, ring[(index + 1) % ring.length]),
  ));
}

function pointInBuildingShadows(
  point: Position,
  polygons: PreparedShadowPolygon[],
  vectorForHeight: (height: number) => { east: number; north: number } | null,
): boolean {
  for (const polygon of polygons) {
    // A restaurant POI often uses the center of its containing building as
    // its location. That building cannot cast a shadow onto the POI itself.
    if (pointInPolygon(point, polygon.rings)) continue;
    const vector = vectorForHeight(polygon.height);
    if (!vector) continue;

    const towardSun = translatePosition(point, -vector.east, -vector.north);
    const minX = Math.min(point[0], towardSun[0]);
    const minY = Math.min(point[1], towardSun[1]);
    const maxX = Math.max(point[0], towardSun[0]);
    const maxY = Math.max(point[1], towardSun[1]);
    if (maxX < polygon.minX || minX > polygon.maxX
      || maxY < polygon.minY || minY > polygon.maxY) continue;

    if (segmentIntersectsPolygon(point, towardSun, polygon)) return true;
  }

  return false;
}

function vectorCache(
  altitudeDegrees: number,
  azimuthDegrees: number,
): (height: number) => { east: number; north: number } | null {
  const vectors = new Map<number, { east: number; north: number } | null>();
  return (height) => {
    const cached = vectors.get(height);
    if (cached !== undefined) return cached;
    const vector = shadowVector(height, altitudeDegrees, azimuthDegrees);
    vectors.set(height, vector);
    return vector;
  };
}

export function isPointInBuildingShadows(
  point: Position,
  polygons: PreparedShadowPolygon[],
  altitudeDegrees: number,
  azimuthDegrees: number,
): boolean {
  return pointInBuildingShadows(
    point,
    polygons,
    vectorCache(altitudeDegrees, azimuthDegrees),
  );
}

export function classifyTerracePoints(
  terraces: TerracePoint[],
  polygons: PreparedShadowPolygon[],
  altitudeDegrees: number,
  azimuthDegrees: number,
  daylight: boolean,
): TerraceStatusResult[] {
  const vectorForHeight = vectorCache(altitudeDegrees, azimuthDegrees);
  return terraces.map((terrace) => ({
    id: terrace.id,
    status: !daylight
      ? 'night'
      : pointInBuildingShadows(
        terrace.coordinates,
        polygons,
        vectorForHeight,
      ) ? 'shade' : 'sun',
  }));
}
