import { describe, expect, it } from 'vitest';
import { clockInZone, readSharedSelection, sharedPoint, sharedSelectionLink } from '../src/shared-selection';

describe('deellinks voor een tijdelijk zitpunt', () => {
  it('behoudt punt, moment en instellingen op een geneste Pages-URL zonder andere payload', () => {
    const at = new Date(2026, 6, 15, 14, 23).getTime(), coordinates: [number, number] = [6.568234567, 53.219123456];
    const url = new URL(sharedSelectionLink(new URL('https://example.test/Terraszon/?private=notities#old'), coordinates, at, false));
    expect(url.pathname).toBe('/Terraszon/'); expect(url.search).toBe('');
    const decoded = readSharedSelection(url)!; expect(decoded.coordinates).toEqual(coordinates); expect(decoded.at).toBe(at); expect(decoded.includeTrees).toBe(false);
    expect(url.href).not.toMatch(/notities|private|name|favorite|sourceId/);
    expect(sharedPoint(decoded)).toMatchObject({ kind: 'custom', name: 'Gedeeld zitpunt', coordinates });
    const tiny = new URL(sharedSelectionLink(new URL('https://example.test/'), [1e-8, 53.219], at, true));
    expect(readSharedSelection(tiny)!.coordinates[0]).toBe(1e-8);
  });
  it('weigert ongeldige getallen, datum/tijd, versie, duplicaten en onverwachte velden', () => {
    const valid = new URL(sharedSelectionLink(new URL('https://example.test/'), [6.568, 53.219], new Date(2026, 6, 15, 12).getTime(), true));
    for (const [key, value] of [['share', '2'], ['lat', 'NaN'], ['lat', '89'], ['lon', '181'], ['at', '1.2'], ['minutes', '1440'], ['date', '2026-02-30'], ['zone', 'unknown'], ['trees', 'yes'], ['note', 'secret']]) {
      const url = new URL(valid), params = new URLSearchParams(url.hash.slice(1)); params.set(key, value); url.hash = params.toString(); expect(() => readSharedSelection(url)).toThrow();
    }
    const duplicate = new URL(valid); duplicate.hash += '&lat=53'; expect(() => readSharedSelection(duplicate)).toThrow();
    expect(readSharedSelection(new URL('https://example.test/#other'))).toBeNull();
  });
  it('maakt dubbele wintertijden eenduidig via epoch en de expliciete bronzone', () => {
    const first = Date.UTC(2026, 9, 25, 0, 30), second = Date.UTC(2026, 9, 25, 1, 30);
    expect(clockInZone(first, 'Europe/Amsterdam')).toEqual(clockInZone(second, 'Europe/Amsterdam'));
    const url = new URL(`https://example.test/#share=1&lon=6.568&lat=53.219&date=2026-10-25&minutes=150&at=${second}&zone=Europe%2FAmsterdam&trees=1`);
    expect(readSharedSelection(url)!.at).toBe(second); expect(clockInZone(second, 'UTC').minutes).toBe(90);
  });
});
