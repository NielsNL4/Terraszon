import type { ShadowWorkerRequest, ShadowWorkerResponse } from './shadow-protocol';
import {
  buildShadowMesh,
  classifyTerracePoints,
  prepareShadowPolygons,
  type PreparedShadowPolygon,
} from './shadows';

type WorkerScope = {
  onmessage: ((event: MessageEvent<ShadowWorkerRequest>) => void) | null;
  postMessage: (message: ShadowWorkerResponse, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;
let generation = 0;
let polygons: PreparedShadowPolygon[] = [];
let generationValid = true;

workerScope.onmessage = (event) => {
  const request = event.data;

  if (request.type === 'set-buildings') {
    generation = request.generation;
    generationValid = false;
    try {
      polygons = prepareShadowPolygons(request.buildings);
      const mesh = buildShadowMesh(polygons);
      generationValid = true;
      workerScope.postMessage({
        type: 'mesh',
        generation,
        mesh,
      }, [mesh.vertices.buffer]);
    } catch (error) {
      polygons = [];
      generationValid = false;
      const mesh = buildShadowMesh([]);
      workerScope.postMessage({ type: 'mesh', generation, mesh }, [mesh.vertices.buffer]);
      workerScope.postMessage({
        type: 'error',
        operation: 'mesh',
        generation,
        message: error instanceof Error ? error.message : 'Schaduwmesh kon niet worden gemaakt',
      });
    }
    return;
  }

  if (request.generation !== generation) return;
  if (!generationValid) {
    workerScope.postMessage({
      type: 'error',
      operation: 'classify',
      id: request.id,
      generation,
      message: 'Gebouwsnapshot is ongeldig',
    });
    return;
  }
  try {
    workerScope.postMessage({
      type: 'statuses',
      id: request.id,
      generation,
      statuses: classifyTerracePoints(
        request.terraces,
        polygons,
        request.altitude,
        request.azimuth,
        request.daylight,
      ),
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      operation: 'classify',
      id: request.id,
      generation,
      message: error instanceof Error ? error.message : 'Terrassen konden niet worden geclassificeerd',
    });
  }
};
