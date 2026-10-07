import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildingClient } from '../src/building-client';
import type { BuildingResponse } from '../src/building-protocol';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('gebouwworker watchdog', () => {
  function setup() {
    const fake = { onmessage: null as null | ((event: MessageEvent<BuildingResponse>) => void),
      onerror: null as null | (() => void), postMessage: vi.fn(), terminate: vi.fn() };
    vi.stubGlobal('Worker', class { constructor() { return fake; } });
    const update = vi.fn();
    return { fake, update, client: createBuildingClient(update) };
  }
  it('beëindigt laden ook als de worker helemaal niet meer antwoordt', async () => {
    vi.useFakeTimers();
    const { fake, update, client } = setup();
    const pending = client.load({ south: 53.21, north: 53.22, west: 6.56, east: 6.58 }, true, new AbortController().signal);
    const result = expect(pending).rejects.toThrow('niet op tijd');
    const id = fake.postMessage.mock.calls[0][0].id;
    await vi.advanceTimersByTimeAsync(48_001);
    await result;
    expect(fake.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', id });
    fake.onmessage!({ data: { type: 'complete', id, data: { totalBuildings: 1, typedBuildings: 1,
      revision: 1, loadedAreas: 1, totalAreas: 1, failedAreas: 0, capped: false,
      completeAreas: 1, emptyAreas: 0, partialAreas: 0, status: 'complete', source: 'osm' } } } as MessageEvent<BuildingResponse>);
    expect(update).not.toHaveBeenCalled();
    client.destroy();
  });
  it('meldt workerfouten meteen in plaats van de laadstatus te laten hangen', async () => {
    const { fake, client } = setup();
    const pending = client.load({ south: 53.21, north: 53.22, west: 6.56, east: 6.58 }, true, new AbortController().signal);
    fake.onerror!();
    await expect(pending).rejects.toThrow('niet starten');
    client.destroy();
  });
});
