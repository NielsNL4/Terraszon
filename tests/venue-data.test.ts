import { describe, expect, it } from 'vitest';
import { parseOverpass } from '../src/terraces';
import { terracePlace, savePlaceRecord } from '../src/places';
import { extractVenueFields, venueClockContext } from '../src/venue-data';

describe('restaurantverrijking en veldherkomst', () => {
  it('behoudt zaak-, keuken- en terrasuren afzonderlijk met herleidbare tags', () => {
    const feature = parseOverpass({ elements: [{ type: 'node', id: 42, lat: 53.219, lon: 6.568, tags: {
      name: 'Café', amenity: 'cafe', opening_hours: 'Mo-Su 09:00-22:00', 'opening_hours:kitchen': 'Mo-Su 12:00-20:00',
      'outdoor_seating:opening_hours': 'Mo-Su 10:00-18:00', 'website:menu': 'https://example.test/menu',
      'contact:website': 'https://example.test', 'check_date:opening_hours': '2026-10-01',
      'diet:vegan': 'yes', wikimedia_commons: 'File:Example.jpg', wikidata: 'Q42',
    } }] }, 1234)[0];
    const place = terracePlace(feature);
    expect(place.venue).toMatchObject({ openingHours: 'Mo-Su 09:00-22:00', kitchenHours: 'Mo-Su 12:00-20:00',
      terraceHours: 'Mo-Su 10:00-18:00', menuUrl: 'https://example.test/menu', vegan: 'yes', hoursCheckedAt: '2026-10-01' });
    expect(place.venue?.provenance).toMatchObject({ provider: 'osm', recordId: 'node/42', retrievedAt: 1234,
      fieldTags: { website: 'contact:website', terraceHours: 'outdoor_seating:opening_hours' } });
    expect(savePlaceRecord(place)).not.toHaveProperty('venue');
  });
  it('verwerpt ongeldige links/identiteiten en bedenkt geen verificatiedatum', () => {
    const { fields } = extractVenueFields({ website: 'javascript:alert(1)', 'website:menu': 'https://user:secret@example.test/menu',
      wikidata: 'https://wrong.test', 'check_date:opening_hours': '2026-02-31', image: 'https://example.test/photo.jpg' });
    expect(fields.website).toBeUndefined(); expect(fields.menuUrl).toBeUndefined(); expect(fields.wikidata).toBeUndefined();
    expect(fields.hoursCheckedAt).toBeUndefined(); expect(fields.imageReference).toBe('https://example.test/photo.jpg');
  });
  it('beperkt impliciete Nederlandse context tot de kleine zekere Groningse regio', () => {
    expect(venueClockContext([6.568, 53.219], {})).toMatchObject({ countryCode: 'nl', region: 'Groningen', timeZone: 'Europe/Amsterdam', countryBasis: 'groningen-region' });
    expect(venueClockContext([6.8, 51.8], {}).countryCode).toBeUndefined();
    expect(venueClockContext([4.9, 52.3], { countryCode: 'nl' }).countryBasis).toBe('osm');
  });
});
