import type { Feature, MultiPolygon, Point, Polygon, Position } from 'geojson';

export type SunState = {
  altitude: number;
  azimuth: number;
  sunrise: Date | null;
  sunset: Date | null;
  isDaylight: boolean;
};

export type BuildingProperties = {
  id: string;
  height: number;
};

export type BuildingFeature = Feature<Polygon | MultiPolygon, BuildingProperties>;

export type ShadowMesh = {
  origin: [number, number];
  vertices: Float32Array;
};

export type TerraceStatus = 'sun' | 'shade' | 'night';

export type TerraceProperties = {
  id: string;
  name: string;
  amenity: string;
  status: TerraceStatus;
};

export type TerraceFeature = Feature<Point, TerraceProperties>;

export type TerracePoint = {
  id: string;
  coordinates: Position;
};

export type TerraceStatusResult = {
  id: string;
  status: TerraceStatus;
};
