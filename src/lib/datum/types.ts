export type Vec3 = [number, number, number];

export type MarkupKind = "note" | "question" | "issue" | "ok";

export type NativeUnit = "mm" | "in" | "cm" | "m" | "ft" | "unknown";

export type ViewName = "iso" | "front" | "back" | "left" | "right" | "top" | "bottom";

export type Mode = "navigate" | "note" | "measure";

export type Quality = "coarse" | "standard" | "fine";

export type PanelTab = "notes" | "measures" | "part";

export type MobileSheet = "tree" | "review" | "views" | null;

export type CameraState = {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  projection: "persp" | "ortho";
};

export type MarkupReply = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
};

export type Markup = {
  id: string;
  index: number;
  kind: MarkupKind;
  title: string;
  body: string;
  meshId: string;
  meshName: string;
  point: Vec3;
  normal: Vec3;
  camera: CameraState | null;
  author: string;
  createdAt: number;
  resolved: boolean;
  replies: MarkupReply[];
};

export type Measure = {
  id: string;
  index: number;
  meshA: string;
  meshB: string;
  a: Vec3;
  b: Vec3;
  createdAt: number;
};

export type StepMeta = {
  schema: string;
  fileName: string;
  timestamp: string;
  originating: string;
  preprocessor: string;
  products: string[];
  nativeUnit: NativeUnit;
  entityCount: number;
};

export type FaceGroup = {
  first: number;
  last: number;
  color: [number, number, number] | null;
};

export type MeshPayload = {
  id: string;
  name: string;
  color: [number, number, number] | null;
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  faces: FaceGroup[];
};

export type TreeNode = {
  id: string;
  name: string;
  meshIds: string[];
  children: TreeNode[];
};

export type Bounds = { min: Vec3; max: Vec3 };

export type Geometry = {
  meshes: MeshPayload[];
  tree: TreeNode;
  triangles: number;
  bounds: Bounds;
  volume: number;
  area: number;
};

export type FileFormat = "step" | "iges";

export type FileInfo = {
  name: string;
  size: number;
  hash: string;
  format: FileFormat;
  meta: StepMeta;
};

export type DisplayState = {
  projection: "persp" | "ortho";
  style: "shaded" | "edges" | "wire";
  grid: boolean;
  axes: boolean;
  sectionOn: boolean;
  sectionAxis: "x" | "y" | "z";
  sectionT: number;
  explode: number;
  unit: "mm" | "in";
  quality: Quality;
  xray: boolean;
  sketches: boolean;
  fileNotes: boolean;
};

export type PickHit = {
  meshId: string;
  meshName: string;
  triangle: number | null;
  point: Vec3;
  normal: Vec3;
};

export type Packet = {
  datum: 1;
  file: { name: string; hash: string; size: number };
  unit: "mm" | "in";
  markups: Markup[];
  measures: Measure[];
  camera: CameraState | null;
};

export type RecentFile = {
  hash: string;
  name: string;
  size: number;
  format: FileFormat;
  openedAt: number;
};

export type Draft = {
  meshId: string;
  meshName: string;
  point: Vec3;
  normal: Vec3;
  kind: MarkupKind;
  title: string;
  body: string;
};

export type MeasureAnchor = {
  meshId: string;
  meshName: string;
  point: Vec3;
};

export const INCH = 25.4;

export const SAMPLES = [
  { id: "rounded", name: "Rounded cube", file: "rounded-cube.step", note: "10 mm, filleted" },
  { id: "as1", name: "Bracket assembly", file: "as1-assembly.stp", note: "nuts, plate, brackets" },
  { id: "inch", name: "Inch cube", file: "cube-in.step", note: "converted to mm" },
] as const;
