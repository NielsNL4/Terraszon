import { createOverpassBroker } from './overpass-bridge';
import { aborted } from './requests';
import type { DaySunReport, YearSunReport, ReportSettings, ReportTarget, ReportProgress, SunReportRequest, SunReportResponse } from './sun-report-protocol';

export function createSunReportClient(factory: () => Worker = () => new Worker(new URL('./sun-report-worker.ts', import.meta.url), { type: 'module' })) {
  let worker: Worker | null = null, sequence = 0;
  let job: { id: number; resolve: (report: DaySunReport | YearSunReport) => void; reject: (error: Error) => void;
    stop: () => void; progress?: (progress: ReportProgress) => void } | null = null;
  let broker: ReturnType<typeof createOverpassBroker> | null = null;
  const shutdown = (error = new DOMException('Zonrapport afgebroken', 'AbortError')) => {
    worker?.terminate(); worker = null; broker?.destroy(); broker = null;
    const pending = job; pending?.stop(); pending?.reject(error);
  };
  const start = () => {
    if (worker) return worker;
    worker = factory(); broker = createOverpassBroker(message => worker?.postMessage(message));
    worker.onmessage = (event: MessageEvent<SunReportResponse>) => {
      const message = event.data;
      if (message.type === 'overpass-acquire' || message.type === 'overpass-release' || message.type === 'overpass-cancel') { broker?.handle(message); return; }
      const pending = job; if (!pending || pending.id !== message.id) return;
      if (message.type === 'progress') { pending.progress?.(message.progress); return; }
      pending.stop();
      if (message.type === 'error') { const error = new Error(message.message); error.name = message.name; pending.reject(error); }
      else pending.resolve(message.report);
    };
    worker.onerror = () => shutdown(new DOMException('De zonrapport-worker kon niet worden uitgevoerd.', 'OperationError'));
    return worker;
  };
  const request = (message: Extract<SunReportRequest, { type: 'day' | 'year' }>, signal: AbortSignal, progress?: (value: ReportProgress) => void) => {
    if (signal.aborted) return Promise.reject(aborted(signal));
    if (job) { const previous = job; previous.stop(); previous.reject(new DOMException('Nieuw zonrapport geselecteerd', 'AbortError')); }
    return new Promise<DaySunReport | YearSunReport>((resolve, reject) => {
      const cancel = () => { worker?.postMessage({ type: 'cancel', id: message.id } satisfies SunReportRequest); stop(); reject(aborted(signal)); };
      const timer = setTimeout(() => shutdown(new DOMException('Het zonrapport duurde te lang.', 'TimeoutError')), message.type === 'year' ? 180_000 : 90_000);
      const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); if (job?.id === message.id) job = null; };
      job = { id: message.id, resolve, reject, stop, progress }; signal.addEventListener('abort', cancel, { once: true });
      try { start().postMessage(message); } catch { shutdown(new DOMException('De zonrapport-worker kon niet worden gestart.', 'OperationError')); }
    });
  };
  const settings = (value?: Partial<ReportSettings>): ReportSettings => ({ includeTrees: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...value });
  return {
    day(target: ReportTarget, date: string, signal: AbortSignal, options?: Partial<ReportSettings>, progress?: (value: ReportProgress) => void) {
      return request({ type: 'day', id: ++sequence, target, date, settings: settings(options) }, signal, progress) as Promise<DaySunReport>;
    },
    year(target: ReportTarget, year: number, signal: AbortSignal, options?: Partial<ReportSettings>, progress?: (value: ReportProgress) => void) {
      return request({ type: 'year', id: ++sequence, target, year, settings: settings(options) }, signal, progress) as Promise<YearSunReport>;
    },
    invalidate() { if (job) { const pending = job; pending.stop(); pending.reject(new DOMException('Obstakeldata vernieuwd', 'AbortError')); } worker?.postMessage({ type: 'invalidate' } satisfies SunReportRequest); },
    destroy: shutdown,
  };
}
