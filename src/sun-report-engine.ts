import * as SunCalc from 'suncalc';
import { isPointInsideBuilding, isPointInBuildingShadows, prepareShadowPolygons } from './shadows';
import { createTreeShadeTest, prepareTreeObstacles } from './tree-shadows';
import { aborted } from './requests';
import { REPORT_SAMPLE_MINUTES, REPORT_TRANSITION_SECONDS, SUN_REPORT_MODEL_VERSION,
  type DaySunReport, type ReportObstacles, type ReportSettings, type ReportState, type ReportTarget,
  type ReportTotals, type ReportWindow, type YearSunReport } from './sun-report-protocol';

export type SolarPosition = { altitude: number; azimuth: number };
export type ReportClassifier = { state: (at: number, date: string) => ReportState; warnings: string[]; complete: boolean };
const emptyTotals = (): ReportTotals => ({ sun: 0, shade: 0, filtered: 0, night: 0, unknown: 0 });
const dateKey = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function reportDayStart(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1) throw new Error('Ongeldige rapportdatum.');
  const date = new Date(0); date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3])); date.setHours(0, 0, 0, 0);
  if (!Number.isFinite(date.getTime()) || dateKey(date) !== value) throw new Error('Ongeldige rapportdatum.');
  return date;
}

export function prepareReportClassifier(target: ReportTarget, obstacles: ReportObstacles, settings: ReportSettings,
  position: (at: number) => SolarPosition = at => SunCalc.getPosition(new Date(at), target.coordinates[1], target.coordinates[0])): ReportClassifier {
  const valid = obstacles.buildings.filter(building => Number.isFinite(building.properties.height) && building.properties.height > 0);
  const polygons = prepareShadowPolygons(valid);
  const trees = settings.includeTrees ? prepareTreeObstacles(obstacles.trees) : [];
  const treeShade = createTreeShadeTest(target.coordinates, trees);
  const complete = ['complete', 'empty'].includes(obstacles.coverage.buildings)
    && (!settings.includeTrees || ['complete', 'empty'].includes(obstacles.coverage.trees))
    && !obstacles.coverage.buildingsLimited && (!settings.includeTrees || !obstacles.coverage.treesLimited)
    && valid.length === obstacles.buildings.length && trees.length === (settings.includeTrees ? obstacles.trees.length : 0);
  const warnings = ['model-estimate', 'shadow-horizon-500m', 'unmapped-obstacles-not-detectable', 'short-periods-can-be-missed'];
  if (!complete) warnings.push('incomplete-obstacle-data');
  if (obstacles.coverage.estimatedHeights) warnings.push('estimated-building-heights');
  if (settings.includeTrees) warnings.push('estimated-tree-shape-and-leaf-season');
  if (isPointInsideBuilding(target.coordinates, polygons)) warnings.push('ground-point-inside-building');
  return { complete, warnings, state(at, date) {
    const sun = position(at);
    if (!Number.isFinite(sun.altitude) || !Number.isFinite(sun.azimuth)) return 'unknown';
    if (sun.altitude <= 0) return 'night';
    // Ground-level analysis must not claim direct sun for an address centroid
    // inside a roofed footprint. The interactive POI convention remains intact.
    if (isPointInBuildingShadows(target.coordinates, polygons, sun.altitude, sun.azimuth, true)) return 'shade';
    if (treeShade(sun.altitude, sun.azimuth, date)) return 'filtered';
    return complete ? 'sun' : 'unknown';
  } };
}

export async function calculateDayReport(target: ReportTarget, obstacles: ReportObstacles, settings: ReportSettings,
  value: string, signal: AbortSignal, classifier = prepareReportClassifier(target, obstacles, settings),
  yieldWork: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))): Promise<DaySunReport> {
  if (settings.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error('Rapporttijdzone wijkt af van de browsertijdzone; kies eerst een ondersteunde lokale klok.');
  const day = reportDayStart(value), tomorrow = new Date(day); tomorrow.setDate(tomorrow.getDate() + 1);
  const start = day.getTime(), end = tomorrow.getTime(), step = REPORT_SAMPLE_MINUTES * 60_000;
  const windows: ReportWindow[] = [];
  let previousAt = start, count = 0;
  const check = () => { if (signal.aborted) throw aborted(signal); };
  check();
  for (let from = start; from < end; from += step) {
    const to = Math.min(end, from + step), at = (from + to) / 2, state = classifier.state(at, value);
    const previous = windows.at(-1);
    if (!previous) windows.push({ from: start, to: end, state });
    else if (previous.state !== state) {
      let low = previousAt, high = at;
      while (high - low > REPORT_TRANSITION_SECONDS * 1_000) {
        const middle = (low + high) / 2;
        if (classifier.state(middle, value) === previous.state) low = middle; else high = middle;
      }
      const boundary = Math.max(previous.from, Math.min(end, Math.round((low + high) / 2 / 60_000) * 60_000));
      previous.to = boundary; windows.push({ from: boundary, to: end, state });
    }
    previousAt = at;
    if (++count % 32 === 0) { await yieldWork(); check(); }
  }
  check();
  const totals = emptyTotals(), parts = { morning: emptyTotals(), midday: emptyTotals(), evening: emptyTotals() };
  const noon = new Date(day); noon.setHours(12, 0, 0, 0);
  const five = new Date(day); five.setHours(17, 0, 0, 0);
  const ranges = [[start, noon.getTime(), parts.morning], [noon.getTime(), five.getTime(), parts.midday], [five.getTime(), end, parts.evening]] as const;
  let longestSun: ReportWindow | null = null;
  for (const window of windows) {
    totals[window.state] += (window.to - window.from) / 60_000;
    for (const [a, b, part] of ranges) part[window.state] += Math.max(0, Math.min(b, window.to) - Math.max(a, window.from)) / 60_000;
    if (window.state === 'sun' && (!longestSun || window.to - window.from > longestSun.to - longestSun.from)) longestSun = window;
  }
  const daylightMinutes = (end - start) / 60_000 - totals.night;
  const complete = classifier.complete && totals.unknown === 0;
  const events = SunCalc.getTimes(noon, target.coordinates[1], target.coordinates[0]);
  const validTime = (date: Date | null | undefined) => date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  return { modelVersion: SUN_REPORT_MODEL_VERSION, target, date: value, settings, revision: obstacles.revision, coverage: obstacles.coverage,
    complete, warnings: classifier.warnings, start, end, sunrise: validTime(events.sunrise), sunset: validTime(events.sunset),
    windows, totals, daylightMinutes, directShareOfDaylight: complete ? (daylightMinutes ? Math.min(100, totals.sun / daylightMinutes * 100) : 0) : null,
    longestSun, parts, accuracy: { sampleMinutes: REPORT_SAMPLE_MINUTES, transitionSeconds: REPORT_TRANSITION_SECONDS, daylight: 'solar-center-above-horizon', estimated: true } };
}

export async function calculateYearReport(target: ReportTarget, obstacles: ReportObstacles, settings: ReportSettings,
  year: number, signal: AbortSignal, day: (date: string) => Promise<DaySunReport>, progress: (completed: number, total: number) => void): Promise<YearSunReport> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('Ongeldig rapportjaar.');
  const prefix = String(year).padStart(4, '0'), months: DaySunReport[] = [];
  let completed = 0;
  const run = async (date: string) => { if (signal.aborted) throw aborted(signal); const result = await day(date); progress(++completed, 16); return result; };
  for (let month = 1; month <= 12; month++) months.push(await run(`${prefix}-${String(month).padStart(2, '0')}-15`));
  const spring = await run(`${prefix}-03-21`), summer = await run(`${prefix}-06-21`), autumn = await run(`${prefix}-09-21`), winter = await run(`${prefix}-12-21`);
  return { modelVersion: SUN_REPORT_MODEL_VERSION, target, settings, revision: obstacles.revision, year,
    method: 'representative-days-not-monthly-averages', months, seasons: { spring, summer, autumn, winter } };
}

export function sunAvailability(report: DaySunReport, at: number) {
  const current = report.windows.find(window => window.from <= at && at < window.to) ?? null;
  const nextSun = report.windows.find(window => window.state === 'sun' && window.from > at) ?? null;
  return { current, remainingDirectMinutes: current?.state === 'sun' ? (current.to - at) / 60_000 : 0, nextSun };
}
