import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadVenueImage } from '../src/venue-image';
import type { LicensedVenueImage } from '../src/venue-media';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const metadata = { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/test.jpg' } as LicensedVenueImage;
describe('afbeeldingpixels apart van locatiegegevens laden', () => {
  function setup() {
    const fake = { src: '', naturalWidth: 640, decoding: '', referrerPolicy: '', onload: null as null | (() => void), onerror: null as null | (() => void) };
    vi.stubGlobal('Image', class { constructor() { return fake; } }); return fake;
  }
  it('laadt alleen expliciet en geeft de afbeelding terug nadat de pixels beschikbaar zijn', async () => {
    const image = setup(), pending = loadVenueImage(metadata, new AbortController().signal);
    expect(image.src).toBe(metadata.url); expect(image.referrerPolicy).toBe('no-referrer');
    image.onload!(); expect((await pending).state).toBe('ready');
  });
  it('laat een kapotte afbeelding falen zonder een locatie of openingstijden te wijzigen', async () => {
    const image = setup(), pending = loadVenueImage(metadata, new AbortController().signal);
    image.onerror!(); expect(await pending).toEqual({ state: 'error', reason: 'load' });
    expect(metadata.url).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/test.jpg');
  });
  it('begrenst een stilgevallen afbeelding en annuleert een oude consument', async () => {
    vi.useFakeTimers(); setup();
    const pending = loadVenueImage(metadata, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10_001); expect(await pending).toEqual({ state: 'error', reason: 'timeout' });
    const image = setup(), controller = new AbortController(), cancelled = loadVenueImage(metadata, controller.signal);
    controller.abort(); await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' }); expect(image.src).toBe('');
  });
});
