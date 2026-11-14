declare module "three" {
  export const SRGBColorSpace: string;
  export const NoToneMapping: number;
  export const DoubleSide: number;
  export const FrontSide: number;

  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    sub(v: Vector3): this;
    add(v: Vector3): this;
    addScaledVector(v: Vector3, scale: number): this;
    multiplyScalar(scale: number): this;
    normalize(): this;
    lengthSq(): number;
    applyMatrix4(matrix: Matrix4): this;
    applyMatrix3(matrix: Matrix3): this;
    project(camera: Camera): this;
    setComponent(index: number, value: number): this;
    dot(v: Vector3): number;
    distanceTo(v: Vector3): number;
  }

  export class Matrix3 {
    getNormalMatrix(matrix: Matrix4): this;
  }
  export class Matrix4 {}
  export class Color {
    constructor(r?: number, g?: number, b?: number);
  }
  export class BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
    array: { slice(start: number, end?: number): ArrayLike<number> };
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
  }
  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): this;
    getAttribute(name: string): BufferAttribute | undefined;
    setIndex(attribute: BufferAttribute): this;
    getIndex(): BufferAttribute | null;
    addGroup(start: number, count: number, materialIndex: number): void;
    computeVertexNormals(): void;
    setFromPoints(points: Vector3[]): this;
    dispose(): void;
  }
  export class Object3D {
    add(...objects: Object3D[]): this;
    removeFromParent(): void;
    position: Vector3;
    rotation: { x: number; y: number; z: number };
    up: Vector3;
    visible: boolean;
    renderOrder: number;
    name: string;
    frustumCulled: boolean;
    userData: Record<string, unknown>;
    matrixWorld: Matrix4;
    children: Object3D[];
    traverse(callback: (child: Object3D) => void): void;
    updateMatrixWorld(force?: boolean): void;
    lookAt(target: Vector3): void;
    getWorldDirection(target: Vector3): Vector3;
    worldToLocal(vector: Vector3): Vector3;
    raycast: () => void;
  }
  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class Camera extends Object3D {}
  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    near: number;
    far: number;
    updateProjectionMatrix(): void;
  }
  export class OrthographicCamera extends Camera {
    constructor(left?: number, right?: number, top?: number, bottom?: number, near?: number, far?: number);
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
    zoom: number;
    updateProjectionMatrix(): void;
  }
  export class Light extends Object3D {}
  export class HemisphereLight extends Light {
    constructor(sky?: number, ground?: number, intensity?: number);
  }
  export class AmbientLight extends Light {
    constructor(color?: number, intensity?: number);
  }
  export class DirectionalLight extends Light {
    constructor(color?: number, intensity?: number);
    target: Object3D;
  }
  export class Material {
    dispose(): void;
    clippingPlanes: Plane[];
    side: number;
  }
  export class MeshStandardMaterial extends Material {
    constructor(parameters?: object);
    wireframe: boolean;
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    emissive: { set(color: number): void };
    emissiveIntensity: number;
  }
  export class MeshBasicMaterial extends Material {
    constructor(parameters?: object);
  }
  export class LineBasicMaterial extends Material {
    constructor(parameters?: object);
  }
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }
  export class Line extends Mesh {}
  export class LineSegments extends Mesh {}
  export class CanvasTexture {
    constructor(canvas: HTMLCanvasElement);
    colorSpace: string;
    dispose(): void;
  }
  export class SpriteMaterial extends Material {
    constructor(parameters?: object);
    map: CanvasTexture | null;
  }
  export class Sprite extends Object3D {
    constructor(material?: SpriteMaterial);
    material: SpriteMaterial;
    scale: Vector3;
  }
  export class EdgesGeometry extends BufferGeometry {
    constructor(geometry?: BufferGeometry, thresholdAngle?: number);
  }
  export class GridHelper extends LineSegments {
    constructor(size?: number, divisions?: number, color1?: number, color2?: number);
  }
  export class AxesHelper extends LineSegments {
    constructor(size?: number);
  }
  export class Box3 {
    isEmpty(): boolean;
    expandByObject(object: Object3D): this;
    getCenter(target: Vector3): Vector3;
    getSize(target: Vector3): Vector3;
  }
  export class Plane {
    constructor(normal?: Vector3, constant?: number);
    setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): this;
  }
  export class Intersection {
    point: Vector3;
    object: Object3D;
    face: { normal: Vector3 } | null;
    faceIndex: number | null;
  }
  export class Raycaster {
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
  }
  export const MathUtils: {
    clamp(value: number, min: number, max: number): number;
  };
  export class WebGLRenderer {
    constructor(parameters?: object);
    setPixelRatio(value: number): void;
    setClearColor(color: number, alpha?: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Object3D, camera: Camera): void;
    dispose(): void;
    domElement: HTMLCanvasElement;
    outputColorSpace: string;
    toneMapping: number;
    localClippingEnabled: boolean;
    getPixelRatio(): number;
  }
}

declare module "three/addons/controls/OrbitControls.js" {
  import type { Vector3 } from "three";
  export class OrbitControls {
    constructor(camera: object, element: HTMLElement);
    enableDamping: boolean;
    dampingFactor: number;
    zoomToCursor: boolean;
    screenSpacePanning: boolean;
    target: Vector3;
    object: object;
    minDistance: number;
    maxDistance: number;
    update(): boolean;
    dispose(): void;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  }
}
