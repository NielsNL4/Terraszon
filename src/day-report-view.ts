import { createSunReportClient } from './sun-report-client';
import { createDayReportController, type DayReportState } from './day-report-controller';
import { reportClock, reportDuration, reportLimitations, reportStateLabels, reportWindowLabel } from './day-report-format';
import { sunAvailability } from './sun-report-engine';
import { getSunState } from './sun';
import { placeCoordinates, type PlaceCoordinates, type PlaceSelection } from './places';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element;
};

export function createDayReportView(options: {
  onTime: (at: number) => void;
  onExpanded: (expanded: boolean) => void;
  onPicking: (coordinates: PlaceCoordinates | null) => void;
  onApplyPoint: (coordinates: PlaceCoordinates) => void;
  onFocusMap: () => void;
}) {
  const element = node('section', 'day-report'); element.setAttribute('aria-label', 'Dagzonrapport');
  const live = node('p', 'place-announcement'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  const content = node('div', 'day-report-content'); element.append(live, content);
  const client = createSunReportClient();
  let selection: PlaceSelection | null = null, at = 0, date = '', picking: PlaceCoordinates | null = null;
  let currentText: HTMLElement | null = null, slider: HTMLInputElement | null = null, solarText: HTMLElement | null = null;
  let latitude: HTMLInputElement | null = null, longitude: HTMLInputElement | null = null;
  const disclosure = new Map<string, boolean>();
  const button = (text: string, action: () => void, key: string) => {
    const control = node('button', 'place-action', text); control.type = 'button'; control.dataset.focusKey = `report:${key}`;
    control.addEventListener('click', action); return control;
  };
  const details = (label: string, key: string) => {
    const group = node('details', 'day-report-disclosure'); group.open = disclosure.get(key) ?? false;
    const summary = node('summary', '', label); summary.dataset.focusKey = `report:${key}`; group.append(summary);
    group.addEventListener('toggle', () => disclosure.set(key, group.open)); return group;
  };
  const endPicking = () => { if (!picking) return; picking = null; options.onPicking(null); };
  const updateTime = () => {
    const report = controller.get().report; if (!report) return;
    const availability = sunAvailability(report, at), state = availability.current?.state;
    if (currentText) {
      currentText.className = `day-report-current ${state ?? 'unknown'}`;
      const remaining = availability.remainingDirectMinutes;
      currentText.textContent = `${reportClock(at, report)} · ${state ? reportStateLabels[state] : 'Buiten deze dag'}${remaining > 0 ? ` · nog circa ${reportDuration(remaining)}`
        : availability.nextSun ? ` · volgende zon ${reportClock(availability.nextSun.from, report)}` : ''}`;
    }
    if (slider && document.activeElement !== slider) slider.value = String(Math.max(0, Math.min(Number(slider.max), (at - report.start) / 60_000)));
    slider?.setAttribute('aria-valuetext', `${reportClock(at, report)}, ${state ? reportStateLabels[state] : 'onbekend'}`);
    if (solarText) {
      const sun = getSunState(new Date(at), report.target.coordinates[1], report.target.coordinates[0]);
      solarText.textContent = `${Math.round(sun.altitude)}° zonhoogte · ${Math.round(sun.azimuth)}° richting vanaf noord · ${report.settings.timeZone}`;
    }
  };
  const render = (state: DayReportState) => {
    const focused = element.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
    const draft = picking && latitude && longitude ? [latitude.value, longitude.value] : null;
    content.replaceChildren(); currentText = null; slider = null; solarText = null; latitude = null; longitude = null;
    element.hidden = !selection;
    element.setAttribute('aria-busy', String(state.phase === 'loading'));
    const announcement = state.phase === 'ready' ? `Zonrapport berekend: circa ${reportDuration(state.report!.totals.sun)} directe zon${state.report!.complete ? '.' : ', obstakeldata onvolledig.'}` : '';
    if (live.textContent !== announcement) live.textContent = announcement;
    options.onExpanded(state.expanded);
    if (!selection) return;
    const header = node('div', 'day-report-header'); header.append(node('h3', '', 'Zon op dit zitpunt'));
    if (state.expanded) header.append(button('Verberg', () => { endPicking(); controller.close(); }, 'hide'));
    content.append(header);
    if (!state.expanded) {
      content.append(node('p', 'day-report-note', 'Een adres- of horecapin is niet automatisch de plek waar je zit.'),
        button('Bekijk zonrapport', () => { controller.open(); element.querySelector<HTMLButtonElement>('[data-focus-key="report:hide"]')?.focus({ preventScroll: true }); element.scrollIntoView({ block: 'start' }); }, 'open'));
      if (focused) element.querySelector<HTMLButtonElement>('[data-focus-key="report:open"]')?.focus({ preventScroll: true });
      return;
    }
    const dateLabel = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const parsed = new Date(`${date}T12:00:00`);
    content.append(node('p', 'day-report-date', Number.isFinite(parsed.getTime()) ? dateLabel.format(parsed) : 'Kies een geldige datum'));
    const status = node('p', 'day-report-load'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-busy', String(state.phase === 'loading'));
    if (state.phase === 'loading') {
      status.textContent = state.progress?.phase === 'day' ? 'Zonvensters berekenen…' : 'Gebouwen en bomen rond dit zitpunt ophalen…';
      content.append(status, button('Annuleren', () => controller.cancel(), 'cancel'));
    } else if (state.phase === 'error' || state.phase === 'cancelled') {
      status.textContent = state.phase === 'cancelled' ? 'Berekening geannuleerd. Je kunt opnieuw beginnen.' : `${state.error} Probeer opnieuw of kies een ander zitpunt.`;
      status.classList.toggle('error', state.phase === 'error'); content.append(status, button('Opnieuw proberen', controller.retry, 'retry'));
    }
    const report = state.report;
    if (report) {
      const metrics = node('dl', 'day-report-metrics');
      const fact = (label: string, value: string) => { metrics.append(node('dt', '', label), node('dd', '', value)); };
      fact(report.complete ? 'Directe zon' : 'Berekende directe zon', `circa ${reportDuration(report.totals.sun)}`);
      fact('Aandeel daglicht', report.directShareOfDaylight === null ? 'Onbekend' : `${Math.round(report.directShareOfDaylight)}%`);
      fact('Langste zonperiode', report.longestSun ? `${reportDuration((report.longestSun.to - report.longestSun.from) / 60_000)} · ${reportWindowLabel(report.longestSun, report)}` : 'Geen berekende zonperiode');
      content.append(metrics);
      if (!report.complete || report.warnings.includes('ground-point-inside-building')) {
        const warning = node('p', 'day-report-warning', reportLimitations(report)[0]); warning.setAttribute('role', 'status'); content.append(warning);
      }
      const timeline = node('div', 'day-report-timeline'), bands = node('div', 'day-report-bands'); bands.setAttribute('aria-hidden', 'true');
      for (const window of report.windows) {
        const band = node('span', `day-report-band ${window.state}`); band.style.width = `${(window.to - window.from) / (report.end - report.start) * 100}%`; bands.append(band);
      }
      currentText = node('p', 'day-report-current'); currentText.id = 'report-current';
      const label = node('label', 'day-report-time-label', 'Tijdstip op de kaart'); label.htmlFor = 'report-time';
      slider = node('input', 'day-report-time'); slider.id = 'report-time'; slider.type = 'range'; slider.min = '0'; slider.max = String((report.end - report.start) / 60_000 - 1); slider.step = '1';
      slider.dataset.focusKey = 'report:time'; slider.setAttribute('aria-describedby', 'report-current');
      slider.addEventListener('input', event => options.onTime(report.start + Number((event.currentTarget as HTMLInputElement).value) * 60_000));
      const axis = node('div', 'day-report-axis'); axis.append(node('span', '', '00:00'), node('span', '', '12:00'), node('span', '', '24:00'));
      const noon = new Date(report.start); noon.setHours(12, 0, 0, 0); axis.children[1].setAttribute('style', `left:${(noon.getTime() - report.start) / (report.end - report.start) * 100}%`);
      timeline.append(label, bands, slider, axis); content.append(currentText, timeline);
      const legend = node('ul', 'day-report-legend');
      for (const [state, label] of Object.entries(reportStateLabels)) {
        if (!report.windows.some(window => window.state === state)) continue;
        const item = node('li', state); item.append(node('span', 'day-report-swatch'), document.createTextNode(label)); legend.append(item);
      }
      content.append(legend);
      const dayMinutes = (report.end - report.start) / 60_000;
      if (dayMinutes !== 1440) content.append(node('p', 'day-report-note', `Klokwissel: deze dag duurt ${reportDuration(dayMinutes)}. De tijdlijn volgt de werkelijk verstreken tijd; UTC-offsets onderscheiden dubbele kloktijden.`));
      const events = node('p', 'day-report-events', `Opkomst ${reportClock(report.sunrise)} · ondergang ${reportClock(report.sunset)} · ${reportDuration(report.daylightMinutes)} daglicht`); content.append(events);
      const periods = details('Alle lichtperioden', 'periods'), list = node('ul', 'day-report-periods');
      for (const window of report.windows) {
        const item = node('li', ''), choose = button(`${reportWindowLabel(window, report)} · ${reportStateLabels[window.state]}`, () => options.onTime(window.from), `window:${window.from}`);
        item.append(choose); list.append(item);
      }
      periods.append(list); content.append(periods);
      const solar = details('Zonhoogte en richting', 'solar'); solarText = node('p', 'day-report-note'); solar.append(solarText); content.append(solar);
      const explanation = details('Data en modelbeperkingen', 'data');
      const notes = node('ul', 'day-report-notes'); for (const note of reportLimitations(report)) notes.append(node('li', '', note));
      explanation.append(notes, node('p', 'day-report-note', `Gebouwen: OpenStreetMap (${report.coverage.buildings === 'complete' || report.coverage.buildings === 'empty' ? 'geladen gebied volledig' : 'onvolledig'}). Bomen: ${report.coverage.treeSources.map(source => source === 'groningen' ? 'gemeente Groningen' : 'OpenStreetMap').join(', ') || (report.settings.includeTrees ? 'bron niet beschikbaar' : 'uitgeschakeld')}. Daglichtduur gebruikt de zonmiddelpuntstand boven de horizon; opkomst en ondergang volgen de standaardhorizon van SunCalc.`));
      explanation.append(button('Opnieuw berekenen', controller.retry, 'recalculate')); content.append(explanation);
      updateTime();
    }
    const point = node('div', 'day-report-point');
    if (!picking) {
      point.append(node('p', 'day-report-note', `${selection.analysisPoint.label} · ${selection.analysisPoint.coordinates[1].toFixed(5)}, ${selection.analysisPoint.coordinates[0].toFixed(5)} · grondniveau`),
        button('Pas zitpunt aan', () => { picking = [...selection!.analysisPoint.coordinates]; options.onPicking(picking); render(controller.get()); latitude?.focus(); }, 'point'));
    } else {
      const form = node('form', 'day-report-point-form');
      form.append(node('p', 'day-report-note', 'Tik op de kaart of sleep de pin naar je zitpositie. Dit punt is tijdelijk; de bronpin blijft behouden.'));
      const fields = node('div', 'place-coordinate-fields');
      latitude = node('input', ''); longitude = node('input', '');
      for (const [input, text, value] of [[latitude, 'Breedtegraad', picking[1]], [longitude, 'Lengtegraad', picking[0]]] as const) {
        const label = node('label', '', text); input.type = 'text'; input.inputMode = 'decimal'; input.required = true; input.value = String(value); input.dataset.focusKey = `report:${text}`; label.append(input); fields.append(label);
      }
      const feedback = node('p', 'day-report-note'); feedback.setAttribute('role', 'status');
      const parse = () => placeCoordinates([Number(longitude!.value.trim().replace(',', '.')), Number(latitude!.value.trim().replace(',', '.'))]);
      const change = () => { try { if (!longitude!.value.trim() || !latitude!.value.trim()) throw new Error('Vul beide coördinaten in.'); picking = parse(); options.onPicking(picking); feedback.textContent = 'Kaartpin bijgewerkt; kies Gebruik dit punt om toe te passen.'; } catch { feedback.textContent = 'Vul geldige coördinaten in (breedte −90 tot 90, lengte −180 tot 180).'; } };
      latitude.addEventListener('change', change); longitude.addEventListener('change', change);
      if (draft) { latitude.value = draft[0]; longitude.value = draft[1]; }
      const actions = node('div', 'day-report-actions'), apply = node('button', 'place-action place-action-primary', 'Gebruik dit punt'); apply.type = 'submit'; apply.dataset.focusKey = 'report:apply-point';
      actions.append(apply, button('Annuleren', () => { endPicking(); render(controller.get()); element.querySelector<HTMLButtonElement>('[data-focus-key="report:point"]')?.focus(); }, 'cancel-point'), button('Toon kaartpin', options.onFocusMap, 'focus-map'));
      form.append(fields, feedback, actions); form.addEventListener('submit', event => {
        event.preventDefault(); try { if (!longitude!.value.trim() || !latitude!.value.trim()) throw new Error('Vul beide coördinaten in.'); const point = parse(); endPicking(); options.onApplyPoint(point); } catch { feedback.textContent = 'Vul eerst geldige coördinaten in.'; }
      }); point.append(form);
    }
    content.append(point);
    if (focused) (element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`) ?? element.querySelector<HTMLElement>('[data-focus-key="report:hide"]'))?.focus({ preventScroll: true });
  };
  const controller = createDayReportController(client, render);
  return {
    element,
    setContext(next: PlaceSelection | null, nextDate: string, instant: number, includeTrees: boolean) {
      if (next?.place.id !== selection?.place.id) endPicking();
      selection = next; date = nextDate; at = instant;
      controller.setContext(next ? { target: { id: `${next.place.id}:${next.analysisPoint.id}`, coordinates: next.analysisPoint.coordinates }, date: nextDate, includeTrees } : null);
      updateTime();
    },
    setPickedPoint(value: PlaceCoordinates) { if (!picking) return false; picking = [...value]; if (latitude && longitude) { latitude.value = String(value[1]); longitude.value = String(value[0]); } return true; },
    cancelPicking() { if (!picking) return false; endPicking(); render(controller.get()); return true; },
    hide() { endPicking(); controller.close(); },
    resume() { if (controller.get().expanded) controller.retry(); },
    destroy() { endPicking(); controller.destroy(); client.destroy(); },
  };
}
