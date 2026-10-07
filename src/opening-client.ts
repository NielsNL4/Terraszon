import { aborted } from './requests';
import { unknownHours, type HoursContext, type HoursRequest, type HoursResponse, type VenueHours } from './opening-protocol';

export function createOpeningClient() {
  let worker: Worker | null = null, sequence = 0;
  const jobs = new Map<number, { resolve: (hours: VenueHours) => void; stop: () => void; fallback: () => VenueHours }>();
  const shutdown = () => { worker?.terminate(); worker = null; for (const job of [...jobs.values()]) { job.stop(); job.resolve(job.fallback()); } };
  const start = () => {
    if (worker) return worker;
    worker = new Worker(new URL('./opening-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<HoursResponse>) => {
      const job = jobs.get(event.data.id); if (!job) return;
      job.stop(); job.resolve(event.data.result);
    };
    worker.onerror = shutdown;
    return worker;
  };
  return {
    evaluate(context: HoursContext, values: { business?: string; kitchen?: string; terrace?: string }, signal: AbortSignal): Promise<VenueHours> {
      if (signal.aborted) return Promise.reject(aborted(signal));
      const fallback = (): VenueHours => ({ business: unknownHours(values.business, context, 'worker'),
        kitchen: unknownHours(values.kitchen, context, 'worker'), terrace: unknownHours(values.terrace, context, 'worker') });
      if (!values.business && !values.kitchen && !values.terrace) return Promise.resolve({
        business: unknownHours(undefined, context, 'missing'), kitchen: unknownHours(undefined, context, 'missing'), terrace: unknownHours(undefined, context, 'missing'),
      });
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const cancel = () => { stop(); reject(aborted(signal)); };
        const timer = setTimeout(shutdown, 8_000);
        const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); jobs.delete(id); };
        jobs.set(id, { resolve, stop, fallback }); signal.addEventListener('abort', cancel, { once: true });
        try { const request: HoursRequest = { type: 'evaluate', id, context, ...values }; start().postMessage(request); }
        catch { shutdown(); }
      });
    },
    destroy: shutdown,
  };
}
