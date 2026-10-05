import type { Position } from 'geojson';
import { describeTree, leafAmount, treeSeasonDay } from './tree-profiles';
import { TREE_VERTEX_STRIDE, treeMesh, type TreeMesh } from './tree-model';
import type { TreeFeature } from './types';

export type PreparedTree = ReturnType<typeof describeTree> & { mesh: TreeMesh };

export function prepareTreeObstacles(trees: TreeFeature[]): PreparedTree[] {
  return trees.map(describeTree).filter((tree) => Number.isFinite(tree.radius) && tree.radius > 0
    && Number.isFinite(tree.height) && tree.height > 0)
    .map((tree) => ({ ...tree, mesh: treeMesh(tree.profile.id) }));
}

function hitsBounds(origin: number[], direction: number[], maximum: number): boolean {
  let near = 0, far = maximum;
  // All shared models fit this envelope. Reject almost all trees before doing
  // triangle tests; an elevated crown is not a solid ground-level footprint.
  for (let axis = 0; axis < 3; axis++) {
    const minimum = axis === 2 ? 0 : -1.1;
    const max = axis === 2 ? 1.01 : 1.1;
    if (Math.abs(direction[axis]) < 1e-12) {
      if (origin[axis] < minimum || origin[axis] > max) return false;
      continue;
    }
    const a = (minimum - origin[axis]) / direction[axis];
    const b = (max - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return true;
}

function hitsTriangle(origin: number[], direction: number[], vertices: Float32Array,
  a: number, b: number, c: number, maximum: number): boolean {
  const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2];
  const e1x = vertices[b] - ax, e1y = vertices[b + 1] - ay, e1z = vertices[b + 2] - az;
  const e2x = vertices[c] - ax, e2y = vertices[c + 1] - ay, e2z = vertices[c + 2] - az;
  const px = direction[1] * e2z - direction[2] * e2y;
  const py = direction[2] * e2x - direction[0] * e2z;
  const pz = direction[0] * e2y - direction[1] * e2x;
  const determinant = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(determinant) < 1e-10) return false;
  const inverse = 1 / determinant;
  const tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inverse;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) * inverse;
  if (v < 0 || u + v > 1) return false;
  const distance = (e2x * qx + e2y * qy + e2z * qz) * inverse;
  return distance >= 0 && distance <= maximum;
}

export function possibleTreeShade(point: Position, trees: PreparedTree[], altitude: number,
  azimuth: number, date: string): boolean {
  if (altitude <= 0) return false;
  const radians = Math.max(altitude, 0.5) * Math.PI / 180;
  const bearing = azimuth * Math.PI / 180;
  const east = Math.sin(bearing) * Math.cos(radians);
  const south = -Math.cos(bearing) * Math.cos(radians);
  const up = Math.sin(radians);
  const maximum = 500 / Math.max(Math.cos(radians), 0.001);
  const day = treeSeasonDay(date);
  for (const tree of trees) {
    const dx = (point[0] - tree.longitude) * 111_320 * Math.cos(tree.latitude * Math.PI / 180);
    const dy = (tree.latitude - point[1]) * 111_320;
    const cos = Math.cos(tree.rotation), sin = Math.sin(tree.rotation);
    const origin = [(cos * dx + sin * dy) / tree.radius, (-sin * dx + cos * dy) / tree.radius, 0];
    const direction = [(cos * east + sin * south) / tree.radius, (-sin * east + cos * south) / tree.radius, up / tree.height];
    if (!hitsBounds(origin, direction, maximum)) continue;
    const leaves = leafAmount(tree.leafCycle, day, tree.phenologyShift) * tree.profile.density >= 0.01;
    const { mesh } = tree;
    const end = leaves ? mesh.indices.length : mesh.woodIndexCount;
    for (let i = 0; i < end; i += 3) {
      if (hitsTriangle(origin, direction, mesh.vertices,
        mesh.indices[i] * TREE_VERTEX_STRIDE, mesh.indices[i + 1] * TREE_VERTEX_STRIDE,
        mesh.indices[i + 2] * TREE_VERTEX_STRIDE, maximum)) return true;
    }
  }
  return false;
}
