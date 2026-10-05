import type { Feature, MultiPolygon, Point, Polygon, Position } from 'geojson';
import type { LeafCycle, TreeProfileId } from './tree-profiles';

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
export type CategorizedBuilding = Feature<Polygon | MultiPolygon, BuildingProperties & {
  buildingType: string;
  minHeight: number;
  hasHeight: boolean;
  isPart: boolean;
}>;
export type TreeFeature = Feature<Polygon, BuildingProperties & {
  species?: string;
  scientificName?: string;
  heightClass?: string;
  profile?: TreeProfileId;
  leafCycle?: LeafCycle;
  phenologyShift?: number;
  crownRadius?: number;
  rotation?: number;
}>;

export type ShadowMesh = {
  origin: [number, number];
  vertices: Float32Array;
};

export type TerraceStatus = 'sun' | 'shade' | 'filtered' | 'night';
export type TerraceEvidence = 'confirmed' | 'possible' | 'mapped';

export type TerraceProperties = {
  id: string;
  name: string;
  amenity: string;
  status: TerraceStatus;
  shadeSource?: 'building' | 'tree';
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
  shadeSource?: 'building' | 'tree';
};
