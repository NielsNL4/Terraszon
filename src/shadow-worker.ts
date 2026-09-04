import { buildShadows } from './shadows';
import type { BuildingFeature } from './types';

const PREVIEW_BUILDING_LIMIT = 300;

type WorkerRequest =
  | { type: 'set-buildings'; buildings: BuildingFeature[] }
  | { type: 'calculate'; id: number; altitude: number; azimuth: number; preview: boolean };

type WorkerError = { type: 'error'; id?: number; phase: 'calculate'; message: string };

let buildings: BuildingFeature[] = [];

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'set-buildings') {
    buildings = request.buildings;
    return;
  }

  try {
    const shadows = buildShadows(
      request.preview ? buildings.slice(0, PREVIEW_BUILDING_LIMIT) : buildings,
      request.altitude,
      request.azimuth,
    );
    self.postMessage({
      type: 'result',
      id: request.id,
      preview: request.preview,
      shadows,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: request.id,
      phase: 'calculate',
      message: error instanceof Error ? error.message : 'Schaduw kon niet worden berekend',
    } satisfies WorkerError);
  }
};
