import { createBuildingLoader, type BuildingData, type CachedArea } from './building-loader';
import { createBuildingGeometry } from './building-geometry';
import { createAreaCache } from './area-cache';
import type { BuildingRequest, BuildingResponse, BuildingSummary } from './building-protocol';
import { createWorkerOverpassGate } from './overpass-bridge';
import { setOverpassGate } from './overpass';

const scope = self as unknown as { onmessage: (event: MessageEvent<BuildingRequest>) => void; postMessage: (message: BuildingResponse) => void };
const network = createWorkerOverpassGate(message => scope.postMessage(message));
setOverpassGate(network);
const store = createAreaCache<CachedArea>();
const desktop = createBuildingLoader({ store });
const mobile = createBuildingLoader({ store, mobile: true });
const geometry = createBuildingGeometry();
let active: { id: number; controller: AbortController } | null = null;
let revision = 0;
const generic = new Set(['yes', 'unknown', 'undefined', 'unclassified', 'unidentified', 'other', 'true', 'maybe', 'fixme', 'Y']);
const summary = (data: BuildingData): BuildingSummary => {
  if (geometry.setKnown(data.buildings)) revision++;
  return { capped: data.capped, failedAreas: data.failedAreas, loadedAreas: data.loadedAreas, totalAreas: data.totalAreas,
    completeAreas: data.completeAreas, emptyAreas: data.emptyAreas, partialAreas: data.partialAreas, status: data.status, source: data.source,
    totalBuildings: data.buildings.length, typedBuildings: data.buildings.filter(b => !generic.has(b.properties.buildingType)).length, revision };
};
scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'overpass-grant' || request.type === 'overpass-denied') { network.handle(request); return; }
  if (request.type === 'known') { if (geometry.setKnown(request.buildings)) revision++; return; }
  if (request.type === 'reset') { geometry.reset(); return; }
  if (request.type === 'geometry') {
    try { scope.postMessage({ type: 'geometry', id: request.id, ...geometry.prepare(request.bounds, request.tiles) }); }
    catch (error) { scope.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : 'Gebouwweergave kon niet worden verwerkt' }); }
    return;
  }
  if (request.type === 'cancel') {
    if (active?.id === request.id) { desktop.retain(null); mobile.retain(null); active.controller.abort(); }
    return;
  }
  desktop.retain(request.mobile ? null : request.bounds);
  mobile.retain(request.mobile ? request.bounds : null);
  active?.controller.abort();
  const job = { id: request.id, controller: new AbortController() };
  active = job;
  void (request.mobile ? mobile : desktop)(request.bounds, job.controller.signal, (data) => {
    if (!job.controller.signal.aborted && active === job) scope.postMessage({ type: 'progress', id: job.id, data: summary(data) });
  }).then(data => {
    if (!job.controller.signal.aborted && active === job) scope.postMessage({ type: 'complete', id: job.id, data: summary(data) });
  }).catch(error => {
    if (!job.controller.signal.aborted && active === job) scope.postMessage({ type: 'error', id: job.id, message: error instanceof Error ? error.message : 'Gebouwdata kon niet laden' });
  });
};
