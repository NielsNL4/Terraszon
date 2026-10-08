import { fetchTrees, type TreeAreaData } from './trees';
import { describeTree } from './tree-profiles';
import type { TreeFeature } from './types';
import { splitDataBounds, type DataCoverage } from './data-coverage';
import { aborted, abortable, requestDeadline } from './requests';
import { OVERPASS_LOAD_TIMEOUT } from './overpass';
import { pilotData } from './pilot-data';
import type { DatasetStamp } from './pilot-format';
export { treeDataKey } from './tree-profiles';

export type TreeBounds = { south: number; west: number; north: number; east: number };
const TTL = 24 * 60 * 60 * 1000;
const EMPTY_TTL = 60_000;
const MAX_RENDER_TREES = 1_000;
export type TreeViewData = {
  trees: TreeFeature[];
  status: DataCoverage;
  capped: boolean;
  renderLimited: boolean;
  failedAreas: number;
  sources: TreeAreaData['source'][];
  datasets?: DatasetStamp[];
};
const contains = (outer: TreeBounds, inner: TreeBounds) => outer.south <= inner.south && outer.north >= inner.north
  && outer.west <= inner.west && outer.east >= inner.east;
const overlaps = (a: TreeBounds, b: TreeBounds) => a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;

export function bufferedTreeBounds(bounds: TreeBounds): TreeBounds {
  const latitude = Math.max(0.001, (bounds.north - bounds.south) * 0.25);
  const longitude = Math.max(0.001, (bounds.east - bounds.west) * 0.25);
  return { south: bounds.south - latitude, north: bounds.north + latitude, west: bounds.west - longitude, east: bounds.east + longitude };
}

export function missingTreeBounds(target: TreeBounds, coverage: TreeBounds[]): TreeBounds[] {
  let pending = [target];
  for (const covered of coverage) {
    pending = pending.flatMap(area => {
      if (!overlaps(area, covered)) return [area];
      const south = Math.max(area.south, covered.south), north = Math.min(area.north, covered.north);
      const west = Math.max(area.west, covered.west), east = Math.min(area.east, covered.east);
      return [
        { ...area, north: south }, { ...area, south: north },
        { south, north, west: area.west, east: west }, { south, north, west: east, east: area.east },
      ].filter(part => part.north - part.south > 0.000001 && part.east - part.west > 0.000001);
    });
  }
  return pending;
}

export function createTreeViewLoader(fetchArea = fetchTrees, options: { maximumRequests?: number; maximumDepth?: number; selectionLimit?: number } = {}) {
  const selectionLimit = Math.max(1, Math.min(12_000, options.selectionLimit ?? MAX_RENDER_TREES));
  const regions: Array<{ bounds: TreeBounds; data: TreeAreaData; savedAt: number }> = [];
  let lastRevision: string | null | undefined;
  const complete = (data: TreeAreaData) => data.status === 'complete' || data.status === 'empty';
  const loadView = async (view: TreeBounds, signal: AbortSignal, callerSignal: AbortSignal): Promise<TreeViewData> => {
    if (signal.aborted) throw aborted(signal);
    const revision = await pilotData?.revision(bufferedTreeBounds(view), signal);
    if (revision !== lastRevision) { regions.length = 0; lastRevision = revision; }
    for (let i = regions.length - 1; i >= 0; i--) {
      const ttl = regions[i].data.status === 'empty' ? EMPTY_TTL : TTL;
      if (Date.now() - regions[i].savedAt > ttl || regions[i].data.datasets?.some(dataset => dataset.expiresAt <= Date.now() || dataset.revision !== revision)) regions.splice(i, 1);
    }
    const coverage = () => regions.filter(region => complete(region.data)).map(region => region.bounds);
    const covered = regions.find(region => complete(region.data) && contains(region.bounds, view));
    const target = covered?.bounds ?? bufferedTreeBounds(view);
    const missing = covered ? [] : missingTreeBounds(target, coverage());
    // A far jump should be one request, not many tiny fragments.
    const areas = missing.length > 4 ? [target] : missing;
    let requests = 0, failedAreas = 0, capped = false;
    const maximumRequests = options.maximumRequests ?? 12;
    const load = async (area: TreeBounds, depth: number): Promise<void> => {
      if (signal.aborted) throw aborted(signal);
      if (requests >= maximumRequests) { capped = true; return; }
      let data: TreeAreaData;
      try {
        data = await abortable(fetchArea(area, signal, maximumRequests - requests), signal);
      } catch {
        if (signal.aborted) throw aborted(signal);
        requests++;
        failedAreas++;
        return;
      }
      if (signal.aborted) throw aborted(signal);
      requests += data.requests;
      if (data.failed) failedAreas++;
      if (data.status === 'failed') return;
      // Partial records remain usable, but are never treated as covered. A
      // shorter partial retry must not erase records already seen in this area.
      const retained = new Map<string, TreeFeature>();
      for (let i = regions.length - 1; i >= 0; i--) {
        if (contains(area, regions[i].bounds) && contains(regions[i].bounds, area)) {
          if (data.status === 'partial' && regions[i].data.source === data.source) {
            for (const tree of regions[i].data.trees) retained.set(tree.properties.id, tree);
          }
          regions.splice(i, 1);
        }
      }
      for (const tree of data.trees) retained.set(tree.properties.id, tree);
      data = { ...data, trees: [...retained.values()] };
      regions.push({ bounds: area, data, savedAt: Date.now() });
      if (data.capped) {
        const children = depth < (options.maximumDepth ?? 3) ? splitDataBounds(area) : [];
        if (!children.length) capped = true;
        for (const child of children) await load(child, depth + 1);
      }
    };
    try { for (const area of areas) await load(area, 0); }
    catch (error) {
      if (callerSignal.aborted) throw aborted(callerSignal);
      if (!signal.aborted) throw error;
      failedAreas++;
    }
    // Drop superseded parent snapshots once all their child areas are covered.
    const coveredBounds = coverage();
    for (let i = regions.length - 1; i >= 0; i--) {
      if (!complete(regions[i].data) && !missingTreeBounds(regions[i].bounds, coveredBounds).length) regions.splice(i, 1);
    }
    while (regions.length > 32 || regions.reduce((n, region) => n + region.data.trees.length, 0) > 12_000) regions.shift();
    const unique = new Map<string, TreeFeature>();
    const sources = new Set<TreeAreaData['source']>();
    const datasets = new Map<string, DatasetStamp>();
    for (const region of regions) if (overlaps(region.bounds, target)) {
      for (const source of region.data.sources ?? [region.data.source]) sources.add(source);
      for (const dataset of region.data.datasets ?? []) datasets.set(dataset.revision, dataset);
      for (const tree of region.data.trees) unique.set(tree.properties.id, tree);
    }
    const center = [(view.west + view.east) / 2, (view.south + view.north) / 2];
    const longitudeScale = Math.cos(center[1] * Math.PI / 180);
    const ranked = [...unique.values()].map(tree => ({ tree, info: describeTree(tree) }))
      .filter(({ info }) => info.longitude >= target.west && info.longitude <= target.east && info.latitude >= target.south && info.latitude <= target.north)
      .sort((a, b) => {
        const visible = (info: typeof a.info) => info.longitude >= view.west && info.longitude <= view.east
          && info.latitude >= view.south && info.latitude <= view.north;
        if (visible(a.info) !== visible(b.info)) return visible(a.info) ? -1 : 1;
        const distance = (info: typeof a.info) => ((info.longitude - center[0]) * longitudeScale) ** 2 + (info.latitude - center[1]) ** 2;
        return distance(a.info) - distance(b.info);
      });
    const trees = ranked.slice(0, selectionLimit).map(({ tree }) => tree).sort((a, b) => a.properties.id.localeCompare(b.properties.id));
    const uncovered = missingTreeBounds(target, coverage()).length > 0;
    return { trees, capped: capped && uncovered, renderLimited: ranked.length > selectionLimit, failedAreas, sources: [...sources].sort(), ...(datasets.size ? { datasets: [...datasets.values()] } : {}),
      status: uncovered ? (trees.length || sources.size ? 'partial' : 'failed') : trees.length ? 'complete' : 'empty' };
  };
  return async (view: TreeBounds, signal: AbortSignal) => {
    const deadline = requestDeadline(signal, OVERPASS_LOAD_TIMEOUT);
    try { return await loadView(view, deadline.signal, signal); }
    finally { deadline.dispose(); }
  };
}
