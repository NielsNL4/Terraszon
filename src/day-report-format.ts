import type { DaySunReport, ReportState, ReportWindow } from './sun-report-protocol';

export const reportStateLabels: Record<ReportState, string> = {
  sun: 'Directe zon', shade: 'Gebouwschaduw', filtered: 'Mogelijk gefilterd licht', night: 'Geen daglicht', unknown: 'Onbekend',
};
export function reportDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes)), hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours} u${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}
export function reportClock(at: number | null, report?: Pick<DaySunReport, 'end'>): string {
  if (at === null || !Number.isFinite(at)) return 'Niet op deze dag';
  if (at === report?.end) return '24:00';
  const date = new Date(at);
  const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date);
  // Offset distinguishes the repeated autumn hour in window labels.
  const before = new Date(date); before.setDate(before.getDate() - 1);
  const after = new Date(date); after.setDate(after.getDate() + 1);
  return before.getTimezoneOffset() !== after.getTimezoneOffset() ? `${time} (UTC${date.getTimezoneOffset() <= 0 ? '+' : '−'}${Math.abs(date.getTimezoneOffset()) / 60})` : time;
}
export function reportWindowLabel(window: ReportWindow, report: DaySunReport): string {
  return `${reportClock(window.from, report)}–${reportClock(window.to, report)}`;
}
export function reportLimitations(report: DaySunReport): string[] {
  const notes: string[] = [];
  if (!report.complete) notes.push('Obstakeldata zijn onvolledig. Zonduur is alleen het berekende deel; onbekende perioden zijn geen zekere zon.');
  if (report.warnings.includes('ground-point-inside-building')) notes.push('Dit punt ligt binnen een gebouw. Kies je echte zitpositie buiten voor een bruikbaar zonadvies.');
  if (report.coverage.estimatedHeights) notes.push(`${report.coverage.estimatedHeights} gebouwhoogten zijn geschat.`);
  if (report.settings.includeTrees) notes.push('Boomvorm en bladstand zijn geschat. Mogelijk gefilterd licht telt niet mee als directe zon.');
  else notes.push('Bomen zijn uitgeschakeld en tellen niet mee in dit rapport.');
  notes.push(`Modelschatting op grondniveau, geen weersverwachting. Parasols, luifels en reliëf zijn niet meegenomen. Schaduwen zijn begrensd op 500 meter. Sampling: ${report.accuracy.sampleMinutes} minuten, gevonden wissels circa ${report.accuracy.transitionSeconds / 60} minuut; korte perioden kunnen ontbreken.`);
  return notes;
}
