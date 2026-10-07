import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpeningClient } from '../src/opening-client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const context = { at: 123, coordinates: [6.568, 53.219] as [number, number] };
describe('lazy browserworker voor openingstijden', () => {
  it('maakt bij ontbrekende tijden geen worker en houdt zaak/keuken/terras onbekend', async () => {
    const worker = vi.fn(); vi.stubGlobal('Worker', worker);
    const result = await createOpeningClient().evaluate(context, {}, new AbortController().signal);
    expect(worker).not.toHaveBeenCalled();
    expect(result.business.reason).toBe('missing'); expect(result.kitchen.state).toBe('unknown'); expect(result.terrace.state).toBe('unknown');
  });
  it('eindigt begrensd bij een stilgevallen worker en beëindigt de worker', async () => {
    vi.useFakeTimers();
    const fake = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.stubGlobal('Worker', class { constructor() { return fake; } });
    const client = createOpeningClient(), pending = client.evaluate(context, { business: '24/7' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).business).toMatchObject({ state: 'unknown', reason: 'worker' });
    expect(fake.terminate).toHaveBeenCalledOnce(); client.destroy();
  });
  it('annuleert een oude consument en negeert een late response', async () => {
    const fake = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as null | ((event: MessageEvent) => void), onerror: null };
    vi.stubGlobal('Worker', class { constructor() { return fake; } });
    const client = createOpeningClient(), controller = new AbortController();
    const pending = client.evaluate(context, { business: '24/7' }, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    fake.onmessage!({ data: { type: 'hours', id: 1, result: {} } } as MessageEvent);
    client.destroy(); expect(fake.terminate).toHaveBeenCalledOnce();
  });
});
