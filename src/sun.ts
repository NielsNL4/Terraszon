import * as SunCalc from 'suncalc';
import type { SunState } from './types';

export function dateAtMinutes(dateValue: string, minutes: number): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(year, month - 1, day, hours, mins, 0, 0);
}

export function getSunState(date: Date, latitude: number, longitude: number): SunState {
  const position = SunCalc.getPosition(date, latitude, longitude);
  const times = SunCalc.getTimes(date, latitude, longitude);
  const altitude = position.altitude;

  return {
    altitude,
    azimuth: position.azimuth,
    sunrise: times.sunrise,
    sunset: times.sunset,
    isDaylight: altitude > 0,
  };
}

export function formatClock(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}
