import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverpassScheduler, OVERPASS_ENDPOINTS, overpassScheduler, requestOverpassJSON, setOverpassGate } from '../src/overpass';
import { createOverpassBroker, createWorkerOverpassGate, type OverpassFromWorker, type OverpassToWorker } from '../src/overpass-bridge';
import { HttpError } from '../src/requests';
import { createBuildingLoader } from '../src/building-loader';
import { fetchTrees } from '../src/trees';
import { fetchTerraces } from '../src/terraces';

const endpoint = OVERPASS_ENDPOINTS[0];
const signal = () => new AbortController().signal;
afterEach(() => { setOverpassGate(overpassScheduler); vi.useRealTimers(); vi.unstubAllGlobals(); });

function bridge(scheduler: ReturnType<typeof createOverpassScheduler>) {
  const toMain: OverpassFromWorker[] = [], toWorker: OverpassToWorker[] = [];
  const worker = createWorkerOverpassGate(message => { toMain.push(message); broker.handle(message); });
  const broker = createOverpassBroker(message => { toWorker.push(message); worker.handle(message); }, scheduler);
  return { worker, broker, toMain, toWorker };
}

describe('gedeeld Overpass-budget', () => {
  it('laat de echte gebouw-, boom- en horecaloaders hetzelfde budget gebruiken', async () => {
    const scheduler = createOverpassScheduler({ concurrency: 1 }); setOverpassGate(scheduler);
    const responses: Array<{ source: string; finish: () => void }> = [];
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: URL | string, options: RequestInit) => {
      const query = typeof url === 'string' ? (options.body as URLSearchParams).get('data')! : url.searchParams.get('data')!;
      const source = query.includes('out geom') ? 'buildings' : query.includes('natural') ? 'trees' : 'terraces';
      return { ok: true, json: () => new Promise(resolve => { responses.push({ source, finish: () => resolve({ elements: [] }) }); }) };
    }));
    const bounds = { south: 52.99, west: 5.99, north: 53.001, east: 6.001 };
    const buildingBounds = { ...bounds, south: 53.001, west: 6.001, north: 53.003, east: 6.003 };
    const buildings = createBuildingLoader()(buildingBounds, signal());
    const trees = fetchTrees(bounds, signal());
    const terraces = fetchTerraces(bounds, signal());
    await vi.waitFor(() => expect(scheduler.stats()).toMatchObject({ active: 1, queued: 2 }));
    expect(responses).toHaveLength(1);
    for (let index = 0; index < 3; index++) {
      await vi.waitFor(() => expect(responses).toHaveLength(index + 1));
      responses[index].finish();
    }
    await Promise.all([buildings, trees, terraces]);
    expect(responses.map(response => response.source).sort()).toEqual(['buildings', 'terraces', 'trees']);
    expect(scheduler.stats()).toMatchObject({ active: 0, queued: 0, started: 3 });
  });

  it('telt werkeraanvragen mee in hetzelfde budget als hoofdthread-aanvragen', async () => {
    const scheduler = createOverpassScheduler({ concurrency: 2 });
    const { worker, broker, toWorker } = bridge(scheduler);
    const horeca = await scheduler.acquire(endpoint, signal());
    const buildings = await worker.acquire(endpoint, signal());
    const treeGrant = vi.fn();
    const trees = scheduler.acquire(endpoint, signal()).then(lease => { treeGrant(); return lease; });
    expect(scheduler.stats()).toMatchObject({ active: 2, queued: 1, started: 2 });
    expect(treeGrant).not.toHaveBeenCalled();
    expect(toWorker).toEqual([{ type: 'overpass-grant', requestId: 1 }]);
    buildings.release();
    const treeLease = await trees;
    expect(treeGrant).toHaveBeenCalledOnce();
    horeca.release(); treeLease.release(); broker.destroy();
    expect(scheduler.stats()).toMatchObject({ active: 0, queued: 0, started: 3 });
  });

  it('annuleert wachtend werk zonder een slot of bronrequest te starten', async () => {
    const scheduler = createOverpassScheduler({ concurrency: 1 });
    const active = await scheduler.acquire(endpoint, signal());
    const controller = new AbortController();
    const waiting = scheduler.acquire(endpoint, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(scheduler.stats()).toMatchObject({ started: 1, queued: 0, cancelledWhileQueued: 1 });
    active.release();
  });

  it('past het mobiele budget toe zonder al lopend werk geforceerd af te breken', async () => {
    const scheduler = createOverpassScheduler();
    const first = await scheduler.acquire(endpoint, signal()), second = await scheduler.acquire(endpoint, signal());
    scheduler.setConcurrency(1);
    const nextGrant = vi.fn();
    const next = scheduler.acquire(endpoint, signal()).then(lease => { nextGrant(); return lease; });
    first.release();
    await Promise.resolve();
    expect(nextGrant).not.toHaveBeenCalled();
    second.release();
    (await next).release();
    expect(nextGrant).toHaveBeenCalledOnce();
  });

  it('respecteert Retry-After bij 429 ook voor fallback-endpoints en werkeraanvragen', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 1, random: () => 0 });
    const { worker, broker } = bridge(scheduler);
    const first = await worker.acquire(endpoint, signal());
    first.release(new HttpError(429, 2_000));
    const granted = vi.fn();
    const next = scheduler.acquire(OVERPASS_ENDPOINTS[1], signal()).then(lease => { granted(); return lease; });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(granted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    (await next).release(); broker.destroy();
    expect(granted).toHaveBeenCalledOnce();
  });

  it('gebruikt oplopende backoff bij herhaalde 504 en reset na succes', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 1, random: () => 0 });
    (await scheduler.acquire(endpoint, signal())).release(new HttpError(504));
    const second = scheduler.acquire(endpoint, signal());
    await vi.advanceTimersByTimeAsync(500);
    (await second).release(new HttpError(504));
    const granted = vi.fn();
    const third = scheduler.acquire(endpoint, signal()).then(lease => { granted(); return lease; });
    await vi.advanceTimersByTimeAsync(999);
    expect(granted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    (await third).release();
    const success = await scheduler.acquire(endpoint, signal());
    success.release(new HttpError(504));
    const afterReset = scheduler.acquire(endpoint, signal());
    await vi.advanceTimersByTimeAsync(500);
    (await afterReset).release();
  });

  it('laat een gezonde bron door nadat de globale pauze eindigt terwijl een andere bron nog afkoelt', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 1, random: () => 0 });
    (await scheduler.acquire(endpoint, signal())).release(new HttpError(504, 5_000));
    const blocked = vi.fn(), ready = vi.fn();
    const cooling = scheduler.acquire(endpoint, signal()).then(lease => { blocked(); return lease; });
    const healthy = scheduler.acquire(OVERPASS_ENDPOINTS[1], signal()).then(lease => { ready(); return lease; });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ready).toHaveBeenCalledOnce(); expect(blocked).not.toHaveBeenCalled();
    (await healthy).release();
    await vi.advanceTimersByTimeAsync(4_000);
    (await cooling).release();
  });

  it('houdt een slot vast tot de response-body is gelezen', async () => {
    const scheduler = createOverpassScheduler({ concurrency: 1 }); setOverpassGate(scheduler);
    let finish: ((value: { elements: unknown[] }) => void) | undefined;
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
    vi.stubGlobal('fetch', fetch);
    const first = requestOverpassJSON(endpoint, signal());
    await vi.waitFor(() => expect(finish).toBeDefined());
    const controller = new AbortController();
    const queued = requestOverpassJSON(endpoint, controller.signal);
    const check = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await check;
    expect(fetch).toHaveBeenCalledOnce();
    finish!({ elements: [] }); await first;
    expect(scheduler.stats().active).toBe(0);
  });

  it('start de bodydeadline pas nadat een wachtende aanvraag een slot heeft', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 1 }); setOverpassGate(scheduler);
    const held = await scheduler.acquire(endpoint, signal());
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    vi.stubGlobal('fetch', fetch);
    const pending = requestOverpassJSON(endpoint, signal(), 100);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).not.toHaveBeenCalled();
    held.release();
    await expect(pending).resolves.toEqual({ elements: [] });
  });

  it('ruimt werkerslots en wachtende verzoeken op bij verwijderen van de client', async () => {
    const scheduler = createOverpassScheduler({ concurrency: 1 });
    const { worker, broker } = bridge(scheduler);
    await worker.acquire(endpoint, signal());
    const controller = new AbortController();
    const pending = worker.acquire(endpoint, controller.signal);
    const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await check;
    broker.destroy();
    expect(scheduler.stats()).toMatchObject({ active: 0, queued: 0 });
  });

  it('geeft een laat ontvangen grant voor een geannuleerde werkaanvraag direct vrij', async () => {
    const send = vi.fn(), worker = createWorkerOverpassGate(send), controller = new AbortController();
    const pending = worker.acquire(endpoint, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    worker.handle({ type: 'overpass-grant', requestId: 1 });
    expect(send).toHaveBeenLastCalledWith({ type: 'overpass-release', requestId: 1 });
  });

  it('voegt jitter toe aan de begrensde backoff', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 1, random: () => 0.8 });
    (await scheduler.acquire(endpoint, signal())).release(new HttpError(504));
    const granted = vi.fn();
    const next = scheduler.acquire(endpoint, signal()).then(lease => { granted(); return lease; });
    await vi.advanceTimersByTimeAsync(699);
    expect(granted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    (await next).release();
  });

  it('laat een parallel succes een nieuwere Retry-After niet overschrijven', async () => {
    vi.useFakeTimers();
    const scheduler = createOverpassScheduler({ concurrency: 2, random: () => 0 });
    const failed = await scheduler.acquire(endpoint, signal());
    const older = await scheduler.acquire(endpoint, signal());
    failed.release(new HttpError(504, 5_000));
    older.release();
    const granted = vi.fn();
    const next = scheduler.acquire(endpoint, signal()).then(lease => { granted(); return lease; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(granted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    (await next).release();
  });
});
