import { createBuildingLoader, type BuildingData, type CachedArea } from './building-loader';
import { createAreaCache } from './area-cache';
import { createTreeViewLoader, type TreeViewData } from './tree-loader';
import { describeTree } from './tree-profiles';
import { buildingBox } from './building-types';
import { abortable, aborted } from './requests';
import { placeCoordinates } from './places';
import { REPORT_RADIUS_METERS, SUN_REPORT_MODEL_VERSION, type ReportObstacles, type ReportTarget } from './sun-report-protocol';
import type { DataBounds } from './data-coverage';

export function reportObstacleBounds(coordinates: [number, number]): DataBounds {
  placeCoordinates(coordinates);
  if (Math.abs(coordinates[1]) > 85) throw new Error('Dit punt ligt buiten de ondersteunde kaartbreedtes (85°).');
  const latitude = REPORT_RADIUS_METERS / 111_320;
  const longitude = latitude / Math.cos(coordinates[1] * Math.PI / 180);
  const bounds = { south: coordinates[1] - latitude, north: coordinates[1] + latitude, west: coordinates[0] - longitude, east: coordinates[0] + longitude };
  if (bounds.west < -180 || bounds.east > 180) throw new Error('Een obstakelgebied over de datumgrens wordt nog niet ondersteund.');
  return bounds;
}

export function obstacleRevision(snapshot: Pick<ReportObstacles, 'buildings' | 'trees' | 'coverage'>): string {
  const sorted = <T extends { properties: { id: string } }>(features: T[]) => [...features].sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  const text = JSON.stringify([SUN_REPORT_MODEL_VERSION, sorted(snapshot.buildings), sorted(snapshot.trees),
    snapshot.coverage.bounds, snapshot.coverage.buildings, snapshot.coverage.trees, snapshot.coverage.treeSources,
    snapshot.coverage.buildingsLimited, snapshot.coverage.treesLimited]);
  let a = 2_166_136_261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16_777_619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function createReportObstacleLoader(options: {
  buildings?: (bounds: DataBounds, signal: AbortSignal) => Promise<BuildingData>;
  trees?: (bounds: DataBounds, signal: AbortSignal) => Promise<TreeViewData>;
} = {}) {
  const loadBuildings = options.buildings ?? createBuildingLoader({ store: createAreaCache<CachedArea>() });
  const loadTrees = options.trees ?? createTreeViewLoader(undefined, { selectionLimit: 12_000 });
  const cache = new Map<string, ReportObstacles>();
  let pending: { key: string; controller: AbortController; promise: Promise<ReportObstacles> } | null = null;
  const keyFor = (target: ReportTarget, includeTrees: boolean) => JSON.stringify([target.coordinates, includeTrees]);
  const retain = (target: ReportTarget | null, includeTrees = true) => {
    const key = target ? keyFor(target, includeTrees) : '';
    if (pending && pending.key !== key) { pending.controller.abort(); pending = null; }
  };
  const load = async (target: ReportTarget, includeTrees: boolean, signal: AbortSignal): Promise<ReportObstacles> => {
    if (signal.aborted) throw aborted(signal);
    const bounds = reportObstacleBounds(target.coordinates), key = keyFor(target, includeTrees);
    retain(target, includeTrees);
    const cached = cache.get(key);
    if (cached && cached.coverage.expiresAt > Date.now()) return cached;
    if (!pending) {
      const controller = new AbortController();
      // Source loaders have their own 45s deadline and can retain partial data.
      // The outer source job additionally bounds ignored promises and handoffs.
      const timer = setTimeout(() => controller.abort(new DOMException('Obstakeldata reageerde niet op tijd', 'TimeoutError')), 47_000);
      const promise = (async (): Promise<ReportObstacles> => {
        const [buildingResult, treeResult] = await abortable(Promise.allSettled([
          loadBuildings(bounds, controller.signal), includeTrees ? loadTrees(bounds, controller.signal) : Promise.resolve(null),
        ]), controller.signal);
        if (controller.signal.aborted) throw aborted(controller.signal);
        const buildings = buildingResult.status === 'fulfilled' ? buildingResult.value : null;
        const trees = treeResult.status === 'fulfilled' ? treeResult.value : null;
        const selectedBuildings = (buildings?.buildings ?? []).filter(feature => {
          const box = buildingBox(feature.geometry);
          return box.west <= bounds.east && box.east >= bounds.west && box.south <= bounds.north && box.north >= bounds.south;
        });
        const selectedTrees = (trees?.trees ?? []).filter(tree => {
          const point = describeTree(tree);
          return point.longitude >= bounds.west && point.longitude <= bounds.east && point.latitude >= bounds.south && point.latitude <= bounds.north;
        });
        const buildingsLimited = !!buildings?.capped || selectedBuildings.length > 12_000;
        const treesLimited = !!trees?.renderLimited;
        const loadedAt = Date.now();
        const buildingStatus = !buildings ? 'failed' : buildingsLimited ? 'partial' : buildings.status;
        const treeStatus: ReportObstacles['coverage']['trees'] = !includeTrees ? 'disabled' : !trees ? 'failed' : treesLimited ? 'partial' : trees.status;
        const complete = ['complete', 'empty'].includes(buildingStatus) && ['complete', 'empty', 'disabled'].includes(treeStatus);
        const data = { buildings: selectedBuildings.slice(0, 12_000), trees: selectedTrees,
          coverage: { bounds, buildings: buildingStatus, trees: treeStatus, treeSources: trees?.sources ?? [],
            estimatedHeights: selectedBuildings.slice(0, 12_000).filter(building => !building.properties.hasHeight).length,
            buildingsLimited, treesLimited, loadedAt,
            expiresAt: loadedAt + (complete ? buildingStatus === 'empty' || treeStatus === 'empty' ? 60_000 : 5 * 60_000 : 3_000) } };
        const snapshot: ReportObstacles = { ...data, revision: obstacleRevision(data) };
        cache.delete(key); cache.set(key, snapshot);
        while (cache.size > 2) cache.delete(cache.keys().next().value!);
        return snapshot;
      })();
      const job = { key, controller, promise };
      pending = job;
      void promise.catch(() => {}).finally(() => { clearTimeout(timer); if (pending === job) pending = null; });
    }
    return abortable(pending.promise, signal);
  };
  return { load, retain, invalidate() { retain(null); cache.clear(); } };
}
