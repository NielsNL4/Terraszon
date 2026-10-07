import { amenityLabel, discoveryRows, distanceMeters, evidenceLabel, formatDistance, selectedTerrace, selectionStatus, sourceFact, statusLabel,
  type DiscoveryContext } from './discovery';
import { customPlace, resolveSavedPlace, type Place, type PlaceCoordinates, type PlaceSelection, type SavedPlace } from './places';
import { createPlaceEditor } from './place-editor';
import { liveSavedPlace, personalPlaceRows, personalTypeLabel, savePlaceDraft, type SavedPlacesStore } from './personal-places';
import { exportPlacesGeoJSON, PlacesStorageError } from './saved-places';
import type { SearchResult } from './search';

const icon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const closeIcon = icon('m6 6 12 12M18 6 6 18');
const backIcon = icon('m10 5-7 7 7 7M3 12h18');
const searchIcon = icon('M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 5 6 6');
const bookmarkIcon = icon('M6 3h12v18l-6-4-6 4V3Z');
const deleteIcon = icon('M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7');
const statusIcons = {
  sun: icon('M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1'),
  shade: icon('M12 4a8 8 0 1 0 0 16V4Zm0 0a8 8 0 0 1 0 16M12 9l4-2m-4 6 6-3m-6 7 6-3'),
  filtered: icon('M12 20v-7m-4 3 4-3 4 3M7 12a4 4 0 0 1-1-8 5 5 0 0 1 9-1 4 4 0 0 1 3 9H7Z'),
  night: icon('M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10Z'),
  pending: icon('M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'),
  unknown: icon('M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'),
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function statusNode(status: keyof typeof statusIcons | null, label = statusLabel(status === 'pending' || status === 'unknown' ? null : status)) {
  const badge = node('span', `place-status ${status ?? 'pending'}`);
  const symbol = node('span', 'place-status-icon'); symbol.innerHTML = statusIcons[status ?? 'pending'];
  badge.append(symbol, node('span', '', label));
  return badge;
}

export function createPlacePanel(root: HTMLElement, options: {
  trigger: HTMLButtonElement;
  onSelect: (place: Place, origin: HTMLElement) => void;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onZoom: () => void;
  onShowTerraces: () => void;
  onShowAll: () => void;
  onShowOnMap: () => void;
  store: SavedPlacesStore;
  getMapCenter: () => PlaceCoordinates;
  onPointEditing: (coordinates: PlaceCoordinates | null) => void;
  onFocusMap: () => void;
  reportElement: HTMLElement;
  onEditStart: () => void;
}) {
  root.innerHTML = `
    <header class="place-panel-header">
      <button class="place-panel-back place-icon-button" type="button" aria-label="Terug naar locaties" hidden>${backIcon}</button>
      <h2 id="place-panel-title" tabindex="-1">Ontdek</h2>
      <button class="place-panel-close place-icon-button" type="button" aria-label="Sluit locaties">${closeIcon}</button>
    </header>
    <nav class="place-sections" aria-label="Locatieverzameling"><button type="button" data-section="nearby" aria-pressed="true">In de buurt</button><button type="button" data-section="saved" aria-pressed="false">Mijn plekken</button></nav>
    <div class="place-query-row">
      <label class="search-label" for="venue-query">Zoek in geladen locaties in dit kaartgebied</label>
      ${searchIcon}<input id="venue-query" type="search" placeholder="Naam in dit kaartgebied" autocomplete="off" />
    </div>
    <p class="place-panel-context"></p>
    <p class="place-announcement" role="status" aria-live="polite" aria-atomic="true"></p>
    <div class="place-storage-feedback" role="status" hidden></div>
    <input class="place-import-file" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden />
    <div class="place-panel-body"></div>`;
  root.setAttribute('aria-labelledby', 'place-panel-title');
  const heading = root.querySelector<HTMLHeadingElement>('h2')!;
  const queryRow = root.querySelector<HTMLElement>('.place-query-row')!;
  const query = root.querySelector<HTMLInputElement>('#venue-query')!;
  const back = root.querySelector<HTMLButtonElement>('.place-panel-back')!;
  const closeButton = root.querySelector<HTMLButtonElement>('.place-panel-close')!;
  const description = root.querySelector<HTMLElement>('.place-panel-context')!;
  const body = root.querySelector<HTMLElement>('.place-panel-body')!;
  const announcement = root.querySelector<HTMLElement>('.place-announcement')!;
  const sections = root.querySelector<HTMLElement>('.place-sections')!;
  const feedback = root.querySelector<HTMLElement>('.place-storage-feedback')!;
  const importFile = root.querySelector<HTMLInputElement>('.place-import-file')!;
  let context: DiscoveryContext | null = null, selection: PlaceSelection | null = null;
  let open = false, visibleCount = 80, renderKey = '', origin: HTMLElement | null = null;
  let announcementTimer: ReturnType<typeof setTimeout> | undefined, lastAnnouncement = '';
  let area: 'nearby' | 'saved' = 'nearby', importGeneration = 0;
  let editor: ReturnType<typeof createPlaceEditor> | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const announce = (text: string) => {
    clearTimeout(announcementTimer);
    if (text === lastAnnouncement) return;
    announcementTimer = setTimeout(() => {
      if (!open || selection) return;
      announcement.textContent = text; lastAnnouncement = text;
    }, 250);
  };

  const button = (label: string, action: () => void, key: string) => {
    const element = node('button', 'place-action', label); element.type = 'button';
    element.dataset.focusKey = key; element.addEventListener('click', action); return element;
  };
  const message = (title: string, text: string) => {
    const block = node('div', 'place-message');
    block.append(node('h3', '', title), node('p', '', text)); body.append(block); return block;
  };
  const link = (label: string, url: string, key: string) => {
    const element = node('a', 'place-action', label); element.href = url;
    if (!url.startsWith('tel:')) { element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    element.dataset.focusKey = key; return element;
  };
  const storageFeedback = (text: string, error = false, action?: { label: string; run: () => void }) => {
    clearTimeout(feedbackTimer);
    feedback.hidden = false; feedback.classList.toggle('error', error); feedback.replaceChildren(node('p', '', text));
    feedback.classList.toggle('is-transient', !error && !action);
    if (action) feedback.append(button(action.label, action.run, 'storage-action'));
    else if (!error) feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 4_000);
  };
  const failure = (error: unknown) => storageFeedback(error instanceof Error ? error.message : 'Opslaan lukt niet. Probeer opnieuw.', true);
  const save = (place: Place) => {
    try { options.store.save(place); render(); storageFeedback('Opgeslagen op dit apparaat.'); }
    catch (error) { failure(error); }
  };
  const savedButton = (place: Place, compact = false) => {
    const saved = !!options.store.get(place.id);
    const element = button(saved ? 'Opgeslagen' : 'Opslaan', () => save(place), `save:${place.id}`);
    element.disabled = saved; element.classList.toggle('is-saved', saved);
    if (compact) {
      element.className = `place-save-button place-icon-button${saved ? ' is-saved' : ''}`;
      element.innerHTML = bookmarkIcon;
      element.setAttribute('aria-label', saved ? `${place.name} is opgeslagen` : `Sla ${place.name} op`);
      element.title = saved ? 'Opgeslagen op dit apparaat' : 'Opslaan';
    }
    return element;
  };
  const remove = (record: SavedPlace) => {
    try {
      options.store.remove(record.id);
      if (selection?.place.id === record.id) options.onClear();
      render();
      storageFeedback('Plek verwijderd.', false, { label: 'Ongedaan maken', run: () => {
        try {
          const result = options.store.import(exportPlacesGeoJSON([record])); render();
          storageFeedback(result.imported ? 'Plek teruggezet.' : 'Deze plek is al aanwezig.');
        } catch (error) { failure(error); }
      } });
    } catch (error) { failure(error); }
  };
  const finishEditor = () => {
    editor?.dispose(); editor = null; root.classList.remove('is-editing'); options.onPointEditing(null); renderKey = '';
  };
  const cancelEditor = (focus = true) => {
    finishEditor(); render();
    if (focus) (body.querySelector<HTMLElement>('[data-focus-key="edit"]') ?? heading).focus({ preventScroll: true });
  };
  const startEditor = (place?: Place) => {
    if (!context) return;
    options.onEditStart();
    const target = place ?? customPlace('Nieuwe plek', options.getMapCenter());
    const saved = options.store.get(target.id);
    const coordinates = selection?.place.id === target.id ? selection.analysisPoint.coordinates : saved?.personal.analysisPoints[0]?.coordinates ?? target.coordinates;
    root.classList.add('is-editing'); root.classList.remove('is-saved-list'); body.replaceChildren(); body.scrollTop = 0;
    heading.textContent = place ? 'Plek bewerken' : 'Plek toevoegen'; heading.title = '';
    queryRow.hidden = true; sections.hidden = true; back.hidden = false;
    description.textContent = 'Persoonlijk · nog niet opgeslagen. Tik of sleep de kaartpin.';
    body.setAttribute('aria-busy', 'false'); clearTimeout(announcementTimer);
    feedback.hidden = true;
    editor = createPlaceEditor(body, { name: saved?.personal.name ?? (place ? target.name : ''),
      type: saved?.personal.type ?? 'other', note: saved?.personal.note ?? '', coordinates }, {
      onCoordinates: value => options.onPointEditing(value), onFocusMap: options.onFocusMap,
      onCancel: () => cancelEditor(),
      onSave(draft) {
        const live = saved && context ? liveSavedPlace(saved, context) : target;
        const record = savePlaceDraft(options.store, live ?? target, draft);
        const resolved = resolveSavedPlace(record, target.kind === 'custom' ? { ...target, name: draft.name, coordinates: draft.coordinates } : live ?? target);
        finishEditor();
        if (resolved) options.onSelect(resolved, heading);
        storageFeedback('Opgeslagen op dit apparaat.');
      },
    });
    options.onPointEditing(coordinates); editor.focus();
  };
  const exportCollection = () => {
    try {
      const text = options.store.export(), url = URL.createObjectURL(new Blob([text], { type: 'application/geo+json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `terraszon-plekken-${new Date().toISOString().slice(0, 10)}.geojson`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
      storageFeedback('Export gestart. Het bestand bevat je persoonlijke plekken en notities.');
    } catch (error) { failure(error); }
  };
  const render = () => {
    if (!open || !context || editor) return;
    const rows = discoveryRows(context, query.value);
    const records = options.store.list(), stored = selection ? options.store.get(selection.place.id) : undefined;
    const personalRows = personalPlaceRows(records, context, query.value);
    const storageState = options.store.state();
    root.classList.toggle('is-saved-list', area === 'saved' && !selection);
    const feature = selection ? selectedTerrace(selection, context) : undefined;
    const status = selection ? selectionStatus(selection, context) : null;
    heading.textContent = selection?.name ?? (area === 'saved' ? 'Mijn plekken' : 'Ontdek');
    heading.title = selection?.name ?? '';
    queryRow.hidden = !!selection; back.hidden = !selection;
    sections.hidden = !!selection;
    for (const control of sections.querySelectorAll<HTMLButtonElement>('button')) control.setAttribute('aria-pressed', String(control.dataset.section === area));
    query.placeholder = area === 'saved' ? 'Naam of notitie in Mijn plekken' : 'Naam in dit kaartgebied';
    root.querySelector<HTMLLabelElement>('label[for="venue-query"]')!.textContent = area === 'saved' ? 'Zoek in je persoonlijke plekken' : 'Zoek in geladen locaties in dit kaartgebied';
    description.textContent = selection ? `${context.timeLabel} · ${selection.place.kind === 'venue' ? amenityLabel(selection.place.venue?.amenity) : selection.place.kind === 'custom' ? 'Eigen locatie' : 'Gezocht adres of punt'}`
      : area === 'saved' ? `${personalRows.length} persoonlijke ${personalRows.length === 1 ? 'plek' : 'plekken'} · alleen op dit apparaat`
        : `${rows.length} geladen ${rows.length === 1 ? 'plek' : 'plekken'} · ${context.timeLabel}`;
    body.setAttribute('aria-busy', String(selection ? !!feature && context.statusPending : area === 'nearby' && (context.state === 'loading' || context.statusPending)));
    if (selection) { clearTimeout(announcementTimer); announcement.textContent = ''; lastAnnouncement = ''; }
    else if (area === 'saved') announce(`${personalRows.length} persoonlijke ${personalRows.length === 1 ? 'plek' : 'plekken'} gevonden.`);
    else if (!context.terracesVisible) announce('Horecalocaties staan uit. Zet de laag aan om locaties te bekijken.');
    else if (context.state === 'zoom') announce('Zoom verder in om locaties te laden.');
    else if (context.state === 'ready' && !context.statusPending) {
      const term = query.value.trim();
      announce(context.statusUnavailable && context.onlySunny ? 'Zonstatus niet beschikbaar. Bekijk alle geladen locaties.'
        : rows.length ? `${rows.length} ${rows.length === 1 ? 'locatie' : 'locaties'} in dit kaartgebied${term ? ` voor ${term}` : ''}.`
        : term ? `Geen geladen locaties gevonden voor ${term} in dit kaartgebied.`
          : context.onlySunny ? 'Geen zonnige locaties gevonden in dit kaartgebied.' : 'Geen geladen locaties in dit kaartgebied.');
    } else clearTimeout(announcementTimer);
    const key = JSON.stringify({ selection, status, feature: feature?.properties, state: context.state, area, records, storageState,
      visible: context.terracesVisible, only: context.onlySunny, pending: context.statusPending, unavailable: context.statusUnavailable, query: query.value,
      rows: selection ? [] : rows.slice(0, visibleCount).map(row => [row.place.id, row.place.name, row.status, row.feature.properties.evidence, Math.round(row.distance)]), total: rows.length });
    if (key === renderKey) return;
    renderKey = key;
    const focused = body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
    const scroll = body.scrollTop;
    body.replaceChildren();
    if (selection) {
      const place = selection.place, properties = feature?.properties;
      const summary = node('div', 'place-detail-summary');
      if (place.kind === 'venue') {
        const matches = feature && distanceMeters(selection.analysisPoint.coordinates, feature.geometry.coordinates as [number, number]) <= 0.5;
        const pending = context.statusPending && matches;
        summary.append(statusNode(status ?? (pending ? 'pending' : 'unknown'), status !== null ? statusLabel(status)
          : pending ? 'Zonstatus berekenen…' : 'Zonstatus voor dit punt niet beschikbaar'));
        summary.append(node('p', 'place-evidence', evidenceLabel(properties?.evidence ?? place.venue?.evidence ?? 'possible')));
      }
      body.append(summary);
      const address = place.address;
      if (address) body.append(node('p', 'place-address', address));
      body.append(options.reportElement);
      if (place.kind !== 'venue') {
        message('Een plek op de kaart', 'Aan dit punt zijn geen horecagegevens gekoppeld. De geselecteerde positie blijft op de kaart gemarkeerd.');
      } else {
        const note = status === 'filtered'
          ? 'Boomvorm en bladstand zijn geschat. Dit kan boomschaduw of gefilterd licht zijn.'
          : 'De status geldt voor de bronpin. De exacte zitpositie, parasols en luifels kunnen verschillen.';
        body.append(node('p', 'place-estimate', note));
      }
      const actions = node('div', 'place-detail-actions');
      actions.append(savedButton(place));
      if (stored) {
        actions.append(button('Bewerken', () => startEditor(place), 'edit'), button('Verwijderen', () => remove(stored), 'delete'));
      }
      actions.append(button('Toon op kaart', options.onShowOnMap, 'show-map'));
      const [longitude, latitude] = selection.analysisPoint.coordinates;
      actions.append(link('Route', `https://www.openstreetmap.org/directions?from=&to=${latitude},${longitude}`, 'route'));
      const website = place.venue?.website;
      if (website && /^https?:\/\//i.test(website)) actions.append(link('Website', website, 'website'));
      const phone = place.venue?.phone?.replace(/[^+\d]/g, '');
      if (phone) actions.append(link('Bellen', `tel:${phone}`, 'phone'));
      body.append(actions);
      const details = node('dl', 'place-facts');
      const facts: Array<[string, string | undefined]> = [
        ['Keuken', place.venue?.cuisine?.replaceAll(';', ', ')], ['Openingstijden (bron)', place.venue?.openingHours],
        ['Terras', sourceFact('terrace', properties?.outdoorSeating)], ['Capaciteit', properties?.capacity],
        ['Toegankelijkheid', sourceFact('wheelchair', place.venue?.wheelchair)], ['Overdekt', sourceFact('covered', place.venue?.covered)],
        ['Seizoen', sourceFact('seasonal', properties?.seasonal)],
        ['Geselecteerd punt', `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`],
      ];
      for (const [label, value] of facts) if (value) details.append(node('dt', '', label), node('dd', '', value));
      body.append(details);
      if (stored?.personal.note) {
        const note = node('section', 'place-personal-note'); note.append(node('h3', '', 'Eigen notitie'), node('p', '', stored.personal.note)); body.append(note);
      }
      const source = place.sources.find(value => value.provider === 'osm');
      if (source?.url) body.append(link('Bekijk bron in OpenStreetMap', source.url, 'source'));
      body.append(node('p', 'place-data-note', place.kind === 'custom' ? 'Een persoonlijke plek op dit apparaat, niet een openbare of bevestigde horecalocatie.' : 'Gegevens uit OpenStreetMap kunnen ontbreken of verouderd zijn.'));
    } else if (area === 'saved') {
      const tools = node('div', 'place-collection-tools');
      const add = button('Toevoegen', () => startEditor(), 'add'); add.setAttribute('aria-label', 'Plek toevoegen');
      const importButton = button('Import', () => importFile.click(), 'import'); importButton.setAttribute('aria-label', 'Importeren');
      const exportButton = button('Export', exportCollection, 'export'); exportButton.setAttribute('aria-label', 'Exporteren');
      tools.append(add, importButton, exportButton);
      body.append(tools);
      if (storageState.status === 'error') message('Opslag vraagt aandacht', storageState.error ?? 'Opnieuw laden kan helpen.')
        .append(button('Opnieuw laden', () => { options.store.reload(); render(); }, 'reload-store'));
      if (!personalRows.length) message(query.value.trim() ? 'Geen persoonlijke plek gevonden' : 'Je plekken bij de hand',
        query.value.trim() ? 'Probeer een andere naam of notitie.' : 'Sla horeca op of voeg een eigen plek toe. Je gegevens blijven op dit apparaat; export maakt een handmatige kopie.');
      const list = node('ul', 'place-list personal-place-list');
      for (const row of personalRows.slice(0, visibleCount)) {
        const item = node('li', ''), select = node('button', 'place-row'); select.type = 'button';
        select.dataset.savedId = row.record.id; select.dataset.focusKey = row.record.id; select.disabled = !row.place;
        const text = node('span', 'place-row-main');
        text.append(node('strong', 'place-row-name', row.name), node('span', 'place-row-meta', row.record.kind === 'custom'
          ? `${personalTypeLabel(row.record.personal.type)} · Eigen plek` : 'Opgeslagen plek'));
        if (row.record.personal.note) text.append(node('span', 'place-row-note', row.record.personal.note));
        select.append(text, node('span', 'place-row-distance', row.distance === null ? 'Geen positie' : formatDistance(row.distance)));
        if (row.place) select.addEventListener('click', () => options.onSelect(row.place!, select));
        const erase = button('', () => remove(row.record), `remove:${row.record.id}`); erase.className = 'place-icon-button place-remove-button';
        erase.innerHTML = deleteIcon; erase.setAttribute('aria-label', `Verwijder ${row.name}`); erase.title = 'Verwijderen';
        item.append(select, erase); list.append(item);
      }
      body.append(list);
      if (personalRows.length > visibleCount) body.append(button('Toon meer persoonlijke plekken', () => { visibleCount += 80; render(); }, 'more'));
    } else if (!context.terracesVisible) {
      message('Horecalocaties staan uit', 'Zet de horecalaag aan om de plekken in dit gebied te bekijken.')
        .append(button('Toon horeca', options.onShowTerraces, 'show-terraces'));
    } else if (context.state === 'zoom') {
      message('Bekijk een kleiner gebied', 'Zoom verder in om horecalocaties in de omgeving te laden.')
        .append(button('Zoom in', options.onZoom, 'zoom'));
    } else {
      if (context.state === 'loading' || context.state === 'error') {
        const banner = node('div', 'place-load-message'); banner.setAttribute('role', 'status');
        banner.append(node('p', '', context.state === 'loading' ? 'Plekken ophalen… Eerder geladen plekken blijven zichtbaar.'
          : 'Bijwerken lukt nu niet. Eerder geladen plekken blijven zichtbaar.'));
        if (context.state === 'error') banner.append(button('Opnieuw proberen', options.onRetry, 'retry'));
        body.append(banner);
      }
      if (!rows.length) {
        if (context.state === 'loading') {
          const skeleton = node('div', 'place-skeleton'); skeleton.setAttribute('aria-hidden', 'true');
          for (let i = 0; i < 3; i++) skeleton.append(node('span', ''));
          body.append(skeleton);
        } else if (context.statusUnavailable && context.onlySunny) {
          message('Zonstatus niet beschikbaar', 'Probeer een ander tijdstip of bekijk alle geladen locaties.')
            .append(button('Toon alle locaties', options.onShowAll, 'show-all'));
        } else if (context.statusPending && context.onlySunny) {
          message('Zonstatus bijwerken', 'De locaties verschijnen zodra de nieuwe zonberekening klaar is.');
        } else if (query.value.trim()) {
          message('Geen naam gevonden', 'Je zoekt alleen in geladen locaties in dit kaartgebied. Wis de zoekterm of verplaats de kaart.')
            .append(button('Wis zoekterm', () => { query.value = ''; render(); query.focus(); }, 'clear-query'));
        } else if (context.state !== 'error') {
          message(context.onlySunny ? 'Geen zonnige plekken gevonden' : 'Nog geen plekken in dit gebied',
            context.onlySunny ? 'Verander het tijdstip of zet Alleen zon uit om andere plekken te bekijken.'
              : 'Verplaats de kaart of zoom in. Niet alle horecalocaties zijn in OpenStreetMap opgenomen.');
        }
      } else {
        body.append(node('p', 'place-distance-note', `Hemelsbrede afstand tot ${context.originLabel}.`));
        const list = node('ul', 'place-list');
        for (const row of rows.slice(0, visibleCount)) {
          const item = node('li', ''), select = node('button', 'place-row'); select.type = 'button';
          select.dataset.placeId = row.place.id; select.dataset.focusKey = row.place.id;
          const text = node('span', 'place-row-main');
          text.append(node('strong', 'place-row-name', row.place.name),
            node('span', 'place-row-meta', `${amenityLabel(row.place.venue?.amenity)} · ${evidenceLabel(row.feature.properties.evidence)}`),
            context!.statusUnavailable ? statusNode('unknown', 'Zonstatus niet beschikbaar') : statusNode(row.status));
          const distance = node('span', 'place-row-distance', formatDistance(row.distance));
          distance.setAttribute('aria-label', `${formatDistance(row.distance)} hemelsbreed`);
          select.append(text, distance); select.addEventListener('click', () => options.onSelect(row.place, select));
          item.append(select, savedButton(row.place, true)); list.append(item);
        }
        body.append(list);
        if (rows.length > visibleCount) body.append(button(`Toon meer (${visibleCount} van ${rows.length})`, () => {
          const firstNew = visibleCount; visibleCount += 80; render();
          body.querySelectorAll<HTMLButtonElement>('.place-row')[firstNew]?.focus();
        }, 'more'));
      }
    }
    body.scrollTop = scroll;
    if (focused) body.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  };
  const show = () => {
    open = true; root.hidden = false; options.trigger.setAttribute('aria-expanded', 'true');
    options.onOpenChange(true); render();
  };
  const close = (restoreFocus = true) => {
    if (!open) return;
    open = false; root.hidden = true; options.trigger.setAttribute('aria-expanded', 'false');
    importGeneration++; if (editor) finishEditor();
    clearTimeout(feedbackTimer); feedback.hidden = true;
    clearTimeout(announcementTimer); announcement.textContent = ''; lastAnnouncement = '';
    options.onOpenChange(false); options.onClear(); renderKey = '';
    if (restoreFocus) (origin?.isConnected && !root.contains(origin) ? origin : options.trigger).focus({ preventScroll: true });
  };
  query.addEventListener('input', () => { visibleCount = 80; body.scrollTop = 0; render(); });
  closeButton.addEventListener('click', () => close());
  back.addEventListener('click', () => {
    if (editor) { cancelEditor(); return; }
    const id = selection?.place.id; options.onClear(); body.scrollTop = 0;
    if (id) (body.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(id)}"]`) ?? body.querySelector<HTMLElement>(`[data-saved-id="${CSS.escape(id)}"]`))?.focus();
    if (!body.contains(document.activeElement)) query.focus({ preventScroll: true });
  });
  options.trigger.addEventListener('click', () => {
    if (open) close(); else { origin = options.trigger; show(); query.focus({ preventScroll: true }); }
  });
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'date') return;
    if (open && event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); if (editor) cancelEditor(); else close(); }
  });
  for (const control of sections.querySelectorAll<HTMLButtonElement>('button')) control.addEventListener('click', () => {
    area = control.dataset.section === 'saved' ? 'saved' : 'nearby'; query.value = ''; visibleCount = 80; body.scrollTop = 0;
    render(); query.focus({ preventScroll: true });
  });
  options.store.subscribe(() => render());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0]; importFile.value = '';
    if (!file) return;
    const id = ++importGeneration;
    try {
      if (file.size > 32_000_000) throw new Error('Dit locatiebestand is te groot (maximaal 32 MB).');
      const text = await file.text();
      if (id !== importGeneration || !open) return;
      const result = options.store.import(text); render();
      storageFeedback(`${result.imported} ${result.imported === 1 ? 'plek' : 'plekken'} geïmporteerd · ${result.skipped} overgeslagen. Bestaande notities blijven behouden.`);
    } catch (error) {
      if (id === importGeneration && open) {
        const cause = error instanceof Error ? error.message : 'Importeren lukt niet.';
        const recovery = error instanceof PlacesStorageError ? 'Controleer de browseropslag en probeer opnieuw.' : 'Kies een geldig Terraszon-exportbestand.';
        failure(new Error(`${cause} ${recovery} Je bestaande plekken zijn behouden.`));
      }
    }
  });
  return {
    isOpen: () => open,
    close,
    isEditing: () => editor !== null,
    setDraftCoordinates(value: PlaceCoordinates) { editor?.setCoordinates(value); },
    acceptAddress(result: SearchResult) { if (!editor) return false; editor.acceptAddress(result); return true; },
    externalChange() {
      storageFeedback('Plekken zijn in een ander tabblad aangepast. Je invoer is nog niet opgeslagen.', true,
        { label: editor ? 'Annuleren en opnieuw laden' : 'Opnieuw laden', run: () => { if (editor) cancelEditor(); options.store.reload(); render(); feedback.hidden = true; } });
    },
    setContext(next: DiscoveryContext) { context = next; render(); },
    setSelection(next: PlaceSelection | null, from?: HTMLElement) {
      if (editor && from) finishEditor();
      const changed = next?.place.id !== selection?.place.id;
      selection = next;
      if (next && from) {
        origin = from; if (changed) body.scrollTop = 0; show(); heading.focus({ preventScroll: true });
      } else render();
    },
  };
}
