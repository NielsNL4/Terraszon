import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSunReportClient } from '../src/sun-report-client';
import type { DaySunReport, SunReportRequest, SunReportResponse } from '../src/sun-report-protocol';

function fixture() {
  const fake = { onmessage: null as ((event: MessageEvent<SunReportResponse>) => void) | null, onerror: null as (() => void) | null,
    terminate: vi.fn(), postMessage: vi.fn<(message: SunReportRequest) => void>() };
  const factory = vi.fn(() => fake as unknown as Worker), client = createSunReportClient(factory);
  const reply = (message: SunReportResponse) => fake.onmessage?.({ data: message } as MessageEvent<SunReportResponse>);
  return { fake, factory, client, reply };
}
const target = { id: 'test', coordinates: [6, 53] as [number, number] };
const report = { date: '2026-07-15' } as DaySunReport;
afterEach(() => vi.useRealTimers());
describe('zonrapport-client', () => {
  it('start pas op aanvraag en hergebruikt dezelfde worker met voortgang', async () => {
    const { factory, client, reply } = fixture(); expect(factory).not.toHaveBeenCalled();
    const progress = vi.fn(), first = client.day(target, '2026-07-15', new AbortController().signal, undefined, progress);
    reply({ type: 'progress', id: 1, progress: { phase: 'day', completed: 0, total: 1 } });
    expect(progress).toHaveBeenCalledOnce(); reply({ type: 'day', id: 1, report }); expect(await first).toEqual(report);
    const second = client.day(target, '2026-07-15', new AbortController().signal); reply({ type: 'day', id: 2, report }); await second;
    expect(factory).toHaveBeenCalledOnce(); client.destroy();
  });
  it('verwerpt de oude selectie en negeert late replies', async () => {
    const { client, reply } = fixture();
    const first = client.day(target, '2026-07-15', new AbortController().signal);
    const assertion = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const next = client.day(target, '2026-07-16', new AbortController().signal); await assertion;
    reply({ type: 'day', id: 1, report }); reply({ type: 'day', id: 2, report: { ...report, date: '2026-07-16' } });
    expect((await next).date).toBe('2026-07-16'); client.destroy();
  });
  it('stuurt expliciete annulering en handelt workerfouten af', async () => {
    const { fake, client } = fixture(), controller = new AbortController();
    const first = client.year(target, 2026, controller.signal), assertion = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await assertion; expect(fake.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', id: 1 });
    const second = client.day(target, '2026-07-15', new AbortController().signal), failure = expect(second).rejects.toMatchObject({ name: 'OperationError' });
    fake.onerror?.(); await failure; expect(fake.terminate).toHaveBeenCalledOnce();
  });
  it('ruimt een genegeerde worker op na de hoofdthread-deadline', async () => {
    vi.useFakeTimers(); const { fake, client } = fixture();
    const promise = client.day(target, '2026-07-15', new AbortController().signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(90_000); await assertion; expect(fake.terminate).toHaveBeenCalledOnce();
  });
  it('invalideert lopende berekeningen en start geen worker voor een reeds geannuleerde aanvraag', async () => {
    const { fake, factory, client } = fixture(), controller = new AbortController(); controller.abort();
    await expect(client.day(target, '2026-07-15', controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(factory).not.toHaveBeenCalled();
    const promise = client.day(target, '2026-07-15', new AbortController().signal), assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    client.invalidate(); await assertion; expect(fake.postMessage).toHaveBeenLastCalledWith({ type: 'invalidate' }); client.destroy();
  });
});
