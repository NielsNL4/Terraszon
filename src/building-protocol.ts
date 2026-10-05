import type { GeoJSONSourceDiff } from 'maplibre-gl';
import type { BuildingData } from './building-loader';
import type { BuildingBounds, BuildingTile } from './building-geometry';
import type { CategorizedBuilding } from './types';

export type BuildingSummary = Omit<BuildingData, 'buildings'> & { totalBuildings: number; typedBuildings: number; revision: number };
export function buildingViewKey(bounds: BuildingBounds, mobile: boolean): string {
  const latitude = mobile ? 200 : 100, longitude = mobile ? 100 : 50;
  return `${mobile}:${Math.floor(bounds.south * latitude)}:${Math.ceil(bounds.north * latitude)}:${Math.floor(bounds.west * longitude)}:${Math.ceil(bounds.east * longitude)}`;
}
export type BuildingRequest =
  | { type: 'load'; id: number; bounds: BuildingBounds; mobile: boolean }
  | { type: 'cancel'; id: number }
  | { type: 'geometry'; id: number; bounds: BuildingBounds; tiles?: BuildingTile[] }
  | { type: 'known'; buildings: CategorizedBuilding[] }
  | { type: 'reset' };
export type BuildingResponse =
  | { type: 'progress' | 'complete'; id: number; data: BuildingSummary }
  | { type: 'error'; id: number; message: string }
  | { type: 'geometry'; id: number; diff: GeoJSONSourceDiff; count: number; changed: boolean };
