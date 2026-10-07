import { describe, expect, it, vi } from 'vitest';
import { createYearReportController } from '../src/year-report-controller';
import { createDayReportController } from '../src/day-report-controller';
import { lightChartLabel, lightChartScale, reportParts } from '../src/report-charts';
import { calculateDayReport, calculateYearReport, prepareReportClassifier } from '../src/sun-report-engine';
import type { DaySunReport, ReportObstacles, ReportTotals, YearSunReport } from '../src/sun-report-protocol';

const target = { id: 'seat', coordinates: [6.568, 53.219] as [number, number] };
const settings = { includeTrees: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
const context = { target, year: 2024, includeTrees: true };
const day = { date: '2024-02-15', target, settings, coverage: { expiresAt: Date.now() + 60_000 } } as DaySunReport;
const year = { year: 2024, revision: 'first', target, settings, months: [day] } as YearSunReport;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('jaarlifecycle', () => {
  it('berekent pas op aanvraag en hergebruikt een geldig resultaat bij verbergen/heropenen', async () => {
    const load = vi.fn().mockResolvedValue(year), controller = createYearReportController({ year: load }, () => {});
    controller.setContext(context); expect(load).not.toHaveBeenCalled(); controller.open(); await settle();
    expect(controller.get()).toMatchObject({ phase: 'ready', report: year }); controller.close(); controller.open();
    expect(load).toHaveBeenCalledOnce(); controller.destroy();
  });
  it('behoudt een handmatig jaar bij klok-/kaartupdates en bij datumselectie uit dat jaar', async () => {
    const load = vi.fn().mockResolvedValue(year), controller = createYearReportController({ year: load }, () => {});
    controller.setContext(context); controller.setYear(2026); controller.open(); await settle();
    controller.setContext(structuredClone(context)); expect(controller.context()!.year).toBe(2026);
    const report = controller.get().report; controller.setContext({ ...context, year: 2026 });
    expect(controller.get().report).toBe(report); expect(load).toHaveBeenCalledOnce(); controller.destroy();
  });
  it('wist jaaruitkomsten bij punt, instellingen of jaar en vraagt expliciete herberekening', async () => {
    const load = vi.fn().mockResolvedValue(year), controller = createYearReportController({ year: load }, () => {});
    controller.setContext(context); controller.open(); await settle(); controller.setYear(2025);
    expect(controller.get()).toEqual({ expanded: true, phase: 'idle' }); expect(load).toHaveBeenCalledOnce();
    controller.open(); await settle(); controller.setContext({ ...context, target: { ...target, coordinates: [6.6, 53.2] } });
    expect(controller.get().report).toBeUndefined(); controller.setContext({ ...context, includeTrees: false }); expect(load).toHaveBeenCalledTimes(2);
    expect(() => controller.setYear(2024.5)).toThrow(); expect(() => controller.setYear(NaN)).toThrow(); controller.destroy();
  });
  it('negeert late replies/voortgang na annuleren en herstelt fouten', async () => {
    let finish!: (value: YearSunReport) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<YearSunReport>(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(year);
    const controller = createYearReportController({ year: load }, () => {}); controller.setContext(context); controller.open(); controller.cancel();
    load.mock.calls[0][4]({ phase: 'year', completed: 16, total: 16 }); finish(year); await settle();
    expect(controller.get().phase).toBe('cancelled'); expect((load.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    controller.retry(); await settle(); expect(controller.get()).toMatchObject({ phase: 'error', error: 'Offline' });
    controller.retry(); await settle(); expect(controller.get().phase).toBe('ready'); controller.invalidate(); expect(controller.get().report).toBeUndefined();
    controller.setContext(null); expect(controller.get().expanded).toBe(false);
  });
  it('herberekent een verlopen jaarsnapshot bij heropenen', async () => {
    const expired = { ...year, months: [{ ...day, coverage: { ...day.coverage, expiresAt: 0 } }] };
    const load = vi.fn().mockResolvedValueOnce(expired).mockResolvedValue(year), controller = createYearReportController({ year: load }, () => {});
    controller.setContext(context); controller.open(); await settle(); controller.close(); controller.open(); await settle(); expect(load).toHaveBeenCalledTimes(2);
  });
  it('neemt exact de passende jaardag over zonder nieuw workerverzoek en weigert een ander punt', () => {
    const load = vi.fn().mockResolvedValue(day), controller = createDayReportController({ day: load }, () => {});
    const input = { target, date: day.date, includeTrees: true };
    controller.setContext(input, day); expect(controller.get().report).toBe(day); expect(load).not.toHaveBeenCalled();
    controller.setContext({ ...input, target: { ...target, id: 'another' } }, day);
    expect(controller.get().report).toBeUndefined(); expect(load).toHaveBeenCalledOnce(); controller.destroy();
  });
});

describe('gedeelde grafiekuitkomsten', () => {
  it('houdt onbekend en gefilterd naast zon op een gezamenlijke uur-schaal, ook bij nul', () => {
    const total: ReportTotals = { sun: 125, filtered: 10, unknown: 50, shade: 0, night: 0 };
    expect(lightChartScale([total])).toBe(240);
    expect(lightChartScale([{ ...total, sun: 0, filtered: 0, unknown: 0 }])).toBe(60);
    expect(lightChartLabel(total)).toBe('circa 2 u 5 min directe zon · 10 min mogelijk gefilterd · 50 min onbekend');
    expect(reportParts.map(part => part.range)).toEqual(['vóór 12:00', '12:00–17:00', 'vanaf 17:00']);
  });
  it('sluit ieder dagdeel aan op de echte berekende dag, met dezelfde dagrecords in het schrikkeljaar', async () => {
    const obstacles: ReportObstacles = { revision: 'fixture', buildings: [], trees: [], coverage: { bounds: { south: 53.21, north: 53.23, west: 6.55, east: 6.58 },
      buildings: 'empty', trees: 'empty', treeSources: [], estimatedHeights: 0, buildingsLimited: false, treesLimited: false, loadedAt: 0, expiresAt: Date.now() + 60_000 } };
    const classifier = prepareReportClassifier(target, obstacles, settings), signal = new AbortController().signal;
    const reports = new Map<string, DaySunReport>();
    const report = await calculateYearReport(target, obstacles, settings, 2024, signal, async date => {
      const day = await calculateDayReport(target, obstacles, settings, date, signal, classifier, async () => {}); reports.set(date, day); return day;
    }, () => {});
    expect(report.months).toHaveLength(12); expect(report.months[1].date).toBe('2024-02-15');
    for (const day of [...report.months, ...Object.values(report.seasons)]) {
      expect(day).toBe(reports.get(day.date));
      for (const state of ['sun', 'filtered', 'unknown', 'shade', 'night'] as const) expect(reportParts.reduce((sum, part) => sum + day.parts[part.key][state], 0)).toBe(day.totals[state]);
    }
    expect(report.seasons.spring.date).toBe('2024-03-21'); expect(report.seasons.autumn.date).toBe('2024-09-21');
    expect(report.seasons.summer.totals.sun).toBeGreaterThan(report.seasons.winter.totals.sun);
  });
});
