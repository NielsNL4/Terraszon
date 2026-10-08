import { createDurationSearch, durationMatches, type DurationCandidate, type DurationContext } from './duration-search';
import { createSunReportClient } from './sun-report-client';
import { dateAtMinutes, formatMinutes } from './sun';
import { reportDuration } from './day-report-format';
import type { DaySunReport } from './sun-report-protocol';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element;
};
export function createDurationSearchView(options: { onSelect: (candidate: DurationCandidate, report: DaySunReport | undefined, origin: HTMLElement, at: number, date: string) => void; onExpanded: () => void }) {
  const element = node('section', 'duration-search'); element.setAttribute('aria-label', 'Zoeken op zonneduur');
  const toggle = node('button', 'place-action', 'Zoek op zonneduur'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false'); toggle.dataset.focusKey = 'duration:toggle';
  const content = node('div', 'duration-search-content'); content.hidden = true;
  const form = node('form', 'duration-search-form'), arrivalLabel = node('label', '', 'Aankomsttijd'), arrival = node('input', '');
  arrival.type = 'time'; arrival.required = true; arrival.step = '60'; arrival.dataset.focusKey = 'duration:arrival'; arrivalLabel.append(arrival);
  const minimumLabel = node('label', '', 'Minstens directe zon'), minimum = node('select', ''); minimum.dataset.focusKey = 'duration:minimum';
  minimum.setAttribute('aria-label', 'Minstens directe zon');
  for (const value of [15, 30, 60, 90, 120]) { const option = node('option', '', reportDuration(value)); option.value = String(value); minimum.append(option); } minimum.value = '60'; minimumLabel.append(minimum);
  const start = node('button', 'place-action place-action-primary', 'Analyseer 6 plekken'); start.type = 'submit'; start.dataset.focusKey = 'duration:start';
  const cancel = node('button', 'place-action', 'Annuleren'); cancel.type = 'button'; cancel.dataset.focusKey = 'duration:cancel'; cancel.hidden = true;
  const feedback = node('p', 'duration-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const results = node('div', 'duration-results');
  form.append(arrivalLabel, minimumLabel, start, cancel);
  content.append(node('p', 'duration-note', '6 plekken per stap, maximaal 24. Bronpins kunnen afwijken van je zitpositie; controleer het punt in het rapport.'), form, feedback, results);
  element.append(toggle, content);
  let input: Omit<DurationContext, 'at'> & { minutes: number } | null = null, touched = false;
  const render = () => {
    const state = search.get(), focused = results.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
    start.disabled = !input || !input.candidates.length || state.phase === 'loading' || state.examined >= Math.min(24, state.total);
    start.textContent = state.examined >= Math.min(24, state.total) && state.examined ? 'Analyse afgerond' : state.examined ? 'Analyseer volgende 6' : 'Analyseer 6 plekken'; cancel.hidden = state.phase !== 'loading';
    start.classList.toggle('place-action-primary', !start.disabled);
    element.setAttribute('aria-busy', String(state.phase === 'loading'));
    const selected = durationMatches(state.results, Number(minimum.value));
    feedback.textContent = state.phase === 'idle' ? `${state.total} kandidaten. Onberekende plekken zijn niet nul zon.`
      : `${state.examined} van ${Math.min(24, state.total)} geanalyseerd · ${selected.length} geschikt${state.phase === 'cancelled' ? ' · geannuleerd' : state.phase === 'loading' ? ' · bezig…' : ''}.`;
    results.replaceChildren();
    const list = (values: typeof state.results, title: string) => {
      if (!values.length) return;
      results.append(node('h3', '', title)); const rows = node('ul', 'duration-list');
      for (const result of values) {
        const item = node('li', ''), choose = node('button', 'place-row'); choose.type = 'button'; choose.dataset.focusKey = `duration:${result.candidate.target.id}`; choose.disabled = !arrival.checkValidity();
        const text = node('span', 'place-row-main'); text.append(node('strong', 'place-row-name', result.candidate.name), node('span', 'place-row-meta',
          result.remaining === null ? result.error === 'Nog niet berekend' ? 'Nog niet berekend' : result.error ? 'Berekening niet beschikbaar' : 'Onvolledige data · zonneduur onbekend' : `Nog circa ${reportDuration(result.remaining)} directe zon bij aankomst`));
        choose.append(text); choose.addEventListener('click', () => {
          const [hours, minutes] = arrival.value.split(':').map(Number);
          options.onSelect(result.candidate, result.report, choose, dateAtMinutes(input!.date, hours * 60 + minutes).getTime(), input!.date);
        }); item.append(choose); rows.append(item);
      }
      results.append(rows);
    };
    list(selected, 'Geschikt bij aankomst');
    list(state.results.filter(result => result.remaining === null), 'Zonneduur onbekend');
    const unexamined = input?.candidates.slice(state.examined, Math.min(24, state.examined + 6)) ?? [];
    list(unexamined.map(candidate => ({ candidate, remaining: null, error: 'Nog niet berekend' })), 'Nog niet berekend');
    if (!selected.length && state.examined) results.append(node('p', 'duration-note', 'Nog geen berekende plek die aan de minimumduur voldoet. Kies minder minuten, een andere aankomsttijd of pas een zitpunt aan.'));
    if (state.total > 24) results.append(node('p', 'duration-note', 'Maximaal de eerste 24 worden geanalyseerd. Verfijn je zoekterm of verplaats de kaart voor andere kandidaten.'));
    if (focused) results.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  };
  const search = createDurationSearch(createSunReportClient, render);
  const update = () => {
    if (!input) return;
    if (!arrival.value) { search.reset(); return; }
    const [hours, minutes] = arrival.value.split(':').map(Number), at = dateAtMinutes(input.date, hours * 60 + minutes);
    arrival.setCustomValidity(at.getHours() === hours && at.getMinutes() === minutes ? '' : 'Deze kloktijd bestaat niet op de gekozen dag. Kies een andere tijd.');
    if (arrival.checkValidity()) search.setContext({ ...input, at: at.getTime() }); else search.reset();
  };
  toggle.addEventListener('click', () => { content.hidden = !content.hidden; toggle.setAttribute('aria-expanded', String(!content.hidden)); if (content.hidden) search.cancel(); else { update(); render(); } options.onExpanded(); });
  arrival.addEventListener('input', () => { touched = true; update(); }); minimum.addEventListener('change', render);
  form.addEventListener('submit', event => { event.preventDefault(); update(); if (form.reportValidity()) search.start(); }); cancel.addEventListener('click', () => search.cancel());
  return { element,
    isExpanded: () => !content.hidden,
    setContext(next: Omit<DurationContext, 'at'> & { minutes: number }) { input = next; if (!touched) arrival.value = formatMinutes(next.minutes); update(); render(); },
    stop() { search.cancel(); },
    destroy() { search.destroy(); },
  };
}
