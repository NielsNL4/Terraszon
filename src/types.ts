import type { Feature, MultiPolygon, Point, Polygon } from 'geojson';

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

export type TerraceStatus = 'sun' | 'shade' | 'night';

export type TerraceProperties = {
  id: string;
  name: string;
  amenity: string;
  status: TerraceStatus;
};

export type TerraceFeature = Feature<Point, TerraceProperties>;
