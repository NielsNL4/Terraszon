import { aborted } from './requests';
import type { LicensedVenueImage } from './venue-media';

export type VenueImageLoad = { state: 'ready'; image: HTMLImageElement } | { state: 'error'; reason: 'load' | 'timeout' };

// Pixel loading is explicit: resolving media metadata never downloads every
// thumbnail in the map area. F3 can call this only for a visible image.
export function loadVenueImage(metadata: LicensedVenueImage, signal: AbortSignal): Promise<VenueImageLoad> {
  if (signal.aborted) return Promise.reject(aborted(signal));
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    let done = false;
    const finish = (result: VenueImageLoad) => {
      if (done) return; done = true; cleanup(); resolve(result);
    };
    const cancel = () => { if (done) return; done = true; cleanup(); image.src = ''; reject(aborted(signal)); };
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); image.onload = null; image.onerror = null; };
    const timer = setTimeout(() => { finish({ state: 'error', reason: 'timeout' }); image.src = ''; }, 10_000);
    image.onload = () => finish(image.naturalWidth > 0 ? { state: 'ready', image } : { state: 'error', reason: 'load' });
    image.onerror = () => finish({ state: 'error', reason: 'load' });
    signal.addEventListener('abort', cancel, { once: true }); image.src = metadata.url;
  });
}
