import type { ReportProgress, ReportSettings, ReportTarget, YearSunReport } from './sun-report-protocol';

export type YearReportContext = { target: ReportTarget; year: number; includeTrees: boolean };
export type YearReportState = { expanded: boolean; phase: 'idle' | 'loading' | 'ready' | 'cancelled' | 'error'; report?: YearSunReport; progress?: ReportProgress; error?: string };
type Client = { year: (target: ReportTarget, year: number, signal: AbortSignal, settings?: Partial<ReportSettings>, progress?: (value: ReportProgress) => void) => Promise<YearSunReport> };

export function createYearReportController(client: Client, changed: (state: YearReportState) => void) {
  let context: YearReportContext | null = null, incomingKey = '', generation = 0, active: AbortController | null = null;
  let state: YearReportState = { expanded: false, phase: 'idle' };
  const publish = (next: YearReportState) => { state = next; changed(next); };
  const stop = () => { generation++; active?.abort(); active = null; };
  const apply = (next: YearReportContext | null) => {
    if (JSON.stringify(next) === JSON.stringify(context)) return;
    stop(); context = next ? structuredClone(next) : null;
    publish({ expanded: !!context && state.expanded, phase: 'idle' });
  };
  const run = () => {
    if (!context) return;
    stop(); const id = generation, input = context, request = new AbortController(); active = request;
    publish({ expanded: true, phase: 'loading' });
    void client.year(input.target, input.year, request.signal, { includeTrees: input.includeTrees }, progress => {
      if (generation === id && !request.signal.aborted) publish({ expanded: true, phase: 'loading', progress });
    }).then(report => {
      if (generation !== id || request.signal.aborted) return;
      active = null; publish({ expanded: true, phase: 'ready', report });
    }).catch(error => {
      if (generation !== id || request.signal.aborted) return;
      active = null; publish({ expanded: true, phase: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'error',
        error: error instanceof Error ? error.message : 'Jaaranalyse kon niet worden berekend.' });
    });
  };
  return {
    get: () => state,
    context: () => context ? structuredClone(context) : null,
    setContext(next: YearReportContext | null) {
      const key = JSON.stringify(next); if (key === incomingKey) return;
      incomingKey = key; apply(next);
    },
    setYear(year: number) {
      if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('Kies een jaar van 1 tot en met 9999.');
      if (context) apply({ ...context, year });
    },
    open() {
      const cached = state.report;
      if (cached && cached.months.every(day => day.coverage.expiresAt > Date.now())) publish({ ...state, expanded: true });
      else run();
    },
    retry: run,
    close() { stop(); publish(state.phase === 'ready' ? { ...state, expanded: false } : { expanded: false, phase: 'idle' }); },
    cancel() { if (state.phase !== 'loading') return; stop(); publish({ expanded: true, phase: 'cancelled' }); },
    invalidate() { stop(); publish({ expanded: state.expanded, phase: 'idle' }); },
    destroy: stop,
  };
}
