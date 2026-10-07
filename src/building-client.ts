import type { GeoJSONSourceDiff } from 'maplibre-gl';
import type { BuildingBounds, BuildingTile } from './building-geometry';
import type { BuildingRequest, BuildingResponse, BuildingSummary } from './building-protocol';
import type { CategorizedBuilding } from './types';
import { createOverpassBroker } from './overpass-bridge';

export function createBuildingClient(onData: (data: BuildingSummary) => void) {
  const worker = new Worker(new URL('./building-worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  const jobs = new Map<number, { resolve: (value: BuildingSummary) => void; reject: (error: Error) => void;
    progress?: (value: BuildingSummary) => void; finish: () => void }>();
  const shapes = new Map<number, { resolve: (data: { diff: GeoJSONSourceDiff; count: number; changed: boolean }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const send = (message: BuildingRequest) => worker.postMessage(message);
  const network = createOverpassBroker(send);
  worker.onmessage = (event: MessageEvent<BuildingResponse>) => {
    const response = event.data;
    if (response.type === 'overpass-acquire' || response.type === 'overpass-release' || response.type === 'overpass-cancel') {
      network.handle(response); return;
    }
    if (response.type === 'geometry') {
      const shape = shapes.get(response.id);
      if (shape) { clearTimeout(shape.timer); shapes.delete(response.id); shape.resolve(response); }
      return;
    }
    if (response.type === 'error') {
      const shape = shapes.get(response.id);
      if (shape) { clearTimeout(shape.timer); shapes.delete(response.id); shape.reject(new Error(response.message)); }
      const job = jobs.get(response.id);
      if (job) { job.finish(); job.reject(new Error(response.message)); }
      return;
    }
    const job = jobs.get(response.id);
    if (!job) return;
    onData(response.data);
    if (response.type === 'progress') job.progress?.(response.data);
    else { job.finish(); job.resolve(response.data); }
  };
  worker.onerror = () => {
    worker.terminate();
    network.destroy();
    for (const job of [...jobs.values()]) { job.finish(); job.reject(new Error('Gebouwverwerking kon niet starten')); }
    for (const shape of shapes.values()) { clearTimeout(shape.timer); shape.reject(new Error('Gebouwverwerking kon niet starten')); }
    shapes.clear();
  };
  return {
    load(bounds: BuildingBounds, mobile: boolean, signal: AbortSignal, progress?: (data: BuildingSummary) => void): Promise<BuildingSummary> {
      if (signal.aborted) return Promise.reject(new DOMException('Afgebroken', 'AbortError'));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const stop = () => { send({ type: 'cancel', id }); finish(); reject(new DOMException('Afgebroken', 'AbortError')); };
        const timer = setTimeout(() => { send({ type: 'cancel', id }); finish(); reject(new Error('Gebouwdata reageerde niet op tijd. Probeer opnieuw.')); }, 48_000);
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); jobs.delete(id); };
        jobs.set(id, { resolve, reject, progress, finish });
        signal.addEventListener('abort', stop, { once: true });
        send({ type: 'load', id, bounds, mobile });
      });
    },
    geometry(bounds: BuildingBounds, tiles?: BuildingTile[]) {
      const id = ++sequence;
      return new Promise<{ diff: GeoJSONSourceDiff; count: number; changed: boolean }>((resolve, reject) => {
        const timer = setTimeout(() => { shapes.delete(id); reject(new Error('Gebouwweergave reageerde niet op tijd')); }, 15_000);
        shapes.set(id, { resolve, reject, timer });
        send({ type: 'geometry', id, bounds, tiles });
      });
    },
    setKnown(buildings: CategorizedBuilding[]) { send({ type: 'known', buildings }); },
    reset() { send({ type: 'reset' }); },
    destroy() {
      for (const job of [...jobs.values()]) { job.finish(); job.reject(new DOMException('Afgebroken', 'AbortError')); }
      for (const shape of shapes.values()) { clearTimeout(shape.timer); shape.reject(new DOMException('Afgebroken', 'AbortError')); }
      shapes.clear(); worker.terminate(); network.destroy();
    },
  };
}
