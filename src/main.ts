import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { createTerraceMap, type ViewBounds } from './map';
import { buildShadows } from './shadows';
import { dateAtMinutes, formatClock, formatMinutes, getSunState } from './sun';
import { classifyTerraces, fetchTerraces } from './terraces';
import type { BuildingFeature, TerraceFeature } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App-element ontbreekt');

const now = new Date();
const localDate = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');
const currentMinutes = now.getHours() * 60 + Math.floor(now.getMinutes() / 5) * 5;

app.innerHTML = `
  <main class="shell">
    <div id="map" aria-label="Interactieve kaart van terrassen en gebouwschaduwen"></div>

    <section id="loading" class="loading-screen" aria-live="polite" aria-busy="true">
      <div class="loading-card">
        <div class="loading-logo"><span class="sun-mark"></span>Terraszon</div>
        <p>De stad en het zonlicht worden voorbereid...</p>
        <div class="loading-progress"><span></span></div>
        <ul class="loading-steps">
          <li id="load-map">Kaart laden</li>
          <li id="load-buildings">Gebouwen verzamelen</li>
          <li id="load-sun">Schaduwen berekenen</li>
          <li id="load-terraces">Terrassen ophalen</li>
        </ul>
      </div>
    </section>

    <header class="brand-card map-card">
      <div class="wordmark"><span class="sun-mark"></span>Terraszon</div>
      <p>Vind een tafel in het licht.</p>
    </header>

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
          <span><i class="rise-icon"></i><b id="sunrise">--:--</b></span>
          <span><i class="set-icon"></i><b id="sunset">--:--</b></span>
        </div>
      </div>

      <label class="slider-label" for="time">
        <span>00:00</span><span>Tijdstip</span><span>23:55</span>
      </label>
      <input id="time" class="time-slider" type="range" min="0" max="1435" step="5" value="${currentMinutes}" />

      <div class="panel-footer">
        <div class="toggles" aria-label="Kaartlagen">
          <label><input id="buildings" type="checkbox" checked /><span>3D</span></label>
          <label><input id="shadows" type="checkbox" checked /><span>Schaduw</span></label>
          <label><input id="terraces" type="checkbox" checked /><span>Terrassen</span></label>
          <label class="sun-only"><input id="sun-only" type="checkbox" /><span>Alleen zon</span></label>
        </div>
        <div class="legend"><span class="dot sun"></span>Zon <span class="dot shade"></span>Schaduw</div>
      </div>
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
const loadSun = requiredElement<HTMLElement>('#load-sun');
const loadTerracesStep = requiredElement<HTMLElement>('#load-terraces');

let buildings: BuildingFeature[] = [];
let terraces: TerraceFeature[] = [];
let latestShadows: FeatureCollection<MultiPolygon> = { type: 'FeatureCollection', features: [] };
let updateFrame = 0;
let terraceRequest: AbortController | null = null;
let noticeTimer = 0;
let loadingFinished = false;
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

function renderSolarState(): void {
  const center = terraceMap.map.getCenter();
  const minutes = Number(timeInput.value);
  const sun = getSunState(dateAtMinutes(dateInput.value, minutes), center.lat, center.lng);

  latestShadows = buildShadows(buildings, sun.altitude, sun.azimuth);
  terraces = classifyTerraces(terraces, latestShadows, sun.isDaylight);
  terraceMap.setShadows(latestShadows);
  terraceMap.setTerraces(terraces);
  terraceMap.setSunLight(sun.altitude, sun.azimuth, sun.isDaylight);

  solarTime.textContent = formatMinutes(minutes);
  solarDetail.textContent = sun.isDaylight
    ? `${Math.round(sun.altitude)}° hoog · ${Math.round(sun.azimuth)}° azimut`
    : 'De zon is onder de horizon';
  dayState.textContent = sun.isDaylight ? 'ZON BOVEN DE STAD' : 'NA ZONSONDERGANG';
  dayState.classList.toggle('night', !sun.isDaylight);
  sunrise.textContent = formatClock(sun.sunrise);
  sunset.textContent = formatClock(sun.sunset);
  setLoadingStep(loadSun, 'done');
  if (!loadingFinished
    && loadBuildings.classList.contains('done')
    && loadTerracesStep.classList.contains('done')) finishLoading();
}

function scheduleSolarRender(): void {
  cancelAnimationFrame(updateFrame);
  updateFrame = requestAnimationFrame(renderSolarState);
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
    setLoadingStep(loadTerracesStep, 'done');
    scheduleSolarRender();
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
    setLoadingStep(loadBuildings, 'done');
    setLoadingStep(loadSun, 'active');
    scheduleSolarRender();
    if (capped) showNotice('Veel gebouwen zichtbaar. Zoom verder in voor preciezere schaduwen.');
  },
  onViewChange(bounds, zoom) {
    scheduleSolarRender();
    void loadTerraces(bounds, zoom);
  },
  onMapReady() {
    setLoadingStep(loadMap, 'done');
    setLoadingStep(loadBuildings, 'active');
  },
  onError(message) {
    console.error(message);
    showNotice('Een deel van de kaartdata kon niet laden.');
  },
});

dateInput.addEventListener('change', scheduleSolarRender);
timeInput.addEventListener('input', scheduleSolarRender);

for (const layer of ['buildings', 'shadows', 'terraces'] as const) {
  requiredElement<HTMLInputElement>(`#${layer}`).addEventListener('change', (event) => {
    terraceMap.setVisibility(layer, (event.currentTarget as HTMLInputElement).checked);
  });
}

requiredElement<HTMLInputElement>('#sun-only').addEventListener('change', (event) => {
  terraceMap.setOnlySunny((event.currentTarget as HTMLInputElement).checked);
});
