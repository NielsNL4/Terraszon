import { reportDuration } from './day-report-format';
import type { DaySunReport, ReportTotals } from './sun-report-protocol';

export const reportParts = [
  { key: 'morning', label: 'Ochtend', range: 'vóór 12:00' },
  { key: 'midday', label: 'Middag', range: '12:00–17:00' },
  { key: 'evening', label: 'Avond', range: 'vanaf 17:00' },
] as const;
export function lightChartScale(totals: ReportTotals[]): number {
  return Math.max(60, ...totals.map(total => Math.ceil((total.sun + total.filtered + total.unknown) / 60) * 60));
}
export function lightChartLabel(total: ReportTotals): string {
  return `circa ${reportDuration(total.sun)} directe zon${total.filtered ? ` · ${reportDuration(total.filtered)} mogelijk gefilterd` : ''}${total.unknown ? ` · ${reportDuration(total.unknown)} onbekend` : ''}`;
}
export function lightChartBar(total: ReportTotals, scale: number): HTMLElement {
  const bar = document.createElement('span'); bar.className = 'report-chart-bar'; bar.setAttribute('aria-hidden', 'true');
  for (const state of ['sun', 'filtered', 'unknown'] as const) {
    const band = document.createElement('span'); band.className = `day-report-band ${state}`;
    band.style.width = `${Math.max(0, Math.min(100, total[state] / scale * 100))}%`; bar.append(band);
  }
  return bar;
}
export function lightChartLegend(scale: number): HTMLElement {
  const text = document.createElement('p'); text.className = 'day-report-note report-chart-key';
  text.textContent = `Schaal 0–${reportDuration(scale)}: geel directe zon, groen mogelijk gefilterd licht, arcering onbekend. Schaduw en nacht zijn niet in de balk opgeteld.`; return text;
}
export function dayPartChart(report: DaySunReport): HTMLElement {
  const list = document.createElement('dl'); list.className = 'report-part-chart';
  const scale = lightChartScale(reportParts.map(part => report.parts[part.key]));
  for (const part of reportParts) {
    const label = document.createElement('dt'); label.textContent = `${part.label} · ${part.range}`;
    const value = document.createElement('dd'); value.append(lightChartBar(report.parts[part.key], scale));
    const text = document.createElement('span'); text.textContent = lightChartLabel(report.parts[part.key]); value.append(text); list.append(label, value);
  }
  const group = document.createElement('div'); group.append(list, lightChartLegend(scale)); return group;
}
