type Callbacks = {
  onPosition: (position: GeolocationPosition) => void;
  onCenter: (position: GeolocationPosition, initial: boolean) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: GeolocationPositionError, initial: boolean) => void;
};

export function createLocationTracker(geolocation: Geolocation, callbacks: Callbacks) {
  let watchId: number | null = null;
  let requestId = 0;
  let watchGeneration = 0;
  let lastPosition: GeolocationPosition | null = null;
  let suspended = false;
  let trackingAllowed = false;
  let pendingRequest: boolean | null = null;
  const options: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 };

  const accept = (position: GeolocationPosition): boolean => {
    const { latitude, longitude } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
    if (lastPosition && position.timestamp < lastPosition.timestamp) return false;
    lastPosition = position;
    callbacks.onPosition(position);
    return true;
  };
  const clearWatch = () => {
    watchGeneration++;
    if (watchId !== null) geolocation.clearWatch(watchId);
    watchId = null;
  };
  const startWatch = () => {
    if (suspended || !trackingAllowed || watchId !== null) return;
    const generation = watchGeneration;
    watchId = geolocation.watchPosition(
      (position) => { if (!suspended && generation === watchGeneration) accept(position); },
      (error) => {
        if (generation !== watchGeneration || suspended) return;
        if (error.code !== 1) return; // keep the last fix through temporary GPS interruptions
        trackingAllowed = false;
        clearWatch();
        callbacks.onError(error, false);
      }, options,
    );
  };

  const tracker = {
    locate(initial = false): void {
      const id = ++requestId;
      pendingRequest = initial;
      callbacks.onBusy(true);
      geolocation.getCurrentPosition(
        (position) => {
          if (id !== requestId) return;
          pendingRequest = null;
          callbacks.onBusy(false);
          if (!accept(position) && !lastPosition) return;
          trackingAllowed = true;
          callbacks.onCenter(lastPosition!, initial);
          startWatch();
        },
        (error) => {
          if (id !== requestId) return;
          pendingRequest = null;
          callbacks.onBusy(false);
          if (error.code === 1) { trackingAllowed = false; clearWatch(); }
          else { trackingAllowed = true; startWatch(); }
          callbacks.onError(error, initial);
        }, options,
      );
    },
    pause() {
      suspended = true;
      requestId++;
      clearWatch();
      callbacks.onBusy(false);
    },
    resume(): void {
      if (!suspended) return;
      suspended = false;
      if (pendingRequest !== null) tracker.locate(pendingRequest);
      else startWatch();
    },
    stop() {
      suspended = true;
      requestId++;
      pendingRequest = null;
      clearWatch();
      callbacks.onBusy(false);
    },
  };
  return tracker;
}
