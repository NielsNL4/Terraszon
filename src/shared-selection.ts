import { placeCoordinates, customPlace, type PlaceCoordinates } from './places';
import { reportObstacleBounds } from './report-obstacles';

export type SharedSelection = { coordinates: PlaceCoordinates; date: string; minutes: number; at: number; zone: string; includeTrees: boolean };
const keys = ['share', 'lon', 'lat', 'date', 'minutes', 'at', 'zone', 'trees'];
export function clockInZone(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) };
}
export function readSharedSelection(url: URL): SharedSelection | null {
  const params = new URLSearchParams(url.hash.slice(1)); if (!params.has('share')) return null;
  const fail = () => { throw new Error('Deze deellink is ongeldig of gebruikt een onbekende versie. Kies een plek om verder te gaan.'); };
  if (url.hash.length > 1500 || params.get('share') !== '1' || [...params.keys()].some(key => !keys.includes(key)) || keys.some(key => params.getAll(key).length !== 1)) return fail();
  const numeric = (key: string) => { const text = params.get(key)!; if (!text || !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return fail(); return Number(text); };
  try {
    const coordinates = placeCoordinates([numeric('lon'), numeric('lat')]); reportObstacleBounds(coordinates);
    const at = numeric('at'), minutes = numeric('minutes'), date = params.get('date')!, zone = params.get('zone')!;
    if (!Number.isSafeInteger(at) || !Number.isInteger(minutes) || minutes < 0 || minutes > 1439 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || zone.length > 100 || !['0', '1'].includes(params.get('trees')!)) return fail();
    const clock = clockInZone(at, zone); if (clock.date !== date || clock.minutes !== minutes) return fail();
    return { coordinates, at, minutes, date, zone, includeTrees: params.get('trees') === '1' };
  } catch { return fail(); }
}
export function sharedSelectionLink(base: URL, coordinates: PlaceCoordinates, at: number, includeTrees: boolean): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone, clock = clockInZone(at, zone);
  const url = new URL(base); url.search = ''; url.hash = new URLSearchParams({ share: '1', lon: String(coordinates[0]), lat: String(coordinates[1]), date: clock.date,
    minutes: String(clock.minutes), at: String(at), zone, trees: includeTrees ? '1' : '0' }).toString();
  readSharedSelection(url); return url.href;
}
export function sharedPoint(selection: SharedSelection) {
  return customPlace('Gedeeld zitpunt', selection.coordinates, `shared:${selection.coordinates.join(':')}`);
}
