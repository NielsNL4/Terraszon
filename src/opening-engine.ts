import OpeningHours from 'opening_hours';
import { unknownHours, type HoursContext, type HoursResult } from './opening-protocol';

const parsers = new Map<string, OpeningHours>();
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function evaluateHours(raw: string | undefined, context: HoursContext): HoursResult {
  if (!raw?.trim()) return unknownHours(raw, context, 'missing');
  const date = new Date(context.at), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!Number.isFinite(context.at) || !Number.isFinite(date.getTime())) return unknownHours(raw, context, 'invalid-time');
  if ((context.selectedDate && dayKey(date) !== context.selectedDate)
    || (context.selectedMinutes !== undefined && date.getHours() * 60 + date.getMinutes() !== context.selectedMinutes)) {
    return unknownHours(raw, context, 'invalid-time'); // e.g. a non-existent wall time normalized by Date at DST
  }
  if (context.timeZone && timeZone !== context.timeZone) return unknownHours(raw, context, 'timezone-mismatch');
  const selectors = raw.replace(/"(?:[^"\\]|\\.)*"/g, '');
  if ((/\bPH\b/.test(selectors) && !context.countryCode) || (/\bSH\b/.test(selectors) && (!context.countryCode || !context.region))) {
    return unknownHours(raw, context, 'missing-context');
  }
  if (raw.length > 4_096 || context.coordinates.length !== 2 || !context.coordinates.every(Number.isFinite)) return unknownHours(raw, context, 'unsupported');
  try {
    const key = JSON.stringify([raw, context.coordinates, context.countryCode, context.region]);
    let parser = parsers.get(key);
    if (!parser) {
      parser = new OpeningHours(raw, { lat: context.coordinates[1], lon: context.coordinates[0],
        address: { country_code: context.countryCode ?? '', state: context.region ?? '' } },
      { tag_key: 'opening_hours', mode: 0, map_value: false, warnings_severity: 4, locale: 'en' });
      parsers.set(key, parser);
      while (parsers.size > 128) parsers.delete(parsers.keys().next().value!);
    }
    const warnings = parser.getStructuredWarnings().map(warning => warning.message);
    if (warnings.length) return { ...unknownHours(raw, context, 'warning'), warnings };
    const conditional = parser.getUnknown(date);
    const state = conditional ? 'unknown' as const : parser.getState(date) ? 'open' as const : 'closed' as const;
    const end = new Date(date); end.setDate(end.getDate() + 8);
    const nextChange = parser.getNextChange(date, end)?.getTime() ?? null;
    const days: HoursResult['days'] = [];
    const day = new Date(date); day.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const intervals = parser.getOpenIntervals(day, next).map(([from, to, unknown, comment]) => ({
        from: from.getTime(), to: to.getTime(), state: unknown ? 'unknown' as const : 'open' as const, comment,
      }));
      days.push({ date: dayKey(day), intervals }); day.setDate(day.getDate() + 1);
    }
    return { state, raw, at: context.at, timeZone, ...(conditional ? { reason: 'conditional' as const } : {}),
      comment: parser.getComment(date), nextChange, warnings, days };
  } catch { return unknownHours(raw, context, 'unsupported'); }
}
