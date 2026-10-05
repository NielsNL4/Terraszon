import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJSON } from '../src/requests';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('harde data-deadlines', () => {
  it('eindigt ook als fetch abort negeert', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const result = expect(requestJSON('https://example.test', new AbortController().signal, 100)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(101);
    await result;
  });
  it('eindigt ook als het lezen van de body blijft hangen', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => ({ ok: true, json: () => new Promise(() => {}) }));
    const result = expect(requestJSON('https://example.test', new AbortController().signal, 100)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(101);
    await result;
  });
  it('annuleert meteen zonder medewerking van de databron', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const controller = new AbortController();
    const result = requestJSON('https://example.test', controller.signal, 1_000);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});
