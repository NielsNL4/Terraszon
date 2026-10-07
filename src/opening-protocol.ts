import type { PlaceCoordinates } from './places';

export type HoursState = 'open' | 'closed' | 'unknown';
export type HoursReason = 'missing' | 'invalid-time' | 'unsupported' | 'missing-context' | 'timezone-mismatch' | 'conditional' | 'warning' | 'worker';
export type HoursResult = {
  state: HoursState;
  raw?: string;
  at: number;
  timeZone: string;
  reason?: HoursReason;
  comment?: string;
  nextChange: number | null;
  warnings: string[];
  days: Array<{ date: string; intervals: Array<{ from: number; to: number; state: 'open' | 'unknown'; comment?: string }> }>;
};
export type HoursContext = {
  at: number;
  coordinates: PlaceCoordinates;
  countryCode?: string;
  region?: string;
  timeZone?: string;
  selectedDate?: string;
  selectedMinutes?: number;
};
export type VenueHours = { business: HoursResult; kitchen: HoursResult; terrace: HoursResult };
export type HoursRequest = { type: 'evaluate'; id: number; context: HoursContext; business?: string; kitchen?: string; terrace?: string };
export type HoursResponse = { type: 'hours'; id: number; result: VenueHours };

export function unknownHours(raw: string | undefined, context: HoursContext, reason: HoursReason): HoursResult {
  return { state: 'unknown', raw, at: context.at, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reason, nextChange: null, warnings: [], days: [] };
}
