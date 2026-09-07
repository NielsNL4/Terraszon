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
export type TerraceEvidence = 'confirmed' | 'possible' | 'mapped';

export type TerraceProperties = {
  id: string;
  name: string;
  amenity: string;
  status: TerraceStatus;
  evidence: TerraceEvidence;
  cuisine?: string;
  openingHours?: string;
  website?: string;
  phone?: string;
  address?: string;
  wheelchair?: string;
  capacity?: string;
  covered?: string;
  outdoorSeating?: string;
  seasonal?: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
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
