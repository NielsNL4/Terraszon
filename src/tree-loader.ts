import { fetchTrees } from './trees';
import { describeTree } from './tree-profiles';
import type { TreeFeature } from './types';
export { treeDataKey } from './tree-profiles';

export type TreeBounds = { south: number; west: number; north: number; east: number };
const TTL = 24 * 60 * 60 * 1000;
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

export function createTreeViewLoader(fetchArea = fetchTrees) {
  const regions: Array<{ bounds: TreeBounds; trees: TreeFeature[]; savedAt: number }> = [];
  return async (view: TreeBounds, signal: AbortSignal): Promise<TreeFeature[]> => {
    if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
    for (let i = regions.length - 1; i >= 0; i--) if (Date.now() - regions[i].savedAt > TTL) regions.splice(i, 1);
    const covered = regions.find(region => contains(region.bounds, view));
    const target = covered?.bounds ?? bufferedTreeBounds(view);
    const missing = covered ? [] : missingTreeBounds(target, regions.map(region => region.bounds));
    // A far jump should be one request, not many tiny fragments.
    const areas = missing.length > 4 ? [target] : missing;
    for (const area of areas) {
      const trees = await fetchArea(area, signal);
      if (signal.aborted) throw new DOMException('Afgebroken', 'AbortError');
      if (trees.length) regions.push({ bounds: area, trees, savedAt: Date.now() });
      while (regions.length > 12 || regions.reduce((n, region) => n + region.trees.length, 0) > 8_000) regions.shift();
    }
    const unique = new Map<string, TreeFeature>();
    for (const region of regions) if (overlaps(region.bounds, target)) {
      for (const tree of region.trees) unique.set(tree.properties.id, tree);
    }
    const center = [(view.west + view.east) / 2, (view.south + view.north) / 2];
    const ranked = [...unique.values()].map(tree => ({ tree, info: describeTree(tree) }))
      .filter(({ info }) => info.longitude >= target.west && info.longitude <= target.east && info.latitude >= target.south && info.latitude <= target.north)
      .sort((a, b) => {
        const distance = (info: typeof a.info) => (info.longitude - center[0]) ** 2 + (info.latitude - center[1]) ** 2;
        return distance(a.info) - distance(b.info);
      }).slice(0, 1_000).map(({ tree }) => tree).sort((a, b) => a.properties.id.localeCompare(b.properties.id));
    return ranked;
  };
}
