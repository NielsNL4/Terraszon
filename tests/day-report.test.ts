import { describe, expect, it, vi } from 'vitest';
import { createDayReportController, type DayReportState } from '../src/day-report-controller';
import { reportClock, reportDuration, reportLimitations } from '../src/day-report-format';
import type { DaySunReport } from '../src/sun-report-protocol';

const context = { target: { id: 'test:seat', coordinates: [6.57, 53.21] as [number, number] }, date: '2026-07-15', includeTrees: true };
const report = { date: context.date, target: context.target, totals: { sun: 60 }, complete: true } as DaySunReport;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('dagrapportselectie en lifecycle', () => {
  it('laadt uitsluitend op aanvraag en hergebruikt de dag bij tijd-/kaartupdates', async () => {
    const day = vi.fn().mockResolvedValue(report), changed = vi.fn(), controller = createDayReportController({ day }, changed);
    controller.setContext(context); expect(day).not.toHaveBeenCalled(); controller.open(); await settle();
    expect(controller.get()).toMatchObject({ phase: 'ready', report });
    controller.setContext(structuredClone(context)); controller.open();
    expect(day).toHaveBeenCalledOnce(); expect(day.mock.calls[0][3]).toEqual({ includeTrees: true });
    controller.destroy();
  });
  it('wist een oud rapport direct bij datum-/punt-/instellingenwijziging', async () => {
    let finish!: (value: DaySunReport) => void;
    const day = vi.fn().mockResolvedValueOnce(report).mockImplementationOnce(() => new Promise<DaySunReport>(resolve => { finish = resolve; })).mockResolvedValue(report);
    const controller = createDayReportController({ day }, () => {}); controller.setContext(context); controller.open(); await settle();
    controller.setContext({ ...context, date: '2026-07-16' });
    expect(controller.get()).toEqual({ expanded: true, phase: 'loading' });
    const dateSignal = day.mock.calls[1][2] as AbortSignal;
    controller.setContext({ ...context, target: { ...context.target, coordinates: [6.6, 53.2] } }); finish({ ...report, date: '2026-07-16' }); await settle();
    expect(dateSignal.aborted).toBe(true); expect(controller.get().report!.date).toBe('2026-07-15');
    controller.setContext({ ...context, includeTrees: false }); await settle(); expect(day).toHaveBeenCalledTimes(4);
    expect(day.mock.calls[3][3]).toEqual({ includeTrees: false }); controller.destroy();
  });
  it('negeert late resultaten en voortgang na annuleren; opnieuw proberen is expliciet', async () => {
    let finish!: (value: DaySunReport) => void;
    const day = vi.fn().mockImplementationOnce(() => new Promise<DaySunReport>(resolve => { finish = resolve; })).mockResolvedValue(report);
    const states: DayReportState[] = [], controller = createDayReportController({ day }, state => states.push(state));
    controller.setContext(context); controller.open(); controller.cancel();
    day.mock.calls[0][4]({ phase: 'day', completed: 1, total: 1 }); finish(report); await settle();
    expect(controller.get()).toEqual({ expanded: true, phase: 'cancelled' });
    expect((day.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
    controller.setContext(context); expect(day).toHaveBeenCalledOnce(); controller.retry(); await settle();
    expect(controller.get().phase).toBe('ready'); controller.close(); expect(controller.get().expanded).toBe(false);
  });
  it('laat fouten herstellen en stopt bij sluiten/wissen van de selectie', async () => {
    const day = vi.fn().mockRejectedValueOnce(new Error('Bron offline')).mockResolvedValue(report);
    const controller = createDayReportController({ day }, () => {}); controller.setContext(context); controller.open(); await settle();
    expect(controller.get()).toMatchObject({ phase: 'error', error: 'Bron offline' }); controller.retry(); await settle();
    expect(controller.get().phase).toBe('ready'); controller.setContext(null);
    expect(controller.get()).toEqual({ expanded: false, phase: 'idle' }); controller.setContext(context); expect(day).toHaveBeenCalledTimes(2);
  });
});

describe('rapportpresentatie', () => {
  it('gebruikt leesbare minuutduur zonder valse urenprecisie', () => {
    expect(reportDuration(0)).toBe('0 min'); expect(reportDuration(59.6)).toBe('1 u'); expect(reportDuration(125)).toBe('2 u 5 min');
    expect(reportClock(null)).toBe('Niet op deze dag'); expect(reportClock(42, { end: 42 })).toBe('24:00');
  });
  it('maakt onbekend, footprint, hoogtes, bomen en modelgrenzen expliciet', () => {
    const notes = reportLimitations({ ...report, complete: false, warnings: ['ground-point-inside-building'],
      coverage: { estimatedHeights: 3 }, settings: { includeTrees: true }, accuracy: { sampleMinutes: 5, transitionSeconds: 60 } } as DaySunReport);
    expect(notes.join(' ')).toContain('onvolledig'); expect(notes.join(' ')).toContain('binnen een gebouw'); expect(notes.join(' ')).toContain('3 gebouwhoogten');
    expect(notes.join(' ')).toContain('niet mee als directe zon'); expect(notes.join(' ')).toContain('geen weersverwachting');
    expect(notes.join(' ')).toContain('500 meter'); expect(notes.join(' ')).toContain('korte perioden');
  });
});
