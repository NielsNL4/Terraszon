import * as SunCalc from 'suncalc';
import type { SunState } from './types';

export function dateAtMinutes(dateValue: string, minutes: number): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hours, mins, 0, 0);
  return date;
}

export function getSunState(date: Date, latitude: number, longitude: number): SunState {
  const position = SunCalc.getPosition(date, latitude, longitude);
  const day = new Date(date);
  day.setHours(12, 0, 0, 0);
  const times = SunCalc.getTimes(day, latitude, longitude);
  const altitude = position.altitude;

  return {
    altitude,
    azimuth: position.azimuth,
    sunrise: times.sunrise,
    sunset: times.sunset,
    isDaylight: altitude > 0,
  };
}

export function timelineEventPosition(date: Date | null, maximum = 1435): number | null {
  if (!date || !Number.isFinite(date.getTime()) || !Number.isFinite(maximum) || maximum <= 0) return null;
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  return Math.max(0, Math.min(100, minutes / maximum * 100));
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
