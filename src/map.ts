import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import type {
  ErrorEvent,
  GeoJSONFeature,
  GeoJSONSource,
  MapMouseEvent,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { BuildingShadowLayer } from './shadow-layer';
import type { BuildingFeature, ShadowMesh, TerraceFeature } from './types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const BUILDING_LAYER = 'building-3d';
const SHADOW_LAYER = 'terraszon-shadows';
const TERRACE_SOURCE = 'terraszon-terraces';
const TERRACE_LAYER = 'terraszon-terraces';
const DEFAULT_POI_LAYERS = [
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
];
// Bound worker memory and one-time GPU uploads on dense, mid-tier mobile devices.
const MAX_BUILDINGS = 1_500;

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
  setShadowMesh: (mesh: ShadowMesh) => void;
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

function geometryFingerprint(geometry: Polygon | MultiPolygon): string {
  let hash = 2_166_136_261;
  let pointCount = 0;
  const append = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16_777_619);
  };
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    append(polygon.length);
    for (const ring of polygon) {
      append(ring.length);
      for (const point of ring) {
        append(Math.round(point[0] * 10_000_000));
        append(Math.round(point[1] * 10_000_000));
        pointCount += 1;
      }
    }
  }
  return `${pointCount}:${hash >>> 0}`;
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
    canvasContextAttributes: {
      powerPreference: 'default',
    },
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  let buildingFingerprint = '';
  let ready = false;
  let shadowLayer: BuildingShadowLayer | null = null;
  let shadowMesh: ShadowMesh = { origin: [0, 0], vertices: new Float32Array() };
  let terraceData: TerraceFeature[] = [];
  let onlySunny = false;
  let sunState = { altitude: 0, azimuth: 0, daylight: false };
  const visibility = { buildings: true, shadows: true, terraces: true };

  const installShadowLayer = () => {
    if (!map.getLayer(BUILDING_LAYER) || map.getLayer(SHADOW_LAYER)) return;
    shadowLayer = new BuildingShadowLayer((message) => {
      callbacks.onError(`GPU-schaduwen konden niet starten: ${message}`);
    });
    shadowLayer.setMesh(shadowMesh);
    shadowLayer.setSun(sunState.altitude, sunState.azimuth, sunState.daylight);
    map.addLayer(shadowLayer, BUILDING_LAYER);
    map.setLayoutProperty(SHADOW_LAYER, 'visibility', visibility.shadows ? 'visible' : 'none');
  };

  const extractBuildings = () => {
    if (!ready) return;
    if (map.getZoom() < 14) {
      if (buildingFingerprint === 'below-14') return;
      buildingFingerprint = 'below-14';
      callbacks.onBuildings([], false);
      return;
    }

    const seen = new Set<string>();
    const buildings: BuildingFeature[] = [];
    // Query the rendered layer so the snapshot matches the buildings that are
    // actually available after MapLibre's tile and style processing.
    for (const feature of map.queryRenderedFeatures({ layers: [BUILDING_LAYER] })) {
      const building = asBuilding(feature);
      if (!building) continue;
      const fragmentKey = [
        building.properties.id,
        building.properties.height,
        geometryFingerprint(building.geometry),
      ].join(':');
      if (seen.has(fragmentKey)) continue;
      seen.add(fragmentKey);
      buildings.push(building);
      if (buildings.length === MAX_BUILDINGS) break;
    }

    if (buildings.length === 0) {
      const fingerprint = `empty:${map.getZoom().toFixed(2)}`;
      if (fingerprint === buildingFingerprint) return;
      buildingFingerprint = fingerprint;
      callbacks.onBuildings([], false);
      return;
    }

    const fingerprint = `${map.getZoom().toFixed(2)}:${[...seen].sort().join('|')}`;
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

    installShadowLayer();

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
  map.on('webglcontextlost', () => {
    ready = false;
    shadowLayer = null;
  });
  map.on('webglcontextrestored', () => {
    map.once('style.load', () => {
      ready = true;
      map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-color', '#d8d3c8');
      installShadowLayer();
      map.setPaintProperty(
        BUILDING_LAYER,
        'fill-extrusion-opacity',
        visibility.buildings ? 0.92 : 0,
      );
      const terraceSource = map.getSource(TERRACE_SOURCE) as GeoJSONSource | undefined;
      terraceSource?.setData({ type: 'FeatureCollection', features: terraceData });
      if (map.getLayer(TERRACE_LAYER)) {
        map.setFilter(TERRACE_LAYER, onlySunny ? ['==', ['get', 'status'], 'sun'] : null);
        map.setLayoutProperty(
          TERRACE_LAYER,
          'visibility',
          visibility.terraces ? 'visible' : 'none',
        );
      }
      map.setLight({
        anchor: 'map',
        color: sunState.daylight ? '#fff4d5' : '#b8c2cf',
        intensity: sunState.daylight ? 0.48 : 0.2,
        position: [1.5, sunState.azimuth, Math.max(5, 90 - sunState.altitude)],
      });
    });
  });
  map.on('error', (event: ErrorEvent) => callbacks.onError(event.error?.message ?? 'Kaartdata kon niet laden.'));

  return {
    map,
    setShadowMesh(mesh) {
      shadowMesh = mesh;
      shadowLayer?.setMesh(mesh);
    },
    setTerraces(terraces) {
      terraceData = terraces;
      if (!ready) return;
      const source = map.getSource(TERRACE_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: terraces,
      });
    },
    setOnlySunny(enabled) {
      onlySunny = enabled;
      if (!ready || !map.getLayer(TERRACE_LAYER)) return;
      map.setFilter(TERRACE_LAYER, enabled ? ['==', ['get', 'status'], 'sun'] : null);
    },
    setVisibility(layer, visible) {
      visibility[layer] = visible;
      if (!ready) return;
      if (layer === 'buildings') {
        // Keep the layer queryable while visually hidden; shadows use its rendered features.
        map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-opacity', visible ? 0.92 : 0);
        return;
      }
      const layerId = layer === 'shadows' ? SHADOW_LAYER : TERRACE_LAYER;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    },
    setSunLight(altitude, azimuth, daylight) {
      sunState = { altitude, azimuth, daylight };
      shadowLayer?.setSun(altitude, azimuth, daylight);
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
