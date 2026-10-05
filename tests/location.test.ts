import { describe, expect, it, vi } from 'vitest';
import { createLocationTracker } from '../src/location';

const toJSON = () => ({});
function position(timestamp = 1_000, longitude = 6.5682): GeolocationPosition {
  return { timestamp, coords: { latitude: 53.2188, longitude, accuracy: 10,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON }, toJSON };
}

function setup() {
  const requests: Array<{ success: PositionCallback; error?: PositionErrorCallback | null }> = [];
  const watches: Array<{ success: PositionCallback; error?: PositionErrorCallback | null }> = [];
  const geo: Geolocation = {
    getCurrentPosition: vi.fn((success, error) => { requests.push({ success, error }); }),
    watchPosition: vi.fn((success, error) => { watches.push({ success, error }); return watches.length; }),
    clearWatch: vi.fn(),
  };
  const callbacks = { onPosition: vi.fn(), onCenter: vi.fn(), onBusy: vi.fn(), onError: vi.fn() };
  return { geo, requests, watches, callbacks, tracker: createLocationTracker(geo, callbacks) };
}

describe('locatie volgen', () => {
  it('centreert de eerste meting en werkt daarna alleen de indicator bij tijdens lopen', () => {
    const { tracker, requests, watches, callbacks, geo } = setup();
    tracker.locate(true);
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    requests[0].success(position());
    watches[0].success(position(2_000, 6.57));
    expect(callbacks.onPosition).toHaveBeenCalledTimes(2);
    expect(callbacks.onCenter).toHaveBeenCalledExactlyOnceWith(position(), true);
    expect(geo.watchPosition).toHaveBeenCalledOnce();
    tracker.locate();
    requests[1].success(position(3_000, 6.58));
    expect(callbacks.onCenter).toHaveBeenLastCalledWith(position(3_000, 6.58), false);
    expect(geo.watchPosition).toHaveBeenCalledOnce();
  });

  it('laat een late aanvraag een nieuwere GPS-meting niet overschrijven', () => {
    const { tracker, requests, watches, callbacks } = setup();
    tracker.locate(true);
    requests[0].success(position());
    tracker.locate();
    watches[0].success(position(3_000, 6.58));
    requests[1].success(position(2_000, 6.57));
    expect(callbacks.onPosition).toHaveBeenLastCalledWith(position(3_000, 6.58));
    expect(callbacks.onCenter).toHaveBeenLastCalledWith(position(3_000, 6.58), false);
  });

  it('negeert achterhaalde aanvragen en toont geen verzonnen positie bij geweigerde toestemming', () => {
    const { tracker, requests, callbacks, geo } = setup();
    tracker.locate(true);
    tracker.locate();
    requests[0].success(position());
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    const denied = { code: 1, message: 'Denied' } as GeolocationPositionError;
    requests[1].error!(denied);
    expect(callbacks.onError).toHaveBeenCalledWith(denied, false);
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(callbacks.onBusy).toHaveBeenLastCalledWith(false);
  });

  it('pauzeert op de achtergrond, hervat één watcher en negeert callbacks van de oude watcher', () => {
    const { tracker, requests, watches, callbacks, geo } = setup();
    tracker.locate(true);
    requests[0].success(position());
    tracker.pause();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    tracker.resume();
    tracker.resume();
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    watches[0].success(position(9_000, 6.59));
    expect(callbacks.onPosition).toHaveBeenCalledTimes(1);
    watches[1].success(position(3_000, 6.58));
    expect(callbacks.onPosition).toHaveBeenLastCalledWith(position(3_000, 6.58));
    tracker.stop();
    watches[1].success(position(4_000, 6.59));
    expect(callbacks.onPosition).toHaveBeenCalledTimes(2);
    expect(geo.clearWatch).toHaveBeenLastCalledWith(2);
  });

  it('hervat een eerste meting die werd onderbroken door het verbergen van de pagina', () => {
    const { tracker, requests, callbacks } = setup();
    tracker.locate(true);
    tracker.pause();
    requests[0].success(position());
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    tracker.resume();
    tracker.resume();
    expect(requests).toHaveLength(2);
    requests[1].success(position(2_000));
    expect(callbacks.onCenter).toHaveBeenCalledWith(position(2_000), true);
  });

  it('houdt de laatst bekende positie bij een tijdelijke GPS-fout en stopt bij ingetrokken toestemming', () => {
    const { tracker, requests, watches, callbacks, geo } = setup();
    tracker.locate();
    requests[0].success(position());
    watches[0].error!({ code: 3, message: 'Timeout' } as GeolocationPositionError);
    expect(callbacks.onError).not.toHaveBeenCalled();
    watches[0].error!({ code: 1, message: 'Denied' } as GeolocationPositionError);
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    tracker.resume();
    expect(geo.watchPosition).toHaveBeenCalledOnce();
  });

  it('plaatst geen marker voor ongeldige coördinaten', () => {
    const { tracker, requests, callbacks, geo } = setup();
    tracker.locate();
    requests[0].success(position(1_000, NaN));
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    expect(callbacks.onCenter).not.toHaveBeenCalled();
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it('blijft luisteren wanneer de eerste GPS-meting tijdelijk nog niet beschikbaar is', () => {
    const { tracker, requests, watches, callbacks, geo } = setup();
    tracker.locate(true);
    requests[0].error!({ code: 3, message: 'Timeout' } as GeolocationPositionError);
    expect(geo.watchPosition).toHaveBeenCalledOnce();
    expect(callbacks.onPosition).not.toHaveBeenCalled();
    watches[0].success(position());
    expect(callbacks.onPosition).toHaveBeenCalledWith(position());
    expect(callbacks.onCenter).not.toHaveBeenCalled();
  });
});
