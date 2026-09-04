import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type {
  ErrorEvent,
  GeoJSONFeature,
  GeoJSONSource,
  MapMouseEvent,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { BuildingFeature, TerraceFeature } from './types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const BUILDING_SOURCE = 'openmaptiles';
const BUILDING_LAYER = 'building-3d';
const SHADOW_SOURCE = 'terraszon-shadows';
const SHADOW_LAYER = 'terraszon-shadows';
const TERRACE_SOURCE = 'terraszon-terraces';
const TERRACE_LAYER = 'terraszon-terraces';
const DEFAULT_POI_LAYERS = [
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
];
// GeoJSON union and transfer become noticeable above this range on mid-tier phones.
const MAX_BUILDINGS = 1_500;

const emptyShadows: FeatureCollection<MultiPolygon> = {
  type: 'FeatureCollection',
  features: [],
};

const emptyTerraces: FeatureCollection<TerraceFeature['geometry'], TerraceFeature['properties']> = {
  type: 'FeatureCollection',
  features: [],
};

export type ViewBounds = { south: number; west: number; north: number; east: number };

type MapCallbacks = {
  onBuildings: (buildings: BuildingFeature[], capped: boolean) => void;
  onViewChange: (bounds: ViewBounds, zoom: number) => void;
  onError: (message: string) => void;
  onMapReady?: () => void;
};

export type TerraceMap = {
  map: MapLibreMap;
  setShadows: (shadows: FeatureCollection<MultiPolygon>) => void;
  setTerraces: (terraces: TerraceFeature[]) => void;
  setOnlySunny: (enabled: boolean) => void;
  setVisibility: (layer: 'buildings' | 'shadows' | 'terraces', visible: boolean) => void;
  setSunLight: (altitude: number, azimuth: number, daylight: boolean) => void;
};

function buildingHeight(properties: Record<string, unknown> | null): number {
  const rendered = Number(properties?.render_height);
  return Number.isFinite(rendered) && rendered > 0 ? rendered : 9;
}

function asBuilding(feature: GeoJSONFeature): BuildingFeature | null {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return null;
  const firstPosition = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]?.[0]
    : feature.geometry.coordinates[0]?.[0]?.[0];
  const id = String(feature.id ?? `${firstPosition?.[0]}:${firstPosition?.[1]}`);

  return {
    type: 'Feature',
    geometry: feature.geometry as Polygon | MultiPolygon,
    properties: { id, height: buildingHeight(feature.properties) },
  };
}

function getBounds(map: MapLibreMap): ViewBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

export function createTerraceMap(container: HTMLElement, callbacks: MapCallbacks): TerraceMap {
  // Vite must emit the module worker; otherwise MapLibre resolves it against the optimized bundle.
  maplibregl.setWorkerUrl(workerUrl);
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [6.5682, 53.2188],
    zoom: 15.5,
    pitch: 52,
    bearing: -18,
    maxPitch: 70,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  let buildingFingerprint = '';
  let ready = false;

  const extractBuildings = () => {
    if (!ready || map.getZoom() < 14) {
      callbacks.onBuildings([], false);
      return;
    }

    const seen = new Set<string>();
    const buildings: BuildingFeature[] = [];
    for (const feature of map.querySourceFeatures(BUILDING_SOURCE, { sourceLayer: 'building' })) {
      const building = asBuilding(feature);
      if (!building || seen.has(building.properties.id)) continue;
      seen.add(building.properties.id);
      buildings.push(building);
      if (buildings.length === MAX_BUILDINGS) break;
    }

    // Never publish an empty/partial tile snapshot: it would temporarily remove small buildings.
    if (buildings.length === 0) return;

    const fingerprint = `${map.getZoom().toFixed(2)}:${[...seen].join('|')}`;
    if (fingerprint === buildingFingerprint) return;
    buildingFingerprint = fingerprint;
    callbacks.onBuildings(buildings, buildings.length === MAX_BUILDINGS);
  };

  map.on('load', () => {
    ready = true;
    // The base style contains generic POIs. Terraszon renders its own filtered terrace layer.
    for (const layerId of DEFAULT_POI_LAYERS) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
    }
    map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-color', '#d8d3c8');
    map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-opacity', 0.92);

    map.addSource(SHADOW_SOURCE, { type: 'geojson', data: emptyShadows });
    map.addLayer({
      id: SHADOW_LAYER,
      type: 'fill',
      source: SHADOW_SOURCE,
      paint: {
        'fill-color': '#53606c',
        'fill-opacity': 0.32,
        // One merged geometry avoids darker overlap zones; disabling edge AA removes hairline seams.
        'fill-antialias': false,
      },
    }, BUILDING_LAYER);

    map.addSource(TERRACE_SOURCE, { type: 'geojson', data: emptyTerraces });
    map.addLayer({
      id: TERRACE_LAYER,
      type: 'circle',
      source: TERRACE_SOURCE,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 8],
        'circle-color': [
          'match', ['get', 'status'],
          'sun', '#f2a900',
          'shade', '#536b7c',
          '#7f817d',
        ],
        'circle-stroke-color': '#fffdf7',
        'circle-stroke-width': 2,
        'circle-opacity': 0.96,
      },
    });

    map.on('mouseenter', TERRACE_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', TERRACE_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', TERRACE_LAYER, (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [TERRACE_LAYER] })[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const status = feature.properties.status === 'sun'
        ? 'In de zon'
        : feature.properties.status === 'shade' ? 'In de schaduw' : 'Geen daglicht';
      const popup = document.createElement('div');
      popup.className = 'terrace-popup';
      const title = document.createElement('strong');
      title.textContent = String(feature.properties.name);
      const detail = document.createElement('span');
      detail.textContent = `${status} · indicatieve locatie`;
      popup.append(title, detail);
      new maplibregl.Popup({ offset: 12, closeButton: false })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(popup)
        .addTo(map);
    });

    callbacks.onMapReady?.();
    callbacks.onViewChange(getBounds(map), map.getZoom());
  });

  // `idle` is the first point at which all visible vector tiles have settled.
  map.on('idle', extractBuildings);
  map.on('moveend', () => {
    // Keep the previous complete snapshot while the new tiles are loading.
    buildingFingerprint = '';
    callbacks.onViewChange(getBounds(map), map.getZoom());
  });
  map.on('error', (event: ErrorEvent) => callbacks.onError(event.error?.message ?? 'Kaartdata kon niet laden.'));

  return {
    map,
    setShadows(shadows) {
      if (!ready) return;
      (map.getSource(SHADOW_SOURCE) as GeoJSONSource).setData(shadows);
    },
    setTerraces(terraces) {
      if (!ready) return;
      (map.getSource(TERRACE_SOURCE) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: terraces,
      });
    },
    setOnlySunny(enabled) {
      if (!ready) return;
      map.setFilter(TERRACE_LAYER, enabled ? ['==', ['get', 'status'], 'sun'] : null);
    },
    setVisibility(layer, visible) {
      if (!ready) return;
      const layerId = layer === 'buildings' ? BUILDING_LAYER
        : layer === 'shadows' ? SHADOW_LAYER : TERRACE_LAYER;
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    },
    setSunLight(altitude, azimuth, daylight) {
      if (!ready) return;
      map.setLight({
        anchor: 'map',
        color: daylight ? '#fff4d5' : '#b8c2cf',
        intensity: daylight ? 0.48 : 0.2,
        position: [1.5, azimuth, Math.max(5, 90 - altitude)],
      });
    },
  };
}
