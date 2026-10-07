import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildingLoader } from '../src/building-loader';
import { createOverpassScheduler, overpassScheduler, setOverpassGate } from '../src/overpass';

const a = { south: 53.211, west: 6.563, north: 53.213, east: 6.567 };
const b = { ...a, east: 6.587 };
const distant = { ...a, west: 6.8, east: 6.807 };
const feature = (id: number, west: number) => ({ type: 'way', id, tags: { building: 'house' }, geometry: [
  { lon: west, lat: 53.211 }, { lon: west + 0.0001, lat: 53.211 },
  { lon: west + 0.0001, lat: 53.2111 }, { lon: west, lat: 53.2111 }, { lon: west, lat: 53.211 },
] });

afterEach(() => { setOverpassGate(overpassScheduler); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(delay = 1_000) {
  setOverpassGate(createOverpassScheduler());
  const calls: Array<{ started: number; signal: AbortSignal; query: string }> = [];
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  const fetch = vi.fn().mockImplementation(async (url: URL, options: RequestInit) => {
    const query = url.searchParams.get('data')!;
    calls.push({ started: Date.now(), signal: options.signal as AbortSignal, query });
    const bbox = /way\["building"\]\(([^)]+)\)/.exec(query)![1].split(',').map(Number);
    const elements = [feature(1, 6.561), feature(2, 6.581), feature(3, 6.801)]
      .filter(record => record.geometry[0].lon >= bbox[1] && record.geometry[0].lon < bbox[3]);
    return { ok: true, json: () => new Promise(resolve => setTimeout(() => resolve({ elements }), delay)) };
  });
  vi.stubGlobal('fetch', fetch);
  return { calls, fetch };
}

describe('bronrequests los van kaartbeelden', () => {
  it('hergebruikt een overlappend batch wanneer de nieuwe view slechts een deel nodig heeft', async () => {
    vi.useFakeTimers();
    const { calls } = setup();
    const load = createBuildingLoader(), firstController = new AbortController();
    load.retain(b);
    const oldProgress = vi.fn();
    const first = load(b, firstController.signal, oldProgress).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    const subset = { ...a, west: 6.583, east: 6.587 };
    load.retain(subset);
    firstController.abort();
    const second = load(subset, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await second;
    expect(result.status).toBe('complete');
    expect(result.buildings.map(building => building.properties.id)).toEqual(['way/2']);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(false);
    expect((await first).name).toBe('AbortError');
    expect(oldProgress).not.toHaveBeenCalled();
    load.retain(null);
  });

  it('annuleert een niet meer relevant brongebied bij een verre sprong', async () => {
    vi.useFakeTimers();
    const { calls } = setup();
    const load = createBuildingLoader(), controller = new AbortController();
    load.retain(a);
    const old = load(a, controller.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    load.retain(distant); controller.abort();
    const next = load(distant, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls[0].signal.aborted).toBe(true);
    expect((await next).buildings.map(building => building.properties.id)).toEqual(['way/3']);
    expect((await old).name).toBe('AbortError');
    load.retain(null);
  });

  it('verlengt de oorspronkelijke brondeadline niet bij een viewwissel', async () => {
    vi.useFakeTimers();
    const { calls } = setup(10_000);
    const load = createBuildingLoader({ deadline: 1_000 }), controller = new AbortController();
    load.retain(b);
    const old = load(b, controller.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(500);
    const subset = { ...a, west: 6.583, east: 6.587 };
    load.retain(subset); controller.abort();
    const next = load(subset, new AbortController().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(500);
    expect((await next).name).toBe('TimeoutError');
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(true);
    expect((await old).name).toBe('AbortError');
    load.retain(null);
  });

  it('meet minder starts en sneller bruikbare data bij heen-en-weer bewegen dan annuleren/herstarten', async () => {
    vi.useFakeTimers();
    async function scenario(reuse: boolean) {
      vi.setSystemTime(0);
      const { calls } = setup();
      const load = createBuildingLoader(), firstController = new AbortController(), secondController = new AbortController();
      if (reuse) load.retain(a);
      const first = load(a, firstController.signal).catch(error => error);
      await vi.advanceTimersByTimeAsync(500);
      if (reuse) load.retain(b);
      firstController.abort();
      const second = load(b, secondController.signal).catch(error => error);
      await vi.advanceTimersByTimeAsync(100);
      if (reuse) load.retain(a);
      secondController.abort();
      const final = load(a, new AbortController().signal).then(result => ({ result, readyAt: Date.now() }));
      await vi.advanceTimersByTimeAsync(1_000);
      const outcome = await final;
      await first; await second;
      load.retain(null);
      return { starts: calls.length, readyAt: outcome.readyAt, status: outcome.result.status };
    }
    expect(await scenario(false)).toEqual({ starts: 3, readyAt: 1_600, status: 'complete' });
    expect(await scenario(true)).toEqual({ starts: 2, readyAt: 1_000, status: 'complete' });
  });
});
