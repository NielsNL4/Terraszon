import { describeTree, TREE_PROFILES, type TreeProfileId } from './tree-profiles';
import type { TreeFeature } from './types';

type Vec3 = [number, number, number];
export const TREE_VERTEX_STRIDE = 10; // xyz, normal xyz, RGB, foliage flag
export const TREE_INSTANCE_STRIDE = 8; // offset xy, radius, height, cos/sin, cycle, seasonal shift
export type TreeMesh = { vertices: Float32Array; indices: Uint16Array; woodIndexCount: number };
export type TreeInstances = { origin: [number, number]; groups: Map<TreeProfileId, Float32Array> };
const meshes = new Map<TreeProfileId, TreeMesh>();
const WOOD: Vec3 = [0.43, 0.31, 0.2];
const GREEN: Vec3 = [0.19, 0.43, 0.27];

function subtract(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return length ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 1];
}

export function treeMesh(id: TreeProfileId): TreeMesh {
  const cached = meshes.get(id);
  if (cached) return cached;
  const vertices: number[] = [], indices: number[] = [];
  const profile = TREE_PROFILES[id];
  const triangle = (a: Vec3, b: Vec3, c: Vec3, foliage: boolean) => {
    const normal = unit(cross(subtract(b, a), subtract(c, a)));
    const color = foliage ? GREEN : WOOD;
    const start = vertices.length / TREE_VERTEX_STRIDE;
    for (const point of [a, b, c]) vertices.push(...point, ...normal, ...color, Number(foliage));
    indices.push(start, start + 1, start + 2);
  };
  const branch = (start: Vec3, end: Vec3, radius: number, sides = 5, foliage = false) => {
    const direction = unit(subtract(end, start));
    const u = unit(cross(direction, Math.abs(direction[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
    const v = cross(direction, u);
    const ring = Array.from({ length: sides }, (_, i): Vec3 => {
      const angle = i * Math.PI * 2 / sides;
      return [0, 1, 2].map((axis) => start[axis] + radius * (Math.cos(angle) * u[axis] + Math.sin(angle) * v[axis])) as Vec3;
    });
    for (let i = 0; i < sides; i++) {
      const next = ring[(i + 1) % sides];
      triangle(ring[i], next, end, foliage);
      triangle(next, ring[i], start, foliage);
    }
  };
  // Thin, permanent woody structure rather than a crown-sized solid column.
  branch([0, 0, 0], [0, 0, 1], 0.055, 8);
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI / 4 + i * Math.PI * 2 / 5;
    const reach = id === 'column' || id === 'conifer' ? 0.7 : 0.9;
    const end: Vec3 = [Math.cos(angle) * reach, Math.sin(angle) * reach, 0.82 + (i % 2) * 0.08];
    branch([0, 0, profile.crownBase + 0.1], end, 0.03);
    if (id === 'weeping') branch(end, [end[0], end[1], 0.23], 0.018, 4);
  }
  const woodIndexCount = indices.length;
  if (id === 'conifer') {
    for (const [radius, base, top] of [[1, 0.2, 0.69], [0.78, 0.42, 0.85], [0.5, 0.65, 1]]) {
      branch([0, 0, base], [0, 0, top], radius, 10, true);
    }
  } else {
    for (const lobe of profile.lobes) {
      const point = (row: number, column: number): Vec3 => {
        const latitude = -Math.PI / 2 + row * Math.PI / 4;
        const longitude = column * Math.PI * 2 / 8;
        return [
          lobe.center[0] + lobe.radius[0] * Math.cos(latitude) * Math.cos(longitude),
          lobe.center[1] + lobe.radius[1] * Math.cos(latitude) * Math.sin(longitude),
          lobe.center[2] + lobe.radius[2] * Math.sin(latitude),
        ];
      };
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 8; column++) {
          const a = point(row, column), b = point(row, column + 1);
          const c = point(row + 1, column), d = point(row + 1, column + 1);
          if (row > 0) triangle(a, b, c, true);
          if (row < 3) triangle(b, d, c, true);
        }
      }
    }
  }
  const mesh = { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), woodIndexCount };
  meshes.set(id, mesh);
  return mesh;
}

export function treeMercator(longitude: number, latitude: number): [number, number, number] {
  const radians = latitude * Math.PI / 180;
  return [(longitude + 180) / 360, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2,
    1 / (40_075_016.68557849 * Math.cos(radians))];
}

export function treeInstances(trees: TreeFeature[]): TreeInstances {
  const descriptions = trees.map(describeTree);
  const first = descriptions[0];
  const origin: [number, number] = first ? treeMercator(first.longitude, first.latitude).slice(0, 2) as [number, number] : [0, 0];
  const groups = new Map<TreeProfileId, number[]>();
  for (const tree of descriptions) {
    if (!Number.isFinite(tree.height) || tree.height <= 0 || !Number.isFinite(tree.radius) || tree.radius <= 0) continue;
    const [x, y, meters] = treeMercator(tree.longitude, tree.latitude);
    if (!groups.has(tree.profile.id)) groups.set(tree.profile.id, []);
    groups.get(tree.profile.id)!.push(x - origin[0], y - origin[1], tree.radius * meters, tree.height * meters,
      Math.cos(tree.rotation), Math.sin(tree.rotation), tree.leafCycle === 'evergreen' ? 0 : tree.leafCycle === 'deciduous' ? 1 : 2,
      tree.phenologyShift);
  }
  return { origin, groups: new Map([...groups].map(([id, values]) => [id, new Float32Array(values)])) };
}
