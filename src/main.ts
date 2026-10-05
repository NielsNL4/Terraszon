import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createTerraceMap, type ViewBounds } from './map';
import { fetchBuildings, type BuildingData } from './building-loader';
import { PALETTE_STORAGE_KEY } from './building-palette';
import { searchPlaces, type SearchResult } from './search';
import { createLocationTracker } from './location';
import type { ShadowWorkerRequest, ShadowWorkerResponse } from './shadow-protocol';
import {
  dateAtMinutes,
  formatClock,
  formatMinutes,
  getSunState,
  timelineEventPosition,
} from './sun';
import { applyTerraceStatuses, fetchTerraces } from './terraces';
import { fetchTrees } from './trees';
import type { BuildingFeature, TerraceFeature, TreeFeature } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App-element ontbreekt');

const now = new Date();
const localDate = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');
const currentMinutes = now.getHours() * 60 + Math.floor(now.getMinutes() / 5) * 5;
const solarEventIcon = (rising: boolean) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18M5 21h14M7 15a5 5 0 0 1 10 0M3 12l2 1m14 0 2-1"/><path d="${rising ? 'M12 10V3m-3 3 3-3 3 3' : 'M12 3v7m-3-3 3 3 3-3'}"/></svg>`;

app.innerHTML = `
  <main class="shell">
    <div id="map" aria-label="Interactieve kaart van terrassen en gebouwschaduwen"></div>

    <section id="loading" class="loading-screen" aria-live="polite" aria-busy="true">
      <div class="loading-card">
        <div class="loading-logo"><span class="sun-mark"></span>Terraszon</div>
        <p>De stad en het zonlicht worden voorbereid...</p>
        <div class="loading-progress"><span></span></div>
        <ul class="loading-steps">
          <li id="load-map" class="active">Kaart laden</li>
          <li id="load-buildings">Gebouwen verzamelen</li>
          <li id="load-terraces">Terrassen ophalen</li>
        </ul>
      </div>
    </section>

    <header class="brand-card map-card">
      <div class="wordmark"><span class="sun-mark"></span>Terraszon</div>
      <p>Vind een tafel in het licht.</p>
    </header>

    <div class="map-actions">
      <div class="search-box map-card">
        <label class="search-label" for="place-search">Zoek een locatie</label>
        <div class="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6"/></svg>
          <input id="place-search" type="search" placeholder="Adres, plaats of straat" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-results" />
        </div>
        <div id="search-results" class="search-results" role="listbox" aria-label="Zoekresultaten" hidden></div>
      </div>
      <button id="my-location" class="location-button map-card" type="button" aria-label="Ga naar mijn locatie" title="Ga naar mijn locatie">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
      </button>
    </div>

    <section class="solar-card map-card" aria-live="polite">
      <span id="day-state" class="eyebrow">ZON BOVEN DE STAD</span>
      <strong id="solar-time">${formatMinutes(currentMinutes)}</strong>
      <span id="solar-detail">Zonpositie berekenen...</span>
    </section>

    <section class="control-panel map-card" aria-label="Zon en kaart instellen">
      <div class="time-row">
        <label class="date-control">
          <span>Datum</span>
          <input id="date" type="date" value="${localDate}" />
        </label>
        <div class="sun-window">
          <span class="sunrise-summary" aria-label="Zonsopkomst"><span class="rise-icon">${solarEventIcon(true)}</span><b id="sunrise">--:--</b></span>
          <span class="sunset-summary" aria-label="Zonsondergang"><span class="set-icon">${solarEventIcon(false)}</span><b id="sunset">--:--</b></span>
        </div>
      </div>

      <label class="slider-label" for="time">
        <span>00:00</span><span>Tijdstip</span><span>23:55</span>
      </label>
      <div class="timeline">
        <input id="time" class="time-slider" type="range" min="0" max="1435" step="5" value="${currentMinutes}" />
        <div class="timeline-events">
          <span id="sunrise-event" class="sun-event sunrise-event" role="img" hidden>${solarEventIcon(true)}<span></span></span>
          <span id="sunset-event" class="sun-event sunset-event" role="img" hidden>${solarEventIcon(false)}<span></span></span>
        </div>
      </div>

      <div class="panel-footer">
        <div class="toggles" aria-label="Kaartlagen">
          <label><input id="buildings" type="checkbox" checked /><span>3D</span></label>
          <label><input id="shadows" type="checkbox" checked /><span>Schaduw</span></label>
          <label><input id="trees" type="checkbox" checked /><span>Bomen</span></label>
          <label><input id="terraces" type="checkbox" checked /><span>Terrassen</span></label>
          <label class="sun-only"><input id="sun-only" type="checkbox" /><span>Alleen zon</span></label>
        </div>
        <div class="legend"><span class="dot sun"></span>Zon <span class="dot shade"></span>Schaduw <span class="dot filtered"></span>Gefilterd licht <span class="dot tree"></span>Bomen <span class="dot possible"></span>Mogelijke horeca</div>
      </div>
      <div class="panel-links"><p id="tree-status" class="tree-status" role="status" aria-live="polite">Bomen laden…</p><a href="./gebouwkleuren.html">Gebouwkleuren aanpassen</a></div>
      <div class="building-status-row"><p id="building-status" class="building-status" role="status" aria-live="polite">Gebouwtypes laden…</p><button id="retry-buildings" type="button" hidden>Opnieuw laden</button></div>
    </section>

    <div id="notice" class="notice" role="status"></div>
  </main>
`;

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element ontbreekt: ${selector}`);
  return element;
}

const dateInput = requiredElement<HTMLInputElement>('#date');
const timeInput = requiredElement<HTMLInputElement>('#time');
const solarTime = requiredElement<HTMLElement>('#solar-time');
const solarDetail = requiredElement<HTMLElement>('#solar-detail');
const dayState = requiredElement<HTMLElement>('#day-state');
const sunrise = requiredElement<HTMLElement>('#sunrise');
const sunset = requiredElement<HTMLElement>('#sunset');
const notice = requiredElement<HTMLElement>('#notice');
const loading = requiredElement<HTMLElement>('#loading');
const loadMap = requiredElement<HTMLElement>('#load-map');
const loadBuildings = requiredElement<HTMLElement>('#load-buildings');
const loadTerracesStep = requiredElement<HTMLElement>('#load-terraces');
const searchInput = requiredElement<HTMLInputElement>('#place-search');
const searchResults = requiredElement<HTMLElement>('#search-results');
const searchBox = requiredElement<HTMLElement>('.search-box');
const locationButton = requiredElement<HTMLButtonElement>('#my-location');
const treeStatus = requiredElement<HTMLElement>('#tree-status');
const buildingStatus = requiredElement<HTMLElement>('#building-status');
const retryBuildings = requiredElement<HTMLButtonElement>('#retry-buildings');
const sunriseEvent = requiredElement<HTMLElement>('#sunrise-event');
const sunsetEvent = requiredElement<HTMLElement>('#sunset-event');
const controlPanel = requiredElement<HTMLElement>('.control-panel');
const mapActions = requiredElement<HTMLElement>('.map-actions');
const solarCard = requiredElement<HTMLElement>('.solar-card');
const shell = requiredElement<HTMLElement>('.shell');
const mobileLayout = window.matchMedia('(max-width: 680px), (max-height: 500px) and (pointer: coarse)');
const bottomControls = document.createElement('div');
bottomControls.className = 'bottom-controls';
shell.append(bottomControls);

function updateViewportLayout(): void {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const keyboard = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
  shell.style.setProperty('--visible-height', `${height}px`);
  shell.style.setProperty('--keyboard-offset', `${keyboard}px`);
  shell.style.setProperty('--bottom-controls-height', `${bottomControls.getBoundingClientRect().height}px`);
}

function arrangeControls(): void {
  const focused = document.activeElement as HTMLElement | null;
  if (mobileLayout.matches) bottomControls.append(controlPanel, mapActions);
  else { solarCard.before(mapActions); notice.before(controlPanel); }
  if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  updateViewportLayout();
}

mobileLayout.addEventListener('change', arrangeControls);
window.visualViewport?.addEventListener('resize', updateViewportLayout);
window.visualViewport?.addEventListener('scroll', updateViewportLayout);
window.addEventListener('resize', updateViewportLayout);
const controlsObserver = new ResizeObserver(updateViewportLayout);
controlsObserver.observe(bottomControls);
arrangeControls();

function mapTargetOffset(): [number, number] {
  if (!mobileLayout.matches) return [0, 0];
  const map = requiredElement<HTMLElement>('#map').getBoundingClientRect();
  const centerX = map.left + map.width / 2;
  const header = solarCard.getBoundingClientRect();
  const top = (centerX >= header.left && centerX <= header.right ? Math.max(0, header.bottom - map.top) : 0) + 12;
  const bottom = bottomControls.getBoundingClientRect().top - map.top - 12;
  return [0, (top + Math.max(top, bottom)) / 2 - map.height / 2];
}

let terraces: TerraceFeature[] = [];
let trees: TreeFeature[] = [];
let buildings: BuildingFeature[] = [];
let treesEnabled = true;
let updateFrame = 0;
let classifyOnNextFrame = false;
let terraceRequest: AbortController | null = null;
let treeRequest: AbortController | null = null;
let buildingTypeRequest: AbortController | null = null;
let noticeTimer = 0;
let loadingFinished = false;
let shadowRequestId = 0;
let obstacleGeneration = 0;
let searchTimer = 0;
let searchRequest: AbortController | null = null;
let searchVersion = 0;
let searchMatches: SearchResult[] = [];
let activeSearchIndex = -1;
let initialLocationAllowed = true;
const shadowWorker = new Worker(new URL('./shadow-worker.ts', import.meta.url), { type: 'module' });

const loadingTimeout = window.setTimeout(() => finishLoading(true), 15_000);

function setLoadingStep(step: HTMLElement, state: 'active' | 'done'): void {
  step.classList.remove('active', 'done');
  step.classList.add(state);
}

function finishLoading(slowNetwork = false): void {
  if (loadingFinished) return;
  loadingFinished = true;
  window.clearTimeout(loadingTimeout);
  loading.setAttribute('aria-busy', 'false');
  loading.classList.add('hidden');
  if (slowNetwork) showNotice('De kaart is klaar. Terrassen worden nog op de achtergrond bijgewerkt.');
}

function showNotice(message: string, persistent = false): void {
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.add('visible');
  if (!persistent) {
    noticeTimer = window.setTimeout(() => notice.classList.remove('visible'), 4_000);
  }
}

function renderSolarState(classifyTerraceStatus = false): void {
  const center = terraceMap.map.getCenter();
  const minutes = Number(timeInput.value);
  const sun = getSunState(dateAtMinutes(dateInput.value, minutes), center.lat, center.lng);
  if (classifyTerraceStatus) {
    const request: ShadowWorkerRequest = {
      type: 'classify',
      id: shadowRequestId,
      generation: obstacleGeneration,
      terraces: terraces.map((terrace) => ({
        id: terrace.properties.id,
        coordinates: terrace.geometry.coordinates,
      })),
      altitude: sun.altitude,
      azimuth: sun.azimuth,
      daylight: sun.isDaylight,
      date: dateInput.value,
    };
    shadowWorker.postMessage(request);
  }
  terraceMap.setSunLight(sun.altitude, sun.azimuth, sun.isDaylight);
  terraceMap.setTreeDate(dateInput.value);

  solarTime.textContent = formatMinutes(minutes);
  solarDetail.textContent = sun.isDaylight
    ? `${Math.round(sun.altitude)}° hoog · ${Math.round(sun.azimuth)}° azimut`
    : 'De zon is onder de horizon';
  dayState.textContent = sun.isDaylight ? 'ZON BOVEN DE STAD' : 'NA ZONSONDERGANG';
  dayState.classList.toggle('night', !sun.isDaylight);
  sunrise.textContent = formatClock(sun.sunrise);
  sunset.textContent = formatClock(sun.sunset);
  timeInput.setAttribute('aria-valuetext', formatMinutes(minutes));
  timeInput.style.setProperty('--time-progress', `${minutes / Number(timeInput.max) * 100}%`);
  for (const [element, date, label] of [[sunriseEvent, sun.sunrise, 'Zonsopkomst'], [sunsetEvent, sun.sunset, 'Zonsondergang']] as const) {
    const position = timelineEventPosition(date, Number(timeInput.max));
    element.hidden = position === null;
    if (position === null) continue;
    element.style.left = `${position}%`;
    element.querySelector('span')!.textContent = formatClock(date);
    element.setAttribute('aria-label', `${label} om ${formatClock(date)}`);
    element.title = `${label} om ${formatClock(date)}`;
  }
  sunrise.closest('.sunrise-summary')!.setAttribute('aria-label', `Zonsopkomst ${formatClock(sun.sunrise)}`);
  sunset.closest('.sunset-summary')!.setAttribute('aria-label', `Zonsondergang ${formatClock(sun.sunset)}`);
}

function scheduleSolarRender(classifyTerraceStatus = false): void {
  // Any visible solar-state change invalidates a status response still in flight.
  shadowRequestId += 1;
  classifyOnNextFrame ||= classifyTerraceStatus;
  cancelAnimationFrame(updateFrame);
  updateFrame = requestAnimationFrame(() => {
    const shouldClassify = classifyOnNextFrame;
    classifyOnNextFrame = false;
    renderSolarState(shouldClassify);
  });
}

shadowWorker.onmessage = (event: MessageEvent<ShadowWorkerResponse>) => {
  const result = event.data;
  if (result.type === 'error') {
    const isCurrent = result.generation === obstacleGeneration
      && (result.operation === 'mesh' || result.id === shadowRequestId);
    if (isCurrent) showNotice('Schaduwen konden niet worden berekend.');
    return;
  }
  if (result.generation !== obstacleGeneration) return;
  if (result.type === 'mesh') {
    terraceMap.setShadowMesh(result.mesh);
    return;
  }
  if (result.id !== shadowRequestId) return;
  terraces = applyTerraceStatuses(terraces, result.statuses);
  terraceMap.setTerraces(terraces);
};

shadowWorker.onerror = () => showNotice('Schaduwen konden niet worden berekend.');

function updateObstacles(): void {
  obstacleGeneration += 1;
  const request: ShadowWorkerRequest = {
    type: 'set-obstacles', generation: obstacleGeneration, buildings,
    trees: treesEnabled ? trees : [],
  };
  shadowWorker.postMessage(request);
  scheduleSolarRender(true);
}

async function loadTrees(bounds: ViewBounds, zoom: number): Promise<void> {
  treeRequest?.abort();
  if (trees.length) {
    trees = [];
    terraceMap.setTrees([]);
    updateObstacles();
  }
  if (!treesEnabled || zoom < 14) {
    treeStatus.textContent = treesEnabled ? 'Zoom verder in om bomen te zien.' : 'Bomen uitgeschakeld.';
    return;
  }
  treeStatus.textContent = 'Bomen laden…';
  const request = new AbortController();
  treeRequest = request;
  try {
    const nextTrees = await fetchTrees(bounds, request.signal);
    if (request.signal.aborted || !treesEnabled) return;
    trees = nextTrees;
    terraceMap.setTrees(trees);
    updateObstacles();
    treeStatus.textContent = trees.length
      ? `${trees.length} bomen${trees.length === 1_000 ? ' (maximum)' : ''} · boomvorm en bladstand zijn geschat.`
      : 'Geen ingetekende bomen in dit kaartbeeld.';
  } catch (error) {
    if (request.signal.aborted) return;
    treeStatus.textContent = 'Bomen konden niet laden. Verplaats de kaart om opnieuw te proberen.';
    console.error('Bomen laden mislukt', error);
  }
}

async function loadBuildingCategories(bounds: ViewBounds, zoom: number): Promise<void> {
  buildingTypeRequest?.abort();
  if (zoom < 14) {
    terraceMap.setBuildings(null);
    buildingStatus.textContent = 'Zoom in voor gebouwkleuren per type.';
    retryBuildings.hidden = true;
    return;
  }
  buildingStatus.textContent = 'Gebouwtypes laden…';
  retryBuildings.hidden = true;
  const request = new AbortController();
  buildingTypeRequest = request;
  const apply = (data: BuildingData, loading: boolean) => {
    if (request.signal.aborted) return;
    if (data.buildings.length) terraceMap.setBuildings(data.buildings);
    const typed = data.buildings.filter((building) => !['yes', 'unknown', 'undefined', 'unclassified', 'unidentified', 'other', 'true', 'maybe', 'fixme', 'Y'].includes(building.properties.buildingType)).length;
    const detail = `${data.buildings.length} gebouwen · ${typed} met een specifiek type`;
    buildingStatus.textContent = loading
      ? `${detail} · laden ${data.loadedAreas}/${data.totalAreas} gebieden…`
      : `${detail}${data.failedAreas ? ' · deels geladen; overige gebouwen zijn neutraal.' : data.capped ? ' · zoom verder in voor de overige gebieden.' : ' · geladen.'}`;
    retryBuildings.hidden = loading || data.failedAreas === 0;
  };
  try {
    const result = await fetchBuildings(bounds, request.signal, (data) => apply(data, true));
    if (request.signal.aborted) return;
    apply(result, false);
  } catch (error) {
    if (request.signal.aborted) return;
    buildingStatus.textContent = 'Nieuwe gebouwtypes konden niet laden. Bestaande kleuren blijven behouden.';
    retryBuildings.hidden = false;
    console.error('Gebouwtypes laden mislukt', error);
  }
}

async function loadTerraces(bounds: ViewBounds, zoom: number): Promise<void> {
  terraceRequest?.abort();
  if (zoom < 13) {
    terraces = [];
    terraceMap.setTerraces([]);
    showNotice('Zoom verder in om terrassen en schaduwen te zien.');
    setLoadingStep(loadTerracesStep, 'done');
    return;
  }

  setLoadingStep(loadTerracesStep, 'active');
  terraceRequest = new AbortController();
  try {
    terraces = await fetchTerraces(bounds, terraceRequest.signal);
    terraceMap.setTerraces(terraces);
    scheduleSolarRender(true);
    setLoadingStep(loadTerracesStep, 'done');
    if (terraces.length === 0) showNotice('Geen terrassen met OSM-terraslabel in dit kaartbeeld.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    setLoadingStep(loadTerracesStep, 'done');
    showNotice('Terrassen konden niet worden geladen. Probeer het later opnieuw.');
    finishLoading(true);
  }
}

const terraceMap = createTerraceMap(requiredElement<HTMLElement>('#map'), {
  onBuildings(nextBuildings, capped) {
    buildings = nextBuildings;
    updateObstacles();
    setLoadingStep(loadBuildings, 'done');
    if (capped) showNotice('Veel gebouwen zichtbaar. Zoom verder in voor preciezere schaduwen.');
  },
  onViewChange(bounds, zoom) {
    scheduleSolarRender();
    void loadTerraces(bounds, zoom);
    void loadTrees(bounds, zoom);
    void loadBuildingCategories(bounds, zoom);
  },
  onMapReady() {
    setLoadingStep(loadMap, 'done');
    setLoadingStep(loadBuildings, 'active');
    finishLoading();
  },
  onError(message) {
    console.error(message);
    if (message.startsWith('GPU-bomen')) {
      showNotice('3D-bomen konden niet starten. De boomsymbolen blijven zichtbaar.');
      return;
    }
    if (message.startsWith('GPU-schaduwen')) {
      showNotice('Schaduwen konden niet starten. De kaart blijft beschikbaar.');
      return;
    }
    showNotice('Een deel van de kaarttegels kon niet laden. Probeer opnieuw te bewegen of in te zoomen.');
  },
});

retryBuildings.addEventListener('click', () => {
  const bounds = terraceMap.map.getBounds();
  void loadBuildingCategories({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }, terraceMap.map.getZoom());
});

window.addEventListener('storage', (event) => {
  if (event.key === PALETTE_STORAGE_KEY || event.key === null) terraceMap.refreshBuildingPalette();
});
window.addEventListener('terraszon:palette-change', () => terraceMap.refreshBuildingPalette());
window.addEventListener('pageshow', () => terraceMap.refreshBuildingPalette());

function closeSearch(): void {
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
  activeSearchIndex = -1;
}

function setSearchMessage(message: string): void {
  searchResults.replaceChildren();
  const row = document.createElement('div');
  row.className = 'search-message';
  row.textContent = message;
  searchResults.append(row);
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

function setActiveSearchIndex(index: number): void {
  activeSearchIndex = index;
  for (const [position, option] of searchResults.querySelectorAll<HTMLElement>('[role="option"]').entries()) {
    option.setAttribute('aria-selected', String(position === index));
  }
  if (index < 0) searchInput.removeAttribute('aria-activedescendant');
  else searchInput.setAttribute('aria-activedescendant', `search-result-${index}`);
}

function selectSearchResult(result: SearchResult): void {
  initialLocationAllowed = false;
  searchInput.value = [result.label, result.detail].filter(Boolean).join(', ');
  searchVersion += 1;
  searchRequest?.abort();
  window.clearTimeout(searchTimer);
  searchMatches = [];
  closeSearch();
  searchInput.blur();
  terraceMap.map.flyTo({ center: result.coordinates, zoom: result.kind === 'place' ? 14 : 16, offset: mapTargetOffset(), essential: true });
}

function renderSearchResults(): void {
  searchResults.replaceChildren();
  if (!searchMatches.length) {
    setSearchMessage('Geen locaties gevonden. Probeer een andere zoekterm.');
    return;
  }
  searchMatches.forEach((result, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.id = `search-result-${index}`;
    option.className = 'search-option';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    const label = document.createElement('strong');
    label.textContent = result.label;
    const detail = document.createElement('span');
    detail.textContent = result.detail || 'Locatie';
    option.append(label, detail);
    option.addEventListener('click', () => selectSearchResult(result));
    searchResults.append(option);
  });
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  if (query) initialLocationAllowed = false;
  searchVersion += 1;
  const version = searchVersion;
  window.clearTimeout(searchTimer);
  searchRequest?.abort();
  searchMatches = [];
  closeSearch();
  if (query.length < 3) return;
  searchTimer = window.setTimeout(async () => {
    const controller = new AbortController();
    searchRequest = controller;
    setSearchMessage('Locaties zoeken…');
    try {
      const matches = await searchPlaces(query, controller.signal);
      if (version !== searchVersion) return;
      searchMatches = matches;
      renderSearchResults();
    } catch {
      if (version === searchVersion) setSearchMessage('Zoeken lukt nu niet. Probeer het later opnieuw.');
    }
  }, 400);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchVersion += 1;
    searchRequest?.abort();
    window.clearTimeout(searchTimer);
    searchMatches = [];
    closeSearch();
    return;
  }
  if (!searchMatches.length || searchResults.hidden) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setActiveSearchIndex(activeSearchIndex < 0 && direction < 0
      ? searchMatches.length - 1
      : (activeSearchIndex + direction) % searchMatches.length);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    selectSearchResult(searchMatches[activeSearchIndex < 0 ? 0 : activeSearchIndex]);
  }
});

searchInput.addEventListener('focus', () => {
  if (searchMatches.length) renderSearchResults();
});
document.addEventListener('pointerdown', (event) => {
  if (!searchBox.contains(event.target as Node)) {
    searchVersion += 1;
    searchRequest?.abort();
    window.clearTimeout(searchTimer);
    searchMatches = [];
    closeSearch();
  }
});

const locationTracker = navigator.geolocation && window.isSecureContext ? createLocationTracker(navigator.geolocation, {
  onPosition(position) {
    terraceMap.setUserLocation([position.coords.longitude, position.coords.latitude]);
  },
  onCenter(position, initial) {
    if ((initial && !initialLocationAllowed) || document.visibilityState === 'hidden') return;
    terraceMap.map.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15.5,
      offset: mapTargetOffset(), essential: true });
  },
  onBusy(busy) {
    locationButton.disabled = busy;
    locationButton.classList.toggle('locating', busy);
    locationButton.setAttribute('aria-label', busy ? 'Locatie bepalen…' : 'Ga naar mijn locatie');
  },
  onError(error, initial) {
    if (error.code === 1) terraceMap.setUserLocation(null);
    if (initial && !initialLocationAllowed) return;
    showNotice(error.code === 1
      ? 'Locatietoegang geweigerd. Zoek een plaats of probeer de locatieknop opnieuw.'
      : initial ? 'Locatie niet gevonden. De kaart opent in Groningen.'
        : 'Locatie niet gevonden. Probeer het opnieuw.');
  },
}) : null;

function locateUser(initial = false): void {
  if (!locationTracker) {
    if (!initial) showNotice('Locatie is alleen beschikbaar via HTTPS of localhost.');
    else showNotice('Locatie niet beschikbaar. De kaart opent in Groningen.');
    return;
  }

  locationTracker.locate(initial);
}

window.addEventListener('pagehide', () => locationTracker?.stop());
window.addEventListener('pageshow', (event) => { if (event.persisted) locationTracker?.resume(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') locationTracker?.pause();
  else locationTracker?.resume();
});

terraceMap.map.on('movestart', (event) => {
  if (event.originalEvent) initialLocationAllowed = false;
});
locationButton.addEventListener('click', () => locateUser());
locateUser(true);

dateInput.addEventListener('change', () => {
  scheduleSolarRender(true);
});
timeInput.addEventListener('input', () => scheduleSolarRender(true));
timeInput.addEventListener('change', () => scheduleSolarRender(true));

for (const layer of ['buildings', 'shadows', 'terraces'] as const) {
  requiredElement<HTMLInputElement>(`#${layer}`).addEventListener('change', (event) => {
    terraceMap.setVisibility(layer, (event.currentTarget as HTMLInputElement).checked);
  });
}

requiredElement<HTMLInputElement>('#trees').addEventListener('change', (event) => {
  treesEnabled = (event.currentTarget as HTMLInputElement).checked;
  terraceMap.setVisibility('trees', treesEnabled);
  const bounds = terraceMap.map.getBounds();
  void loadTrees({
    south: bounds.getSouth(), west: bounds.getWest(),
    north: bounds.getNorth(), east: bounds.getEast(),
  }, terraceMap.map.getZoom());
});

requiredElement<HTMLInputElement>('#sun-only').addEventListener('change', (event) => {
  terraceMap.setOnlySunny((event.currentTarget as HTMLInputElement).checked);
});
