import { describe, expect, it } from 'vitest';
import { dateAtMinutes, formatMinutes, getSunState } from '../src/sun';

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
});
