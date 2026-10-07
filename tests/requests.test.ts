import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, requestJSON, retryAfterMilliseconds } from '../src/requests';

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

  it('bewaart HTTP-status en Retry-After voor de gedeelde netwerkplanner', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '3' }) }));
    await expect(requestJSON('https://example.test', new AbortController().signal, 1_000))
      .rejects.toMatchObject({ name: 'HttpError', status: 429, retryAfterMs: 3_000 });
    expect(new HttpError(504).retryAfterMs).toBeNull();
  });

  it('ondersteunt HTTP-datums en negeert ongeldige Retry-After-waarden', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    expect(retryAfterMilliseconds('Wed, 07 Oct 2026 12:00:05 GMT')).toBe(5_000);
    expect(retryAfterMilliseconds('0')).toBe(0);
    expect(retryAfterMilliseconds('-1')).toBeNull();
    expect(retryAfterMilliseconds('1e308')).toBeNull();
    expect(retryAfterMilliseconds('onbekend')).toBeNull();
    expect(retryAfterMilliseconds(null)).toBeNull();
  });
});
