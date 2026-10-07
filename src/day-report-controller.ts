import type { DaySunReport, ReportProgress, ReportSettings, ReportTarget } from './sun-report-protocol';

export type DayReportContext = { target: ReportTarget; date: string; includeTrees: boolean };
export type DayReportState = { expanded: boolean; phase: 'idle' | 'loading' | 'ready' | 'error' | 'cancelled';
  report?: DaySunReport; progress?: ReportProgress; error?: string };
type Client = { day: (target: ReportTarget, date: string, signal: AbortSignal, settings?: Partial<ReportSettings>, progress?: (value: ReportProgress) => void) => Promise<DaySunReport> };

// Time and camera are deliberately absent: only analysis inputs restart work.
export function createDayReportController(client: Client, changed: (state: DayReportState) => void) {
  let context: DayReportContext | null = null, key = '', generation = 0, active: AbortController | null = null;
  let state: DayReportState = { expanded: false, phase: 'idle' };
  const publish = (next: DayReportState) => { state = next; changed(state); };
  const stop = () => { generation++; active?.abort(); active = null; };
  const run = () => {
    if (!context || !state.expanded) return;
    stop(); const id = generation, input = context, request = new AbortController(); active = request;
    publish({ expanded: true, phase: 'loading' });
    void client.day(input.target, input.date, request.signal, { includeTrees: input.includeTrees }, progress => {
      if (generation === id && !request.signal.aborted) publish({ expanded: true, phase: 'loading', progress });
    }).then(report => {
      if (generation !== id || request.signal.aborted) return;
      active = null; publish({ expanded: true, phase: 'ready', report });
    }).catch(error => {
      if (generation !== id || request.signal.aborted) return;
      active = null; publish({ expanded: true, phase: 'error', error: error instanceof Error ? error.message : 'Het zonrapport kon niet worden berekend.' });
    });
  };
  return {
    get: () => state,
    setContext(next: DayReportContext | null, prepared?: DaySunReport) {
      const matches = next && prepared && prepared.date === next.date && prepared.target.id === next.target.id
        && JSON.stringify(prepared.target.coordinates) === JSON.stringify(next.target.coordinates)
        && prepared.settings.includeTrees === next.includeTrees && prepared.settings.timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (matches) {
        key = JSON.stringify(next); context = structuredClone(next); stop();
        publish({ expanded: true, phase: 'ready', report: prepared }); return;
      }
      const nextKey = JSON.stringify(next); if (nextKey === key) return;
      key = nextKey; context = next ? structuredClone(next) : null;
      stop(); publish({ expanded: !!next && state.expanded, phase: 'idle' }); run();
    },
    open() { if (!context || state.expanded) return; publish({ expanded: true, phase: 'idle' }); run(); },
    close() { stop(); publish({ expanded: false, phase: 'idle' }); },
    retry: run,
    cancel() { stop(); publish({ expanded: state.expanded, phase: 'cancelled' }); },
    destroy() { stop(); },
  };
}
