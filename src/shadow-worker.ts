import { buildShadows } from './shadows';
import type { BuildingFeature } from './types';

const PREVIEW_BUILDING_LIMIT = 300;
const MAX_CACHED_CHECKPOINTS = 16;

type ShadowResult = ReturnType<typeof buildShadows>;
type Checkpoint = { key: string; altitude: number; azimuth: number };
type WorkerRequest =
  | { type: 'set-buildings'; buildings: BuildingFeature[] }
  | { type: 'warm'; checkpoints: Checkpoint[] }
  | { type: 'calculate'; id: number; key: string; altitude: number; azimuth: number; preview: boolean };

type WorkerError = { type: 'error'; id?: number; phase: 'warm' | 'calculate'; message: string };

let buildings: BuildingFeature[] = [];
const checkpointCache = new Map<string, ShadowResult>();
let warmQueue: Checkpoint[] = [];
let warming = false;

function cacheResult(key: string, shadows: ShadowResult): void {
  checkpointCache.delete(key);
  checkpointCache.set(key, shadows);
  while (checkpointCache.size > MAX_CACHED_CHECKPOINTS) {
    const oldest = checkpointCache.keys().next().value;
    if (oldest) checkpointCache.delete(oldest);
  }
}

function warmNext(): void {
  if (warming || warmQueue.length === 0 || buildings.length === 0) return;
  warming = true;
  const checkpoint = warmQueue.shift();
  try {
    if (checkpoint && !checkpointCache.has(checkpoint.key)) {
      cacheResult(
        checkpoint.key,
        buildShadows(buildings.slice(0, PREVIEW_BUILDING_LIMIT), checkpoint.altitude, checkpoint.azimuth),
      );
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      phase: 'warm',
      message: error instanceof Error ? error.message : 'Checkpoint kon niet worden berekend',
    } satisfies WorkerError);
  }
  warming = false;
  // Yield between checkpoints so exact calculations are handled without starving the worker.
  setTimeout(warmNext, 0);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'set-buildings') {
    buildings = request.buildings;
    checkpointCache.clear();
    warmQueue = [];
    warming = false;
    return;
  }
  if (request.type === 'warm') {
    warmQueue = request.checkpoints;
    warmNext();
    return;
  }

  try {
    const cached = request.preview ? checkpointCache.get(request.key) : undefined;
    const shadows = cached ?? buildShadows(
      request.preview ? buildings.slice(0, PREVIEW_BUILDING_LIMIT) : buildings,
      request.altitude,
      request.azimuth,
    );
    self.postMessage({
      type: 'result',
      id: request.id,
      preview: request.preview,
      cached: Boolean(cached),
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
