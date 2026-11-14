import type { Bounds, FaceGroup, Geometry, MeshPayload, TreeNode, Vec3 } from "@/lib/datum/types";

type RawNode = { name?: string; meshes?: number[]; children?: RawNode[] };

type RawMesh = {
  name: string;
  color: [number, number, number] | null;
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  faces: FaceGroup[];
};

export function buildGeometry(root: RawNode, rawMeshes: RawMesh[]): Geometry {
  const meshes: MeshPayload[] = rawMeshes.map((mesh, index) => ({
    id: `m${index}`,
    name: mesh.name || `Solid ${index + 1}`,
    color: mesh.color,
    position: mesh.position,
    normal: mesh.normal,
    index: mesh.index,
    faces: mesh.faces,
  }));
  let seq = 0;
  const walk = (node: RawNode, fallback: string): TreeNode => {
    const id = `n${seq}`;
    seq += 1;
    const name = (node.name || "").trim() || fallback;
    return {
      id,
      name,
      meshIds: (node.meshes || []).map((meshIndex) => `m${meshIndex}`),
      children: (node.children || []).map((child, childIndex) => walk(child, `${name} ${childIndex + 1}`)),
    };
  };
  const tree = walk(root || {}, "Model");
  let triangles = 0;
  let volume = 0;
  let area = 0;
  const bounds = emptyBounds();
  for (const mesh of meshes) {
    const count = mesh.index.length / 3;
    triangles += count;
    expandBounds(bounds, mesh.position);
    volume += meshVolume(mesh.position, mesh.index);
    area += meshArea(mesh.position, mesh.index);
  }
  if (!Number.isFinite(bounds.min[0])) {
    bounds.min = [0, 0, 0];
    bounds.max = [0, 0, 0];
  }
  return { meshes, tree, triangles, bounds, volume, area };
}

function emptyBounds(): Bounds {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
}

function expandBounds(bounds: Bounds, position: Float32Array) {
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i];
    const y = position[i + 1];
    const z = position[i + 2];
    if (x < bounds.min[0]) bounds.min[0] = x;
    if (y < bounds.min[1]) bounds.min[1] = y;
    if (z < bounds.min[2]) bounds.min[2] = z;
    if (x > bounds.max[0]) bounds.max[0] = x;
    if (y > bounds.max[1]) bounds.max[1] = y;
    if (z > bounds.max[2]) bounds.max[2] = z;
  }
}

function meshVolume(position: Float32Array, index: Uint32Array): number {
  let volume = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const ax = position[a];
    const ay = position[a + 1];
    const az = position[a + 2];
    const bx = position[b];
    const by = position[b + 1];
    const bz = position[b + 2];
    const cx = position[c];
    const cy = position[c + 1];
    const cz = position[c + 2];
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(volume / 6);
}

function meshArea(position: Float32Array, index: Uint32Array): number {
  let area = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const abx = position[b] - position[a];
    const aby = position[b + 1] - position[a + 1];
    const abz = position[b + 2] - position[a + 2];
    const acx = position[c] - position[a];
    const acy = position[c + 1] - position[a + 1];
    const acz = position[c + 2] - position[a + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    area += 0.5 * Math.hypot(cx, cy, cz);
  }
  return area;
}

export function faceSlot(mesh: MeshPayload, triangle: number): { index: number; first: number; last: number } | null {
  for (let i = 0; i < mesh.faces.length; i += 1) {
    const face = mesh.faces[i];
    if (triangle >= face.first && triangle <= face.last) {
      return { index: i, first: face.first, last: face.last };
    }
  }
  return null;
}

export function descendantMeshIds(node: TreeNode): string[] {
  const ids = [...node.meshIds];
  for (const child of node.children) ids.push(...descendantMeshIds(child));
  return ids;
}

export function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function span(bounds: Bounds): Vec3 {
  return [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
}
