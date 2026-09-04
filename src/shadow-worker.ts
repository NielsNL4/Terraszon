import { buildShadows } from './shadows';
import type { BuildingFeature } from './types';

type ShadowRequest =
  | { type: 'set-buildings'; buildings: BuildingFeature[] }
  | { type: 'calculate'; id: number; altitude: number; azimuth: number };

let buildings: BuildingFeature[] = [];

self.onmessage = (event: MessageEvent<ShadowRequest>) => {
  const request = event.data;
  if (request.type === 'set-buildings') {
    buildings = request.buildings;
    return;
  }

  try {
    self.postMessage({
      type: 'result',
      id: request.id,
      shadows: buildShadows(buildings, request.altitude, request.azimuth),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Schaduwberekening mislukt',
    });
  }
};
