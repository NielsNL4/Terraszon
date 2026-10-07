import { createOpeningClient } from './opening-client';
import { venueClockContext } from './venue-data';
import { createVenueMediaLoader, type VenueMediaResult } from './venue-media';
import type { VenueHours } from './opening-protocol';
import type { Place } from './places';
import type { VenueFields } from './venue-data';
import { abortable } from './requests';

export type VenueEnrichment = { hours: VenueHours; media: VenueMediaResult; signature?: string };

export function createVenueDetailsLoader() {
  const opening = createOpeningClient(), media = createVenueMediaLoader();
  let photo: { key: string; at: number; controller: AbortController; promise: Promise<VenueMediaResult>; result?: VenueMediaResult } | null = null;
  const photoFor = (place: Place) => {
    const key = JSON.stringify([place.id, place.venue?.wikimediaCommons, place.venue?.wikidata, place.venue?.imageReference]);
    if (photo?.key === key && Date.now() - photo.at < (photo.result?.state === 'ready' ? 24 * 60 * 60 * 1_000 : 60_000)) return photo.promise;
    photo?.controller.abort();
    const controller = new AbortController(), promise = media(place, controller.signal);
    void promise.catch(() => {});
    photo = { key, at: Date.now(), controller, promise };
    const job = photo;
    void promise.then(result => { job.result = result; }).catch(() => {});
    return promise;
  };
  return {
    async load(place: Place, at: number, signal: AbortSignal, selectedDate?: string, selectedMinutes?: number): Promise<VenueEnrichment> {
      const venue: VenueFields = place.venue ?? {};
      const clock = venueClockContext(place.coordinates, venue);
      const [hours, image] = await Promise.all([
        opening.evaluate({ at, coordinates: place.coordinates, countryCode: clock.countryCode, region: clock.region,
          timeZone: clock.timeZone, selectedDate, selectedMinutes },
        { business: venue.openingHours, kitchen: venue.kitchenHours, terrace: venue.terraceHours }, signal),
        abortable(photoFor(place), signal),
      ]);
      return { hours, media: image };
    },
    destroy() { opening.destroy(); photo?.controller.abort(); photo = null; },
  };
}

export function venueDetailsSignature(place: Place, at: number, selectedDate: string, selectedMinutes: number): string {
  const base = Object.fromEntries(Object.entries(place.venue ?? {}).filter(([key]) => key !== 'enrichment'));
  return JSON.stringify([place.id, place.coordinates, base, at, selectedDate, selectedMinutes]);
}
