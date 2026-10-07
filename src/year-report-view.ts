import { lightChartBar, lightChartLabel, lightChartLegend, lightChartScale } from './report-charts';
import { reportDuration } from './day-report-format';
import type { DaySunReport } from './sun-report-protocol';
import type { createYearReportController } from './year-report-controller';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element;
};
export function createYearReportView(options: { controller: ReturnType<typeof createYearReportController>; onDay: (report: DaySunReport) => void; canStart: () => boolean }) {
  const element = node('section', 'year-report'); element.setAttribute('aria-label', 'Jaaroverzicht');
  const live = node('p', 'place-announcement'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  const content = node('div', 'year-report-content'); element.append(live, content);
  let yearInput: HTMLInputElement | null = null;
  const button = (label: string, run: () => void, key: string) => {
    const control = node('button', 'place-action', label); control.type = 'button'; control.dataset.focusKey = `year:${key}`; control.addEventListener('click', run); return control;
  };
  const render = () => {
    const state = options.controller.get(), context = options.controller.context();
    const focused = element.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
    const draft = document.activeElement === yearInput ? yearInput?.value : undefined;
    content.replaceChildren(); yearInput = null; element.hidden = !context;
    element.setAttribute('aria-busy', String(state.phase === 'loading'));
    if (state.phase !== 'ready') live.textContent = '';
    if (!context) return;
    const heading = node('div', 'day-report-header'); heading.append(node('h3', '', `Zon door het jaar · ${context.year}`));
    if (state.expanded) heading.append(button('Verberg jaar', options.controller.close, 'hide'));
    content.append(heading);
    content.append(node('p', 'day-report-note', 'Representatieve dagen, geen maandgemiddelden. Iedere maand de 15e; de seizoenen hebben een eigen datum.'));
    if (!state.expanded) {
      const open = button('Bekijk jaaroverzicht', () => { options.controller.open(); element.querySelector<HTMLElement>('[data-focus-key="year:hide"]')?.focus({ preventScroll: true }); element.scrollIntoView({ block: 'start' }); }, 'open');
      open.disabled = !options.canStart(); content.append(open);
      if (focused) open.focus({ preventScroll: true }); return;
    }
    const toolbar = node('div', 'year-report-toolbar'), label = node('label', '', 'Jaar');
    yearInput = node('input', ''); yearInput.type = 'number'; yearInput.min = '1'; yearInput.max = '9999'; yearInput.step = '1'; yearInput.required = true;
    yearInput.value = draft ?? String(context.year); yearInput.dataset.focusKey = 'year:input';
    // Commit before blur so a type-then-click calculation keeps its action.
    yearInput.addEventListener('input', event => {
      const input = event.currentTarget as HTMLInputElement;
      try { options.controller.setYear(input.valueAsNumber); input.setCustomValidity(''); }
      catch (error) { input.setCustomValidity(error instanceof Error ? error.message : 'Kies een geldig jaar.'); }
    }); label.append(yearInput); toolbar.append(label);
    yearInput.addEventListener('change', event => (event.currentTarget as HTMLInputElement).reportValidity());
    if (state.phase !== 'loading') {
      const request = button(state.phase === 'ready' ? 'Opnieuw berekenen' : 'Bereken jaaroverzicht', () => { if (yearInput?.reportValidity()) options.controller.retry(); }, 'calculate'); request.disabled = !options.canStart(); toolbar.append(request);
    }
    content.append(toolbar);
    const message = node('p', 'day-report-note'); message.setAttribute('role', 'status');
    if (state.phase === 'loading') {
      message.textContent = state.progress?.phase === 'year' ? `Jaaranalyse: ${state.progress.completed} van ${state.progress.total} dagen berekend. Je dagrapport blijft bruikbaar.` : 'Obstakels voor de jaaranalyse laden… Je dagrapport blijft bruikbaar.';
      content.append(message, button('Annuleer jaaranalyse', options.controller.cancel, 'cancel'));
    } else if (state.phase === 'cancelled' || state.phase === 'error' || state.phase === 'idle') {
      message.textContent = state.phase === 'error' ? `${state.error} Probeer opnieuw; je dagrapport blijft beschikbaar.` : state.phase === 'cancelled' ? 'Jaaranalyse geannuleerd. Kies Bereken jaaroverzicht om opnieuw te beginnen.' : 'Kies Bereken jaaroverzicht voor dit jaar en zitpunt.';
      message.classList.toggle('year-report-error', state.phase === 'error'); content.append(message);
    }
    const report = state.report;
    if (report) {
      const days = [...report.months, ...Object.values(report.seasons)], scale = lightChartScale(days.map(day => day.totals));
      if (days.some(day => !day.complete)) content.append(node('p', 'day-report-warning', 'Obstakeldata zijn onvolledig. Berekende zon is alleen het bekende deel; gearceerde perioden blijven onbekend.'));
      if (days.every(day => day.complete && day.totals.sun === 0)) content.append(node('p', 'day-report-note', 'Op deze representatieve dagen is geen directe zon berekend. Dit is geen uitspraak over iedere dag van het jaar.'));
      content.append(lightChartLegend(scale));
      const rows = (data: DaySunReport[], labels: string[]) => {
        const list = node('ul', 'report-date-chart');
        for (let i = 0; i < data.length; i++) {
          const day = data[i], item = node('li', ''), choose = button('', () => options.onDay(day), `day:${day.date}`); choose.classList.add('report-chart-row');
          const date = node('span', 'report-chart-date', labels[i]);
          date.append(node('span', '', new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(day.start))));
          const value = node('span', 'report-chart-value', reportDuration(day.totals.sun));
          if (day.totals.filtered || day.totals.unknown) value.append(node('span', '', `${day.totals.filtered ? `${reportDuration(day.totals.filtered)} gefilterd` : ''}${day.totals.filtered && day.totals.unknown ? ' · ' : ''}${day.totals.unknown ? `${reportDuration(day.totals.unknown)} onbekend` : ''}`));
          choose.setAttribute('aria-label', `${labels[i]}, ${day.date}: ${lightChartLabel(day.totals)}. Bekijk dagrapport.`);
          choose.append(date, lightChartBar(day.totals, scale), value); item.append(choose); list.append(item);
        }
        return list;
      };
      content.append(node('h4', '', 'Maanddagen · directe zon'), rows(report.months, report.months.map(day => new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(new Date(day.start)))));
      content.append(node('h4', '', 'Seizoenen · directe zon'), rows([report.seasons.spring, report.seasons.summer, report.seasons.autumn, report.seasons.winter], ['Lente', 'Zomer', 'Herfst', 'Winter']));
      content.append(node('p', 'day-report-note', 'Kies een rij om precies die dag te bekijken, inclusief dezelfde dagdeelwaarden. Maart en september zijn apart berekend met hun eigen bladstand. Modelschatting, geen weersverwachting.'));
    }
    const announcement = state.phase === 'ready' ? `Jaaroverzicht ${context.year} berekend: twaalf maanddagen en vier seizoensdagen.` : '';
    if (live.textContent !== announcement) live.textContent = announcement;
    if (focused) (element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`) ?? element.querySelector<HTMLElement>('[data-focus-key="year:hide"]'))?.focus({ preventScroll: true });
  };
  return { element, render };
}
