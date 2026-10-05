import { describe, expect, it } from 'vitest';
import { dateAtMinutes, formatMinutes, getSunState, timelineEventPosition } from '../src/sun';

describe('sun helpers', () => {
  it('builds a local date from the date and slider value', () => {
    const date = dateAtMinutes('2026-06-21', 14 * 60 + 35);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(21);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(35);
  });

  it('reports daylight around midsummer noon in Groningen', () => {
    const state = getSunState(new Date(2026, 5, 21, 12), 53.2194, 6.5665);
    expect(state.isDaylight).toBe(true);
    expect(state.altitude).toBeGreaterThan(50);
    expect(state.sunrise).toBeInstanceOf(Date);
    expect(state.sunset).toBeInstanceOf(Date);
  });

  it('formats slider minutes', () => {
    expect(formatMinutes(5)).toBe('00:05');
    expect(formatMinutes(14 * 60 + 30)).toBe('14:30');
  });

  it('houdt opkomst en ondergang op dezelfde positie bij het verplaatsen van de tijdslider', () => {
    const states = [0, 720, 1435].map(minutes => getSunState(dateAtMinutes('2026-10-05', minutes), 53.2188, 6.5682));
    expect(new Set(states.map(state => state.sunrise?.getTime())).size).toBe(1);
    expect(new Set(states.map(state => state.sunset?.getTime())).size).toBe(1);
    expect(states[0].altitude).not.toBe(states[1].altitude);
  });

  it('plaatst daggebeurtenissen proportioneel op de slider en begrenst tijden aan de dagrand', () => {
    const seven = new Date(2026, 9, 5, 7, 0);
    expect(timelineEventPosition(seven)).toBeCloseTo(420 / 1435 * 100);
    expect(timelineEventPosition(new Date(2026, 9, 5, 23, 59))).toBe(100);
    expect(timelineEventPosition(null)).toBeNull();
    expect(timelineEventPosition(new Date(NaN))).toBeNull();
  });

  it('verplaatst de markeringen tussen zomer en winter en verbergt ontbrekende poolgebeurtenissen', () => {
    const summer = getSunState(dateAtMinutes('2026-06-21', 720), 53.2188, 6.5682);
    const winter = getSunState(dateAtMinutes('2026-12-21', 720), 53.2188, 6.5682);
    expect(timelineEventPosition(summer.sunrise)!).toBeLessThan(timelineEventPosition(winter.sunrise)!);
    expect(timelineEventPosition(summer.sunset)!).toBeGreaterThan(timelineEventPosition(winter.sunset)!);
    const polar = getSunState(dateAtMinutes('2026-06-21', 720), 78.2, 15.6);
    expect(timelineEventPosition(polar.sunrise)).toBeNull();
    expect(timelineEventPosition(polar.sunset)).toBeNull();
  });
});
