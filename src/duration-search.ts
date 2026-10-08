import type { Place } from './places';
import type { DaySunReport, ReportTarget } from './sun-report-protocol';
import type { createSunReportClient } from './sun-report-client';
import { abortable } from './requests';

export type DurationCandidate = { place: Place; target: ReportTarget; name: string };
export type DurationContext = { candidates: DurationCandidate[]; date: string; at: number; includeTrees: boolean };
export type DurationResult = { candidate: DurationCandidate; report?: DaySunReport; remaining: number | null; error?: string };
export type DurationState = { phase: 'idle' | 'loading' | 'ready' | 'cancelled'; results: DurationResult[]; total: number; examined: number };
export function remainingDirectSun(report: DaySunReport, at: number): number | null {
  const window = report.windows.find(window => window.from <= at && at < window.to);
  if (!report.complete || !window || window.state === 'unknown') return null;
  return window.state === 'sun' ? Math.max(0, Math.floor((window.to - at) / 60_000)) : 0;
}
export function durationMatches(results: DurationResult[], minimum: number) {
  return results.filter(result => result.remaining !== null && result.remaining > 0 && result.remaining >= minimum)
    .sort((a, b) => b.remaining! - a.remaining! || a.candidate.name.localeCompare(b.candidate.name, 'nl-NL'));
}
export function createDurationSearch(factory: () => ReturnType<typeof createSunReportClient>, changed: (state: DurationState) => void) {
  let context: DurationContext | null = null, key = '', generation = 0, total = 0, active: AbortController | null = null;
  let client: ReturnType<typeof createSunReportClient> | null = null;
  let state: DurationState = { phase: 'idle', results: [], total: 0, examined: 0 };
  const publish = (next: DurationState) => { state = next; changed(next); };
  const stop = () => { generation++; active?.abort(); active = null; client?.destroy(); client = null; };
  const run = async () => {
    if (!context || state.phase === 'loading') return;
    stop(); const id = generation, input = context, controller = new AbortController(); active = controller;
    const candidates = input.candidates.slice(state.examined, Math.min(24, state.examined + 6));
    if (!candidates.length) return;
    const results = [...state.results]; let examined = state.examined;
    publish({ ...state, phase: 'loading' }); client = factory();
    try {
      for (const candidate of candidates) {
        if (controller.signal.aborted) return;
        const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(new DOMException('Deze plek duurde te lang.', 'TimeoutError')), 20_000);
        const cancel = () => deadline.abort(); controller.signal.addEventListener('abort', cancel, { once: true });
        let result: DurationResult;
        try { const report = await abortable(client.day(candidate.target, input.date, deadline.signal, { includeTrees: input.includeTrees }), deadline.signal); result = { candidate, report, remaining: remainingDirectSun(report, input.at) }; }
        catch (error) { result = { candidate, remaining: null, error: error instanceof Error ? error.message : 'Berekening niet beschikbaar' }; }
        finally { clearTimeout(timer); controller.signal.removeEventListener('abort', cancel); }
        if (generation !== id || controller.signal.aborted) return;
        results.push(result); examined++; publish({ phase: 'loading', results: [...results], examined, total });
      }
      if (generation === id) publish({ phase: 'ready', results, examined, total });
    } finally { if (generation === id) { client?.destroy(); client = null; active = null; } }
  };
  return { get: () => state,
    setContext(next: DurationContext) {
      const nextKey = JSON.stringify([next.date, next.at, next.includeTrees, next.candidates.length, next.candidates.slice(0, 24).map(candidate => [candidate.target, candidate.name])]); if (key === nextKey) return;
      key = nextKey; stop(); total = next.candidates.length; context = structuredClone({ ...next, candidates: next.candidates.slice(0, 24) }); publish({ phase: 'idle', results: [], examined: 0, total });
    },
    start() { void run(); },
    cancel() { stop(); publish({ ...state, phase: 'cancelled' }); },
    reset() { stop(); publish({ phase: 'idle', results: [], examined: 0, total: context?.candidates.length ?? 0 }); },
    destroy: stop,
  };
}
