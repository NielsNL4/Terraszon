import { placeCoordinates } from './places';
import { createReportObstacleLoader, reportObstacleBounds } from './report-obstacles';
import { calculateDayReport, calculateYearReport, prepareReportClassifier, reportDayStart } from './sun-report-engine';
import { SUN_REPORT_MODEL_VERSION, type DaySunReport, type SunReportRequest, type SunReportResponse } from './sun-report-protocol';

export function createSunReportService(send: (message: SunReportResponse) => void, loader = createReportObstacleLoader()) {
  let active: { id: number; controller: AbortController } | null = null;
  const days = new Map<string, DaySunReport>();
  const prepared = new Map<string, ReturnType<typeof prepareReportClassifier>>();
  const invalidate = () => { active?.controller.abort(); active = null; loader.invalidate(); days.clear(); prepared.clear(); };
  const run = async (request: Extract<SunReportRequest, { type: 'day' | 'year' }>) => {
    active?.controller.abort();
    const job = { id: request.id, controller: new AbortController() }; active = job;
    const signal = job.controller.signal;
    const progress = (phase: 'obstacles' | 'day' | 'year', completed: number, total: number) => {
      if (active === job && !signal.aborted) send({ type: 'progress', id: job.id, progress: { phase, completed, total } });
    };
    try {
      if (typeof request.target.id !== 'string' || !request.target.id.trim() || request.target.id.length > 2048) throw new Error('Ongeldig analysepunt-ID.');
      const target = { id: request.target.id, coordinates: placeCoordinates(request.target.coordinates) };
      reportObstacleBounds(target.coordinates);
      if (typeof request.settings.includeTrees !== 'boolean' || request.settings.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error('Ongeldige rapportinstellingen of tijdzone.');
      if (request.type === 'day') reportDayStart(request.date);
      else if (!Number.isInteger(request.year) || request.year < 1 || request.year > 9999) throw new Error('Ongeldig rapportjaar.');
      progress('obstacles', 0, 1);
      const obstacles = await loader.load(target, request.settings.includeTrees, signal);
      if (signal.aborted) return;
      progress('obstacles', 1, 1);
      const key = JSON.stringify([SUN_REPORT_MODEL_VERSION, target, request.settings, obstacles.revision]);
      let classifier = prepared.get(key);
      if (!classifier) {
        classifier = prepareReportClassifier(target, obstacles, request.settings);
        prepared.set(key, classifier);
        while (prepared.size > 2) prepared.delete(prepared.keys().next().value!);
      }
      const day = async (date: string) => {
        const dayKey = JSON.stringify([key, date]);
        let result = days.get(dayKey);
        if (!result) {
          result = await calculateDayReport(target, obstacles, request.settings, date, signal, classifier);
          if (!signal.aborted) {
            days.set(dayKey, result);
            while (days.size > 32) days.delete(days.keys().next().value!);
          }
        }
        return { ...result, coverage: obstacles.coverage };
      };
      if (request.type === 'day') {
        progress('day', 0, 1); const report = await day(request.date); progress('day', 1, 1);
        if (active === job && !signal.aborted) send({ type: 'day', id: job.id, report });
      } else {
        progress('year', 0, 16);
        const report = await calculateYearReport(target, obstacles, request.settings, request.year, signal, day, (done, total) => progress('year', done, total));
        if (active === job && !signal.aborted) send({ type: 'year', id: job.id, report });
      }
    } catch (error) {
      if (active === job && !signal.aborted) send({ type: 'error', id: job.id,
        name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : 'Zonrapport kon niet worden berekend.' });
    } finally { if (active === job) active = null; }
  };
  return { handle(request: SunReportRequest) {
    if (request.type === 'invalidate') invalidate();
    else if (request.type === 'cancel') {
      if (active?.id === request.id) { active.controller.abort(); active = null; loader.retain(null); }
    } else if (request.type === 'day' || request.type === 'year') void run(request);
  }, destroy: invalidate };
}
