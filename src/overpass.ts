import { aborted, HttpError, requestJSON } from './requests';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
export const OVERPASS_REQUEST_TIMEOUT = 30_000; // server timeout is at most 20s; allow body/queue overhead
export const OVERPASS_LOAD_TIMEOUT = 45_000;

export type OverpassLease = { release: (error?: unknown) => void };
export type OverpassGate = { acquire: (endpoint: string, signal: AbortSignal) => Promise<OverpassLease> };

export function createOverpassScheduler(options: { concurrency?: number; random?: () => number } = {}) {
  type Pending = { endpoint: string; signal: AbortSignal; resolve: (lease: OverpassLease) => void;
    reject: (error: Error) => void; stop: () => void };
  const queue: Pending[] = [];
  const endpoints = new Map<string, { readyAt: number; failures: number }>();
  let concurrency = Math.max(1, Math.min(2, options.concurrency ?? 2)), active = 0, pauseUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stats = { started: 0, completed: 0, cancelledWhileQueued: 0 };
  const pump = () => {
    clearTimeout(timer); timer = undefined;
    while (active < concurrency && queue.length) {
      const now = Date.now();
      const readyAt = (job: Pending) => Math.max(pauseUntil, endpoints.get(job.endpoint)?.readyAt ?? 0);
      const index = queue.findIndex(job => readyAt(job) <= now);
      if (index < 0) {
        timer = setTimeout(pump, Math.min(2_147_483_647, Math.max(1, Math.min(...queue.map(readyAt)) - now)));
        return;
      }
      const job = queue.splice(index, 1)[0];
      job.signal.removeEventListener('abort', job.stop);
      active++; stats.started++;
      let released = false;
      job.resolve({ release(error) {
        if (released) return;
        released = true; active--; stats.completed++;
        if (error instanceof HttpError && [429, 503, 504].includes(error.status)) {
          const failures = Math.min(6, (endpoints.get(job.endpoint)?.failures ?? 0) + 1);
          const backoff = Math.min(30_000, 500 * 2 ** (failures - 1)) + Math.floor((options.random ?? Math.random)() * 250);
          const delay = Math.max(backoff, error.retryAfterMs ?? 0);
          endpoints.set(job.endpoint, { failures, readyAt: Date.now() + delay });
          // A quota error pauses all new Overpass traffic, including fallback
          // endpoints; rotating servers must not bypass Retry-After.
          pauseUntil = Math.max(pauseUntil, Date.now() + (error.status === 429 ? delay : Math.min(delay, 1_000)));
        } else if (error === undefined) {
          const current = endpoints.get(job.endpoint);
          // An older parallel success may reset failures, but must not cancel
          // a newer Retry-After instruction from this endpoint.
          if (current && current.readyAt > Date.now()) endpoints.set(job.endpoint, { ...current, failures: 0 });
          else endpoints.delete(job.endpoint);
        }
        pump();
      } });
    }
  };
  return {
    acquire(endpoint: string, signal: AbortSignal): Promise<OverpassLease> {
      if (signal.aborted) return Promise.reject(aborted(signal));
      return new Promise((resolve, reject) => {
        const job: Pending = { endpoint, signal, resolve, reject, stop: () => {
          const index = queue.indexOf(job);
          if (index < 0) return;
          queue.splice(index, 1); stats.cancelledWhileQueued++;
          signal.removeEventListener('abort', job.stop);
          reject(aborted(signal)); pump();
        } };
        queue.push(job); signal.addEventListener('abort', job.stop, { once: true }); pump();
      });
    },
    setConcurrency(value: number) { concurrency = Math.max(1, Math.min(2, value)); pump(); },
    stats() { return { ...stats, active, queued: queue.length }; },
  };
}

export const overpassScheduler = createOverpassScheduler();
let gate: OverpassGate = overpassScheduler;

// The building worker installs a message-based gate backed by the main-thread
// scheduler. Only tiny grants/statuses cross threads; JSON stays in the worker.
export function setOverpassGate(value: OverpassGate) { gate = value; }

export async function requestOverpassJSON<T>(url: URL | string, signal: AbortSignal,
  milliseconds = OVERPASS_REQUEST_TIMEOUT, options: RequestInit = {}): Promise<T> {
  const endpoint = new URL(url);
  const lease = await gate.acquire(endpoint.origin + endpoint.pathname, signal);
  let failure: unknown;
  try { return await requestJSON<T>(url, signal, milliseconds, options); }
  catch (error) { failure = error; throw error; }
  finally { lease.release(failure); }
}
