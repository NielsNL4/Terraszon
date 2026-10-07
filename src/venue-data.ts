import type { TerraceEvidence } from './types';
import type { VenueEnrichment } from './venue-details';

export type VenueFields = {
  cuisine?: string;
  openingHours?: string;
  kitchenHours?: string;
  terraceHours?: string;
  hoursCheckedAt?: string;
  menuUrl?: string;
  website?: string;
  phone?: string;
  wheelchair?: string;
  covered?: string;
  capacity?: string;
  outdoorSeating?: string;
  seasonal?: string;
  toilets?: string;
  vegetarian?: string;
  vegan?: string;
  takeaway?: string;
  reservation?: string;
  countryCode?: string;
  region?: string;
  timeZone?: string;
  wikidata?: string;
  wikimediaCommons?: string;
  imageReference?: string;
};
export type VenueProvenance = {
  provider: 'osm';
  recordId: string;
  sourceUrl: string;
  retrievedAt?: number;
  fieldTags: Partial<Record<keyof VenueFields, string>>;
};
export type VenueInfo = VenueFields & {
  amenity: string;
  evidence: TerraceEvidence;
  provenance?: VenueProvenance;
  enrichment?: VenueEnrichment;
};

export function externalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith('www.') ? `https://${value}` : value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

const tagKeys: Record<keyof VenueFields, string[]> = {
  cuisine: ['cuisine'], openingHours: ['opening_hours'], kitchenHours: ['opening_hours:kitchen'],
  terraceHours: ['opening_hours:outdoor_seating', 'outdoor_seating:opening_hours'], hoursCheckedAt: ['check_date:opening_hours'],
  menuUrl: ['website:menu', 'menu:website', 'contact:menu'], website: ['website', 'contact:website'],
  phone: ['phone', 'contact:phone'], wheelchair: ['wheelchair'], covered: ['covered'],
  capacity: ['capacity:outdoor', 'capacity'], outdoorSeating: ['outdoor_seating'], seasonal: ['seasonal'],
  toilets: ['toilets'], vegetarian: ['diet:vegetarian'], vegan: ['diet:vegan'], takeaway: ['takeaway'], reservation: ['reservation'],
  countryCode: ['addr:country'], region: ['addr:state', 'addr:province'], timeZone: ['timezone'],
  wikidata: ['wikidata'], wikimediaCommons: ['wikimedia_commons'], imageReference: ['image'],
};

export function extractVenueFields(tags: Record<string, string> | undefined) {
  const fields: VenueFields = {}, fieldTags: VenueProvenance['fieldTags'] = {};
  for (const field of Object.keys(tagKeys) as Array<keyof VenueFields>) {
    for (const key of tagKeys[field]) {
      const raw = tags?.[key];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      let value: string | undefined = raw.trim();
      if (field === 'website' || field === 'menuUrl' || field === 'imageReference') value = externalUrl(value);
      if (!value) continue;
      if (field === 'wikidata' && !/^Q[1-9]\d*$/.test(value)) value = undefined;
      if (field === 'countryCode' && value) value = /^[a-z]{2}$/i.test(value) ? value.toLocaleLowerCase('en') : undefined;
      if (field === 'hoursCheckedAt' && value) {
        const date = new Date(`${value}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) value = undefined;
      }
      if (!value) continue;
      fields[field] = value; fieldTags[field] = key; break;
    }
  }
  return { fields, fieldTags };
}

export function venueClockContext(coordinates: [number, number], fields: VenueFields) {
  // This deliberately small region is entirely inside Groningen/Netherlands;
  // it is not a country lookup based on a Netherlands-wide bounding rectangle.
  const groningen = coordinates[0] >= 6.53 && coordinates[0] <= 6.61 && coordinates[1] >= 53.205 && coordinates[1] <= 53.235;
  const countryCode = fields.countryCode ?? (groningen ? 'nl' : undefined);
  return { countryCode, region: fields.region ?? (groningen ? 'Groningen' : undefined),
    timeZone: fields.timeZone ?? (countryCode === 'nl' ? 'Europe/Amsterdam' : undefined),
    countryBasis: fields.countryCode ? 'osm' as const : groningen ? 'groningen-region' as const : 'unknown' as const };
}
