import type {
  BuildingFeature,
  ShadowMesh,
  TerracePoint,
  TerraceStatusResult,
} from './types';

export type ShadowWorkerRequest =
  | {
    type: 'set-buildings';
    generation: number;
    buildings: BuildingFeature[];
  }
  | {
    type: 'classify';
    id: number;
    generation: number;
    terraces: TerracePoint[];
    altitude: number;
    azimuth: number;
    daylight: boolean;
  };

export type ShadowWorkerResponse =
  | {
    type: 'mesh';
    generation: number;
    mesh: ShadowMesh;
  }
  | {
    type: 'statuses';
    id: number;
    generation: number;
    statuses: TerraceStatusResult[];
  }
  | {
    type: 'error';
    operation: 'mesh' | 'classify';
    id?: number;
    generation: number;
    message: string;
  };
