import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateHours } from '../src/opening-engine';
import type { HoursContext } from '../src/opening-protocol';

const context = (date = new Date(2026, 9, 7, 12)): HoursContext => ({ at: date.getTime(), coordinates: [6.568, 53.219], countryCode: 'nl', region: 'Groningen' });
// The upstream parser warns about past explicit dates relative to today's
// clock. Keep these dated fixtures repeatable without suppressing warnings.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 7)); });
afterEach(() => vi.useRealTimers());
describe('openingstijden met de volledige OSM-parser', () => {
  it('berekent vaste weekroosters en scheidt een volgende wissel van huidige status', () => {
    const open = evaluateHours('Mo-Fr 09:00-17:00', context());
    expect(open.state).toBe('open');
    expect(open.nextChange).toBe(new Date(2026, 9, 7, 17).getTime());
    expect(evaluateHours('Mo-Fr 09:00-17:00', context(new Date(2026, 9, 7, 18))).state).toBe('closed');
    expect(open.days).toHaveLength(7);
  });
  it('houdt een vrijdagavondrooster na middernacht op zaterdag open en daarna gesloten', () => {
    expect(evaluateHours('Fr 22:00-02:00', context(new Date(2026, 9, 10, 1))).state).toBe('open');
    expect(evaluateHours('Fr 22:00-02:00', context(new Date(2026, 9, 10, 3))).state).toBe('closed');
  });
  it('ondersteunt pauzes en latere daguitzonderingen', () => {
    expect(evaluateHours('Mo-Fr 09:00-12:00,13:00-17:00', context(new Date(2026, 9, 7, 12, 30))).state).toBe('closed');
    expect(evaluateHours('Mo-Fr 09:00-17:00; We off', context()).state).toBe('closed');
    expect(evaluateHours('Mo-Su 09:00-17:00; 2026 Oct 07 off', context()).state).toBe('closed');
  });
  it('gebruikt Nederlandse feestdagcontext en gokt niet wanneer die ontbreekt', () => {
    const kingsDay = context(new Date(2026, 3, 27, 12));
    expect(evaluateHours('Mo-Su 09:00-17:00; PH off', kingsDay).state).toBe('closed');
    expect(evaluateHours('Mo-Su 09:00-17:00; PH off', { ...kingsDay, countryCode: undefined })).toMatchObject({ state: 'unknown', reason: 'missing-context' });
  });
  it('behandelt schoolvakanties zonder regio, conditionele en foutieve tijden als onbekend', () => {
    expect(evaluateHours('SH 09:00-17:00', { ...context(), region: undefined })).toMatchObject({ state: 'unknown', reason: 'missing-context' });
    expect(evaluateHours('Mo-Su 10:00+', context())).toMatchObject({ state: 'unknown', reason: 'conditional' });
    expect(evaluateHours('geen geldig rooster', context())).toMatchObject({ state: 'unknown', reason: 'unsupported' });
    expect(evaluateHours(undefined, context())).toMatchObject({ state: 'unknown', reason: 'missing' });
  });
  it('geeft constante opening zonder onbegrensde wisselzoektocht', () => {
    expect(evaluateHours('24/7', context())).toMatchObject({ state: 'open', nextChange: null });
    expect(evaluateHours('off', context())).toMatchObject({ state: 'closed', nextChange: null });
  });
  it('weigert een bekende afwijkende tijdzone en genormaliseerde/ongeldige geselecteerde klok', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Pacific/Honolulu' ? 'Europe/Amsterdam' : 'Pacific/Honolulu';
    expect(evaluateHours('24/7', { ...context(), timeZone: zone })).toMatchObject({ state: 'unknown', reason: 'timezone-mismatch' });
    expect(evaluateHours('24/7', { ...context(), at: NaN })).toMatchObject({ state: 'unknown', reason: 'invalid-time' });
    expect(evaluateHours('24/7', { ...context(), selectedDate: '2026-10-07', selectedMinutes: 150 })).toMatchObject({ state: 'unknown', reason: 'invalid-time' });
  });

  it('interpreteert de gecontroleerde Groningse OSM-roosters zonder actuele beschikbaarheid te claimen', () => {
    // OSM nodes 918944223, 1129293293, 2752222651; retrieved 2026-10-07.
    // Source: https://api.openstreetmap.org/api/0.6/nodes.json?nodes=918944223,2752222651,1129293293
    expect(evaluateHours('Tu-Th 10:00-18:00, Fr-Sa 10:00-20:00, Su 12:00-18:00', context()).state).toBe('open');
    expect(evaluateHours('Mo-Fr,Su 11:00-03:00; Sa 10:00-03:00', context(new Date(2026, 9, 8, 1))))
      .toMatchObject({ state: 'unknown', reason: 'warning' });
    expect(evaluateHours('Su-Mo 11:00+; Tu-Sa 10:00+', context()).state).toBe('unknown');
  });
});
