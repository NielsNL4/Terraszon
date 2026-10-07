import { overpassScheduler, OVERPASS_ENDPOINTS, type OverpassGate, type OverpassLease } from './overpass';
import { aborted, HttpError } from './requests';

export type OverpassFromWorker =
  | { type: 'overpass-acquire'; requestId: number; endpoint: string }
  | { type: 'overpass-cancel'; requestId: number }
  | { type: 'overpass-release'; requestId: number; failure?: { status: number; retryAfterMs: number | null } };
export type OverpassToWorker =
  | { type: 'overpass-grant'; requestId: number }
  | { type: 'overpass-denied'; requestId: number; message: string };

export function createOverpassBroker(send: (message: OverpassToWorker) => void, scheduler: OverpassGate = overpassScheduler) {
  const jobs = new Map<number, { controller: AbortController; lease?: OverpassLease }>();
  return {
    handle(message: OverpassFromWorker) {
      if (message.type === 'overpass-acquire') {
        if (!OVERPASS_ENDPOINTS.includes(message.endpoint)) {
          send({ type: 'overpass-denied', requestId: message.requestId, message: 'Onbekende Overpass-bron' }); return;
        }
        if (jobs.has(message.requestId)) return;
        const job = { controller: new AbortController(), lease: undefined as OverpassLease | undefined };
        jobs.set(message.requestId, job);
        void scheduler.acquire(message.endpoint, job.controller.signal).then(lease => {
          if (jobs.get(message.requestId) !== job) { lease.release(new DOMException('Afgebroken', 'AbortError')); return; }
          job.lease = lease;
          send({ type: 'overpass-grant', requestId: message.requestId });
        }).catch(error => {
          if (jobs.get(message.requestId) !== job) return;
          jobs.delete(message.requestId);
          send({ type: 'overpass-denied', requestId: message.requestId, message: error instanceof Error ? error.message : 'Netwerkplanning mislukt' });
        });
        return;
      }
      const job = jobs.get(message.requestId);
      if (!job) return;
      jobs.delete(message.requestId);
      if (message.type === 'overpass-cancel') { job.controller.abort(); job.lease?.release(aborted(job.controller.signal)); }
      else job.lease?.release(message.failure ? new HttpError(message.failure.status, message.failure.retryAfterMs) : undefined);
    },
    destroy() {
      for (const job of jobs.values()) { job.controller.abort(); job.lease?.release(aborted(job.controller.signal)); }
      jobs.clear();
    },
  };
}

export function createWorkerOverpassGate(send: (message: OverpassFromWorker) => void) {
  let sequence = 0;
  const jobs = new Map<number, { resolve: (lease: OverpassLease) => void; reject: (error: Error) => void; finish: () => void }>();
  return {
    acquire(endpoint: string, signal: AbortSignal): Promise<OverpassLease> {
      if (signal.aborted) return Promise.reject(aborted(signal));
      const requestId = ++sequence;
      return new Promise((resolve, reject) => {
        const stop = () => { finish(); send({ type: 'overpass-cancel', requestId }); reject(aborted(signal)); };
        const finish = () => { signal.removeEventListener('abort', stop); jobs.delete(requestId); };
        jobs.set(requestId, { resolve, reject, finish });
        signal.addEventListener('abort', stop, { once: true });
        send({ type: 'overpass-acquire', requestId, endpoint });
      });
    },
    handle(message: OverpassToWorker) {
      const job = jobs.get(message.requestId);
      if (!job) {
        if (message.type === 'overpass-grant') send({ type: 'overpass-release', requestId: message.requestId });
        return;
      }
      job.finish();
      if (message.type === 'overpass-denied') { job.reject(new Error(message.message)); return; }
      let released = false;
      job.resolve({ release(error) {
        if (released) return;
        released = true;
        send({ type: 'overpass-release', requestId: message.requestId,
          ...(error instanceof HttpError ? { failure: { status: error.status, retryAfterMs: error.retryAfterMs } } : {}) });
      } });
    },
  };
}
