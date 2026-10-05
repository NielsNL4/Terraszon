import maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import type {
  ErrorEvent,
  ExpressionSpecification,
  GeoJSONFeature,
  GeoJSONSource,
  MapMouseEvent,
  Marker,
  Map as MapLibreMap,
} from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { BuildingShadowLayer } from './shadow-layer';
import { createBuildingClient } from './building-client';
import type { BuildingSummary } from './building-protocol';
import type { BuildingTile } from './building-geometry';
import { abortable } from './requests';
import { loadPalette, UNKNOWN_BUILDING_COLOR } from './building-palette';
import { treeMarkers } from './trees';
import { InstancedTreeLayer } from './tree-layer';
import type { BuildingFeature, CategorizedBuilding, ShadowMesh, TerraceFeature, TreeFeature } from './types';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const BUILDING_LAYER = 'building-3d';
const COLORED_BUILDING_SOURCE = 'terraszon-buildings';
const COLORED_BUILDING_LAYER = 'terraszon-building-3d';
const SHADOW_LAYER = 'terraszon-shadows';
const TERRACE_SOURCE = 'terraszon-terraces';
const TERRACE_LAYER = 'terraszon-terraces';
const TREE_SOURCE = 'terraszon-trees';
const TREE_MARKER_SOURCE = 'terraszon-tree-points';
const TREE_LAYER = 'terraszon-trees';
const TREE_MARKERS = 'terraszon-tree-markers';
const SUNNY_FILTER: ExpressionSpecification = ['in', ['get', 'status'], ['literal', ['sun', 'filtered']]];
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
const emptyTrees: FeatureCollection<TreeFeature['geometry'], TreeFeature['properties']> = {
  type: 'FeatureCollection', features: [],
};

export type ViewBounds = { south: number; west: number; north: number; east: number };

type MapCallbacks = {
  onBuildings: (buildings: BuildingFeature[], capped: boolean) => void;
  onViewChange: (bounds: ViewBounds, zoom: number) => void;
  onError: (message: string) => void;
  onMapReady?: () => void;
  onBuildingError?: (message: string) => void;
};

export type TerraceMap = {
  map: MapLibreMap;
  setShadowMesh: (mesh: ShadowMesh) => void;
  setTerraces: (terraces: TerraceFeature[]) => void;
  setTrees: (trees: TreeFeature[]) => void;
  setTreeDate: (date: string) => void;
  setUserLocation: (coordinates: [number, number] | null) => void;
  setBuildings: (buildings: CategorizedBuilding[] | null) => void;
  loadBuildings: (bounds: ViewBounds, mobile: boolean, signal: AbortSignal, progress: (data: BuildingSummary) => void) => Promise<BuildingSummary>;
  refreshBuildingPalette: () => void;
  setOnlySunny: (enabled: boolean) => void;
  setVisibility: (layer: 'buildings' | 'shadows' | 'terraces' | 'trees', visible: boolean) => void;
  setSunLight: (altitude: number, azimuth: number, daylight: boolean) => void;
};

function buildingHeight(properties: Record<string, unknown> | null): number {
  const rendered = Number(properties?.height ?? properties?.render_height);
  return Number.isFinite(rendered) && rendered > 0 ? rendered : 9;
}

function asBuilding(feature: GeoJSONFeature): BuildingFeature | null {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return null;
  const firstPosition = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]?.[0]
    : feature.geometry.coordinates[0]?.[0]?.[0];
  const id = String(feature.properties?.id ?? feature.id ?? `${firstPosition?.[0]}:${firstPosition?.[1]}`);

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
  let shadowBuildingsDirty = true;
  let ready = false;
  let shadowLayer: BuildingShadowLayer | null = null;
  let shadowMesh: ShadowMesh = { origin: [0, 0], vertices: new Float32Array() };
  let terraceData: TerraceFeature[] = [];
  let treeData: TreeFeature[] = [];
  let treeLayer: InstancedTreeLayer | null = null;
  let treeDate = '';
  let userLocationMarker: Marker | null = null;
  let knownBuildings = false;
  let buildingSourceActive = false;
  let geometryDirty = false;
  let tilesDirty = true;
  let geometryBusy = false;
  let geometryEpoch = 0;
  let buildingRevision = -1;
  let buildingRenderFailed = false;
  const buildingClient = createBuildingClient((data) => {
    if (!data.totalBuildings) return;
    if (!knownBuildings || buildingRevision !== data.revision) {
      knownBuildings = true;
      buildingRevision = data.revision;
      geometryDirty = true;
      map.triggerRepaint();
    }
  });
  map.on('remove', () => buildingClient.destroy());
  let onlySunny = false;
  let sunState = { altitude: 0, azimuth: 0, daylight: false };
  const visibility = { buildings: true, shadows: true, terraces: true, trees: true };
  let palette = loadPalette();

  const colorBuildings = () => {
    if (!ready || !map.getLayer(COLORED_BUILDING_LAYER)) return;
    const color: ExpressionSpecification = ['coalesce',
      ['get', ['get', 'buildingType'], ['literal', palette.colors]], palette.colors.yes];
    map.setPaintProperty(COLORED_BUILDING_LAYER, 'fill-extrusion-color', color);
  };

  const updateBuildingVisibility = () => {
    if (!ready) return;
    // Keep the tile layer queryable for fallback heights and shadow extraction.
    map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-opacity',
      visibility.buildings && !buildingSourceActive ? 0.92 : 0);
    if (map.getLayer(COLORED_BUILDING_LAYER)) {
      map.setLayoutProperty(COLORED_BUILDING_LAYER, 'visibility', buildingSourceActive ? 'visible' : 'none');
      map.setPaintProperty(COLORED_BUILDING_LAYER, 'fill-extrusion-opacity', visibility.buildings ? 0.92 : 0);
    }
  };

  const refreshBuildingGeometry = () => {
    if (!ready || !knownBuildings || !geometryDirty || geometryBusy || map.isMoving() || map.getZoom() < 14) return;
    let tiles: BuildingTile[] | undefined;
    if (tilesDirty) tiles = map.queryRenderedFeatures({ layers: [BUILDING_LAYER] })
      .filter((feature) => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
      .map((feature) => ({ geometry: feature.geometry as Polygon | MultiPolygon, properties: feature.properties }));
    geometryDirty = false; tilesDirty = false; geometryBusy = true;
    const epoch = geometryEpoch;
    void buildingClient.geometry(getBounds(map), tiles).then(async result => {
      if (!ready || epoch !== geometryEpoch) return;
      const source = map.getSource(COLORED_BUILDING_SOURCE) as GeoJSONSource | undefined;
      if (result.changed && source) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new DOMException('De gebouwweergave reageerde niet op tijd', 'TimeoutError')), 15_000);
        try { await abortable(source.updateData(result.diff, true), controller.signal); }
        finally { clearTimeout(timer); }
      }
      if (!ready || epoch !== geometryEpoch) return;
      buildingSourceActive = result.count > 0;
      if (result.changed) shadowBuildingsDirty = true;
      buildingRenderFailed = false;
      updateBuildingVisibility();
    }).catch(error => {
      if (epoch === geometryEpoch && ready) {
        buildingRenderFailed = true;
        callbacks.onBuildingError?.(error instanceof Error ? error.message : 'Gebouwweergave kon niet worden verwerkt');
      }
    }).finally(() => {
      if (epoch !== geometryEpoch) return;
      geometryBusy = false;
      if (geometryDirty) refreshBuildingGeometry();
      map.triggerRepaint();
    });
  };

  const styleLandscape = () => {
    if (!ready) return;
    if (map.getLayer('landcover_grass')) {
      map.setPaintProperty('landcover_grass', 'fill-color', '#8cb976');
      map.setPaintProperty('landcover_grass', 'fill-opacity', 0.7);
    }
    if (map.getLayer('park')) map.setPaintProperty('park', 'fill-color', '#b7d49e');
    if (map.getLayer('park_outline')) map.setPaintProperty('park_outline', 'line-color', '#93b887');
    if (map.getLayer('landcover_wood')) {
      map.setPaintProperty('landcover_wood', 'fill-color', '#76a77a');
      map.setPaintProperty('landcover_wood', 'fill-opacity', 0.65);
    }
    if (map.getLayer('building')) map.setPaintProperty('building', 'fill-color', palette.colors.yes ?? UNKNOWN_BUILDING_COLOR);
    map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-color', palette.colors.yes ?? UNKNOWN_BUILDING_COLOR);
    colorBuildings();
    for (const layer of ['road_path_pedestrian', 'bridge_path_pedestrian', 'tunnel_path_pedestrian']) {
      if (map.getLayer(layer)) {
        map.setPaintProperty(layer, 'line-color', [
          'case', ['==', ['get', 'subclass'], 'cycleway'], '#b95349', '#ffffff',
        ]);
      }
    }
  };

  const installShadowLayer = () => {
    if (!map.getLayer(BUILDING_LAYER) || map.getLayer(SHADOW_LAYER)) return;
    shadowLayer = new BuildingShadowLayer((message) => {
      callbacks.onError(`GPU-schaduwen konden niet starten: ${message}`);
    }, (gl, options) => treeLayer?.renderShadows(gl, options) ?? false);
    shadowLayer.setMesh(shadowMesh);
    shadowLayer.setSun(sunState.altitude, sunState.azimuth, sunState.daylight);
    map.addLayer(shadowLayer, BUILDING_LAYER);
    map.setLayoutProperty(SHADOW_LAYER, 'visibility', visibility.shadows ? 'visible' : 'none');
  };

  const installTreeLayer = () => {
    if (map.getLayer('terraszon-trees-3d')) return;
    treeLayer = new InstancedTreeLayer((message) => {
      if (map.getLayer(TREE_MARKERS)) map.setLayerZoomRange(TREE_MARKERS, 14, 24);
      callbacks.onError(`GPU-bomen: ${message}`);
    });
    treeLayer.setTrees(treeData);
    treeLayer.setDate(treeDate);
    treeLayer.setVisible(visibility.trees);
    treeLayer.setSun(sunState.altitude, sunState.azimuth, sunState.daylight);
    map.addLayer(treeLayer, COLORED_BUILDING_LAYER);
  };

  const extractBuildings = () => {
    if (!ready || !shadowBuildingsDirty) return;
    shadowBuildingsDirty = false;
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
    const layer = buildingSourceActive ? COLORED_BUILDING_LAYER : BUILDING_LAYER;
    for (const feature of map.queryRenderedFeatures({ layers: [layer] })) {
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
    styleLandscape();
    map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-opacity', 0.92);

    installShadowLayer();
    map.addSource(COLORED_BUILDING_SOURCE, { type: 'geojson', promoteId: 'id', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: COLORED_BUILDING_LAYER,
      type: 'fill-extrusion', source: COLORED_BUILDING_SOURCE, minzoom: 14,
      paint: {
        'fill-extrusion-base': ['get', 'minHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-opacity': 0.92,
      },
    }, BUILDING_LAYER);
    colorBuildings();
    updateBuildingVisibility();

    map.addSource(TREE_SOURCE, {
      type: 'geojson', data: emptyTrees,
      attribution: 'Boomgegevens Groningen: <a href="https://data.groningen.nl/dataset/bomen/04da3775-07f0-4388-bc12-7cd7536b04cd" target="_blank" rel="noopener noreferrer">Gemeente Groningen (CC BY 4.0)</a>',
    });
    map.addSource(TREE_MARKER_SOURCE, { type: 'geojson', data: treeMarkers([]) });
    map.addLayer({
      id: TREE_LAYER,
      type: 'fill',
      source: TREE_SOURCE,
      minzoom: 14,
      maxzoom: 15,
      paint: { 'fill-color': '#2d6945', 'fill-opacity': 0.22, 'fill-outline-color': '#235137' },
    }, map.getLayer(SHADOW_LAYER) ? SHADOW_LAYER : BUILDING_LAYER);
    map.addLayer({
      id: TREE_MARKERS,
      type: 'circle',
      source: TREE_MARKER_SOURCE,
      minzoom: 14,
      maxzoom: 15,
      // The drawn marker has a minimum size; the polygon retains the actual
      // estimated crown size for the shadow mesh.
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 16, 5, 18, 7],
        'circle-color': '#255d3a',
        'circle-stroke-color': '#e8efdf',
        'circle-stroke-width': 1,
        'circle-opacity': 0.96,
      },
    }, BUILDING_LAYER);

    installTreeLayer();

    map.addSource(TERRACE_SOURCE, { type: 'geojson', data: emptyTerraces });
    map.addLayer({
      id: TERRACE_LAYER,
      type: 'circle',
      source: TERRACE_SOURCE,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          13, ['case', ['==', ['get', 'evidence'], 'possible'], 2, 4],
          17, ['case', ['==', ['get', 'evidence'], 'possible'], 3, 8],
        ],
        'circle-color': [
          'case', ['==', ['get', 'evidence'], 'possible'], '#fffdf7',
          ['match', ['get', 'status'],
            'sun', '#f2a900',
            'shade', '#536b7c',
            'filtered', '#79a885',
            '#7f817d'],
        ],
        'circle-stroke-color': [
          'case', ['==', ['get', 'status'], 'filtered'], '#4c7756',
          ['match', ['get', 'evidence'],
            'confirmed', '#fffdf7',
            'mapped', '#fffdf7',
            '#536b7c'],
        ],
        'circle-stroke-width': ['match', ['get', 'evidence'], 'possible', 1, 2],
        'circle-opacity': 0.96,
      },
    });

    map.on('mouseenter', TERRACE_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', TERRACE_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', TERRACE_LAYER, (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [TERRACE_LAYER] })[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const properties = feature.properties;
      const status = properties.status === 'sun'
        ? 'In de zon'
        : properties.status === 'filtered' ? 'Mogelijke boomschaduw / gefilterd licht'
          : properties.status === 'shade' ? 'Gebouwschaduw' : 'Geen daglicht';
      const evidence = properties.evidence === 'confirmed'
        ? 'Terras bevestigd'
        : properties.evidence === 'mapped' ? 'Terras apart ingetekend' : 'Terras niet bevestigd';
      const popup = document.createElement('div');
      popup.className = 'terrace-popup';
      const title = document.createElement('strong');
      title.textContent = String(properties.name);
      const detail = document.createElement('span');
      detail.textContent = `${status} · ${evidence}`;
      popup.append(title, detail);
      if (properties.status === 'filtered') {
        const estimate = document.createElement('span');
        estimate.textContent = 'Schatting op basis van boomsoort, kroonvorm en seizoen. Bladstand en takoriëntatie zijn niet gemeten.';
        popup.append(estimate);
      }

      const details: Array<[string, unknown]> = [
        ['Type', properties.amenity],
        ['Keuken', properties.cuisine],
        ['Adres', properties.address],
        ['Openingstijden', properties.openingHours],
        ['Terras', properties.outdoorSeating],
        ['Capaciteit', properties.capacity],
        ['Toegankelijkheid', properties.wheelchair],
        ['Overdekt', properties.covered],
        ['Seizoen', properties.seasonal],
      ];
      for (const [label, rawValue] of details) {
        if (!rawValue) continue;
        const row = document.createElement('span');
        row.textContent = `${label}: ${String(rawValue)}`;
        popup.append(row);
      }

      const links = document.createElement('div');
      links.className = 'terrace-links';
      const website = String(properties.website ?? '');
      if (/^https?:\/\//i.test(website)) {
        const link = document.createElement('a');
        link.href = website;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Website';
        links.append(link);
      }
      if (properties.phone) {
        const link = document.createElement('a');
        link.href = `tel:${String(properties.phone).replace(/[^+\d]/g, '')}`;
        link.textContent = 'Bellen';
        links.append(link);
      }
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const route = document.createElement('a');
      route.href = `https://www.openstreetmap.org/directions?from=&to=${latitude},${longitude}`;
      route.target = '_blank';
      route.rel = 'noopener noreferrer';
      route.textContent = 'Route';
      links.append(route);
      const osm = document.createElement('a');
      osm.href = `https://www.openstreetmap.org/${properties.osmType}/${properties.osmId}`;
      osm.target = '_blank';
      osm.rel = 'noopener noreferrer';
      osm.textContent = 'OpenStreetMap';
      links.append(osm);
      popup.append(links);
      new maplibregl.Popup({ offset: 12, closeButton: false })
        .setLngLat([longitude, latitude])
        .setDOMContent(popup)
        .addTo(map);
    });

    callbacks.onMapReady?.();
    callbacks.onViewChange(getBounds(map), map.getZoom());
  });

  // `idle` is the first point at which all visible vector tiles have settled.
  map.on('idle', () => { refreshBuildingGeometry(); extractBuildings(); });
  map.on('sourcedata', (event) => {
    if (event.sourceId === 'openmaptiles' && event.sourceDataType === 'content') { tilesDirty = true; geometryDirty = true; }
    if ((event.sourceId === 'openmaptiles' || event.sourceId === COLORED_BUILDING_SOURCE) && event.sourceDataType === 'content') shadowBuildingsDirty = true;
  });
  map.on('moveend', () => {
    // Keep the previous complete snapshot while the new tiles are loading.
    buildingFingerprint = '';
    shadowBuildingsDirty = true;
    // Keep known colors while new areas load; tile footprints fill the rest.
    geometryDirty = true; tilesDirty = true;
    callbacks.onViewChange(getBounds(map), map.getZoom());
  });
  map.on('webglcontextlost', () => {
    ready = false;
    geometryEpoch++; geometryBusy = false;
    shadowLayer = null;
  });
  map.on('webglcontextrestored', () => {
    map.once('style.load', () => {
      ready = true;
      styleLandscape();
      if (map.getLayer(SHADOW_LAYER)) map.removeLayer(SHADOW_LAYER);
      installShadowLayer();
      installTreeLayer();
      updateBuildingVisibility();
      const buildingSource = map.getSource(COLORED_BUILDING_SOURCE) as GeoJSONSource | undefined;
      buildingSource?.setData({ type: 'FeatureCollection', features: [] });
      buildingClient.reset();
      geometryDirty = true; tilesDirty = true; buildingSourceActive = false;
      shadowBuildingsDirty = true;
      const terraceSource = map.getSource(TERRACE_SOURCE) as GeoJSONSource | undefined;
      terraceSource?.setData({ type: 'FeatureCollection', features: terraceData });
      const treeSource = map.getSource(TREE_SOURCE) as GeoJSONSource | undefined;
      treeSource?.setData({ type: 'FeatureCollection', features: treeData });
      const treeMarkerSource = map.getSource(TREE_MARKER_SOURCE) as GeoJSONSource | undefined;
      treeMarkerSource?.setData(treeMarkers(treeData));
      treeLayer?.setTrees(treeData);
      if (map.getLayer(TREE_LAYER)) {
        map.setLayoutProperty(TREE_LAYER, 'visibility', visibility.trees ? 'visible' : 'none');
      }
      if (map.getLayer(TREE_MARKERS)) {
        map.setLayoutProperty(TREE_MARKERS, 'visibility', visibility.trees ? 'visible' : 'none');
      }
      treeLayer?.setVisible(visibility.trees);
      if (map.getLayer(TERRACE_LAYER)) {
        map.setFilter(TERRACE_LAYER, onlySunny ? SUNNY_FILTER : null);
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
  const reportedMapErrors = new Set<string>();
  const retriedMapSources = new Set<string>();
  map.on('error', (event: ErrorEvent) => {
    const details = event as ErrorEvent & { sourceId?: string };
    const message = details.error?.message ?? 'Kaartdata kon niet laden.';
    const source = details.sourceId ? ` [bron: ${details.sourceId}]` : '';
    const diagnostic = `Kaartbron${source}: ${message}`;
    if (reportedMapErrors.has(diagnostic)) return;
    reportedMapErrors.add(diagnostic);
    window.setTimeout(() => reportedMapErrors.delete(diagnostic), 10_000);
    if (details.sourceId && !retriedMapSources.has(details.sourceId)) {
      retriedMapSources.add(details.sourceId);
      window.setTimeout(() => map.refreshTiles(details.sourceId!), 1_500);
    }
    callbacks.onError(diagnostic);
  });

  return {
    map,
    setUserLocation(coordinates) {
      if (!coordinates) {
        userLocationMarker?.remove();
        userLocationMarker = null;
        return;
      }
      if (!userLocationMarker) {
        const element = document.createElement('div');
        element.className = 'user-location';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', 'Je locatie');
        userLocationMarker = new maplibregl.Marker({
          element,
          anchor: 'center',
          pitchAlignment: 'map',
          rotationAlignment: 'map',
        })
          .setLngLat(coordinates).addTo(map);
      } else userLocationMarker.setLngLat(coordinates);
    },
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
    setTrees(trees) {
      treeData = trees;
      if (!ready) return;
      const source = map.getSource(TREE_SOURCE) as GeoJSONSource | undefined;
      source?.setData({ type: 'FeatureCollection', features: trees });
      const markers = map.getSource(TREE_MARKER_SOURCE) as GeoJSONSource | undefined;
      markers?.setData(treeMarkers(trees));
      treeLayer?.setTrees(trees);
    },
    setTreeDate(date) {
      treeDate = date;
      treeLayer?.setDate(date);
    },
    setBuildings(buildings) {
      if (buildings?.length) { buildingClient.setKnown(buildings); knownBuildings = true; geometryDirty = true; }
      else buildingSourceActive = false;
      buildingFingerprint = '';
      if (!ready) return;
      refreshBuildingGeometry();
      updateBuildingVisibility();
      // `idle` will extract the new rendered layer for the shadow worker.
    },
    loadBuildings(bounds, mobile, signal, progress) {
      if (buildingRenderFailed) { buildingClient.reset(); geometryDirty = true; }
      return buildingClient.load(bounds, mobile, signal, progress);
    },
    refreshBuildingPalette() {
      palette = loadPalette();
      styleLandscape();
    },
    setOnlySunny(enabled) {
      onlySunny = enabled;
      if (!ready || !map.getLayer(TERRACE_LAYER)) return;
      map.setFilter(TERRACE_LAYER, enabled ? SUNNY_FILTER : null);
    },
    setVisibility(layer, visible) {
      visibility[layer] = visible;
      if (!ready) return;
      if (layer === 'buildings') {
        updateBuildingVisibility();
        return;
      }
      const layerId = layer === 'shadows' ? SHADOW_LAYER
        : layer === 'trees' ? TREE_LAYER : TERRACE_LAYER;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
      if (layer === 'trees' && map.getLayer(TREE_MARKERS)) {
        map.setLayoutProperty(TREE_MARKERS, 'visibility', visible ? 'visible' : 'none');
      }
      if (layer === 'trees') {
        treeLayer?.setVisible(visible);
      }
    },
    setSunLight(altitude, azimuth, daylight) {
      sunState = { altitude, azimuth, daylight };
      shadowLayer?.setSun(altitude, azimuth, daylight);
      treeLayer?.setSun(altitude, azimuth, daylight);
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
