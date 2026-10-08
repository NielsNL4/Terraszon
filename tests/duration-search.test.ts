import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDurationSearch, durationMatches, remainingDirectSun, type DurationCandidate } from '../src/duration-search';
import { customPlace } from '../src/places';
import type { DaySunReport } from '../src/sun-report-protocol';
import type { createSunReportClient } from '../src/sun-report-client';
const candidates = Array.from({ length: 30 }, (_, i): DurationCandidate => ({ place: customPlace(`Plek ${i}`, [6.568 + i * 0.00001, 53.219], String(i)), name: `Plek ${i}`, target: { id: `seat:${i}`, coordinates: [6.568 + i * 0.00001, 53.219] } }));
const report = { complete: true, windows: [{ from: 0, to: 120 * 60_000, state: 'sun' }] } as DaySunReport;
const context = { candidates, date: '2026-07-15', at: 0, includeTrees: true };
const fixture = (day = vi.fn().mockResolvedValue(report)) => {
  const destroy = vi.fn(), factory = vi.fn(() => ({ day, destroy }) as unknown as ReturnType<typeof createSunReportClient>);
  return { day, destroy, factory, controller: createDurationSearch(factory, () => {}) };
};
afterEach(() => vi.useRealTimers());
describe('begrensde zonneduurselectie', () => {
  it('houdt onvolledigheid onbekend en telt gefilterd licht niet als directe zon', () => {
    expect(remainingDirectSun(report, 30 * 60_000)).toBe(90);
    expect(remainingDirectSun({ ...report, complete: false }, 0)).toBeNull();
    expect(remainingDirectSun({ ...report, windows: [{ from: 0, to: 1000, state: 'filtered' }] }, 0)).toBe(0);
    const results = [120, null, 30, 90].map((remaining, i) => ({ candidate: candidates[i], remaining }));
    expect(durationMatches(results, 60).map(result => result.remaining)).toEqual([120, 90]);
  });
  it('start expliciet, doet zes per stap/maximaal 24 en ruimt elke groepsworker op', async () => {
    const { controller, day, factory, destroy } = fixture(); controller.setContext(context); expect(factory).not.toHaveBeenCalled();
    for (let step = 1; step <= 4; step++) { controller.start(); await vi.waitFor(() => expect(controller.get().phase).toBe('ready')); expect(day).toHaveBeenCalledTimes(step * 6); }
    controller.start(); expect(day).toHaveBeenCalledTimes(24); expect(destroy).toHaveBeenCalledTimes(4);
    expect(controller.get()).toMatchObject({ examined: 24, total: 30 });
  });
  it('annuleert en negeert een late oude uitkomst na contextwisseling', async () => {
    let finish!: (report: DaySunReport) => void;
    const { controller, day, destroy } = fixture(vi.fn().mockImplementation(() => new Promise<DaySunReport>(resolve => { finish = resolve; })));
    controller.setContext(context); controller.start(); controller.setContext({ ...context, date: '2026-07-16' }); finish(report);
    await Promise.resolve(); await Promise.resolve(); expect(controller.get()).toMatchObject({ phase: 'idle', results: [] }); expect(destroy).toHaveBeenCalledOnce();
    expect((day.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
  });
  it('begrensde deadline werkt ook als een pointclient abort negeert', async () => {
    vi.useFakeTimers(); const { controller } = fixture(vi.fn().mockImplementation(() => new Promise(() => {})));
    controller.setContext({ ...context, candidates: [candidates[0]] }); controller.start(); await vi.advanceTimersByTimeAsync(20_001);
    expect(controller.get()).toMatchObject({ phase: 'ready', examined: 1 }); expect(controller.get().results[0].remaining).toBeNull();
  });
});
