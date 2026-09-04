import { buildShadows } from './shadows';
import type { BuildingFeature } from './types';

const PREVIEW_BUILDING_LIMIT = 300;

type WorkerRequest =
  | { type: 'set-buildings'; buildings: BuildingFeature[] }
  | { type: 'calculate'; id: number; altitude: number; azimuth: number; preview: boolean };

type WorkerResponse = {
  type: 'result';
  id: number;
  preview: boolean;
  shadows: ReturnType<typeof buildShadows>;
};

let buildings: BuildingFeature[] = [];

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'set-buildings') {
    buildings = request.buildings;
    return;
  }

  const source = request.preview ? buildings.slice(0, PREVIEW_BUILDING_LIMIT) : buildings;
  const shadows = buildShadows(source, request.altitude, request.azimuth);
  const response: WorkerResponse = {
    type: 'result',
    id: request.id,
    preview: request.preview,
    shadows,
  };
  self.postMessage(response);
};
