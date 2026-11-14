import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { faceSlot } from "@/lib/datum/geometry";
import type { StepNote, StepSketch, StepSupplement } from "@/lib/datum/stepSupplement";
import type {
  Bounds,
  CameraState,
  DisplayState,
  Draft,
  Geometry,
  Markup,
  MarkupKind,
  Measure,
  MeasureAnchor,
  Mode,
  PickHit,
  Vec3,
  ViewName,
} from "@/lib/datum/types";

type Entry = {
  id: string;
  name: string;
  group: THREE.Group;
  mesh: THREE.Mesh;
  edges: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  center: THREE.Vector3;
};

type ReviewState = {
  markups: Markup[];
  measures: Measure[];
  draft: Draft | null;
  anchor: MeasureAnchor | null;
};

const KIND_COLOR: Record<MarkupKind, string> = {
  note: "#c4a46a",
  question: "#7eb0c4",
  issue: "#c46b5a",
  ok: "#7dae86",
};

const VIEW_DIR: Record<ViewName, THREE.Vector3> = {
  iso: new THREE.Vector3(1, -1, 0.72).normalize(),
  front: new THREE.Vector3(0, -1, 0),
  back: new THREE.Vector3(0, 1, 0),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 0.045, 1).normalize(),
  bottom: new THREE.Vector3(0, 0.045, -1).normalize(),
};

export class DatumEngine {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private active: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly modelRoot = new THREE.Group();
  private readonly sketchRoot = new THREE.Group();
  private readonly noteRoot = new THREE.Group();
  private readonly measureRoot = new THREE.Group();
  private readonly key = new THREE.DirectionalLight(0xfff4e4, 1.25);
  private readonly entries = new Map<string, Entry>();
  private readonly meshById = new Map<string, Geometry["meshes"][number]>();
  private grid: THREE.GridHelper | null = null;
  private axes: THREE.AxesHelper | null = null;
  private highlight: THREE.Mesh | null = null;
  private readonly faceMat: THREE.MeshBasicMaterial;
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly measureMat: THREE.LineBasicMaterial;
  private readonly measureGhost: THREE.LineBasicMaterial;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private bounds: Bounds | null = null;
  private radius = 1;
  private orthoHalf = 1;
  private showGrid = true;
  private showAxes = true;
  private showSketches = true;
  private showFileNotes = true;
  private style: DisplayState["style"] = "edges";
  private xray = false;
  private selectedId: string | null = null;
  private mode: Mode = "navigate";
  private review: ReviewState = { markups: [], measures: [], draft: null, anchor: null };
  private hover: PickHit | null = null;
  private pointerDown = false;
  private downX = 0;
  private downY = 0;
  private raf = 0;
  private pending = 0;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly handlers: {
      onPick: (hit: PickHit | null) => void;
      onHover: (hit: PickHit | null) => void;
    },
  ) {
    this.persp = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.persp.up.set(0, 0, 1);
    this.persp.position.set(1.2, -1.2, 0.9);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    this.ortho.up.set(0, 0, 1);
    this.ortho.position.copy(this.persp.position);
    this.active = this.persp;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0x121614, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.host.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.persp, this.host);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("change", this.onControl);

    this.scene.add(new THREE.HemisphereLight(0xd9d3c6, 0x1c1914, 0.72));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    this.key.target.position.set(0, 0, 0);
    this.scene.add(this.key);
    this.scene.add(this.key.target);
    const fill = new THREE.DirectionalLight(0x9bb4c4, 0.38);
    fill.position.set(-2, 3, 1);
    this.scene.add(fill);
    this.scene.add(this.modelRoot);
    this.scene.add(this.sketchRoot);
    this.scene.add(this.noteRoot);
    this.scene.add(this.measureRoot);

    this.faceMat = new THREE.MeshBasicMaterial({
      color: 0x7eb0c4,
      transparent: true,
      opacity: 0.42,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.9 });
    this.measureMat = new THREE.LineBasicMaterial({ color: 0xe7e4da });
    this.measureGhost = new THREE.LineBasicMaterial({
      color: 0xc4a46a,
      transparent: true,
      opacity: 0.85,
    });

    this.host.addEventListener("pointerdown", this.onPointerDown);
    this.host.addEventListener("pointerup", this.onPointerUp);
    this.host.addEventListener("pointermove", this.onPointerMove);
    this.host.addEventListener("contextmenu", this.onContext);
    this.resizeObserver.observe(this.host);
    this.resize();
    this.kick(1);
  }

  private readonly resizeObserver = new ResizeObserver(() => {
    this.resize();
    this.kick(1);
  });

  private readonly onControl = () => {
    this.kick(1);
  };

  private readonly onContext = (event: Event) => {
    event.preventDefault();
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointerDown = true;
    this.downX = event.clientX;
    this.downY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.pointerDown || event.button !== 0) return;
    this.pointerDown = false;
    if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > 6) return;
    this.handlers.onPick(this.pick(event.clientX, event.clientY));
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.pointerDown) return;
    const hit = this.pick(event.clientX, event.clientY);
    const same =
      hit?.meshId === this.hover?.meshId &&
      hit?.triangle === this.hover?.triangle &&
      !!hit === !!this.hover;
    this.hover = hit;
    if (!same) this.handlers.onHover(hit);
    if (this.review.anchor) {
      this.syncMeasures();
      this.kick(1);
    }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.onControl);
    this.controls.dispose();
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointerup", this.onPointerUp);
    this.host.removeEventListener("pointermove", this.onPointerMove);
    this.host.removeEventListener("contextmenu", this.onContext);
    this.clearModel();
    this.clearSupplement();
    this.clearGroup(this.measureRoot);
    this.edgeMat.dispose();
    this.faceMat.dispose();
    this.measureMat.dispose();
    this.measureGhost.dispose();
    disposeHelper(this.grid);
    disposeHelper(this.axes);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setGeometry(geometry: Geometry | null) {
    this.clearModel();
    this.meshById.clear();
    this.bounds = geometry?.bounds ?? null;
    if (!geometry) {
      this.kick(1);
      return;
    }
    for (const mesh of geometry.meshes) {
      this.meshById.set(mesh.id, mesh);
      const entry = this.buildEntry(mesh);
      this.entries.set(mesh.id, entry);
      this.modelRoot.add(entry.group);
    }
    this.placeHelpers(geometry.bounds);
    this.applyStyle();
    this.kick(1);
  }

  setSupplement(supplement: StepSupplement | null) {
    this.clearSupplement();
    if (!supplement) {
      this.kick(1);
      return;
    }
    for (const sketch of supplement.sketches) this.addSketch(sketch);
    supplement.notes.forEach((note, index) => this.addNote(note, index));
    this.sketchRoot.visible = this.showSketches;
    this.noteRoot.visible = this.showFileNotes;
    this.kick(1);
  }

  setVisibility(visibility: Record<string, boolean>, isolated: string[] | null) {
    const allow = isolated ? new Set(isolated) : null;
    for (const [id, entry] of this.entries) {
      const shown = visibility[id] !== false;
      entry.group.visible = allow ? allow.has(id) && shown : shown;
    }
    this.kick(1);
  }

  setSelection(meshId: string | null, triangle: number | null) {
    this.selectedId = meshId;
    this.applyStyle();
    this.setFaceHighlight(meshId, triangle);
  }

  setDisplay(display: DisplayState) {
    this.style = display.style;
    this.xray = display.xray;
    this.showGrid = display.grid;
    this.showAxes = display.axes;
    this.showSketches = display.sketches;
    this.showFileNotes = display.fileNotes;
    if (this.grid) this.grid.visible = display.grid;
    if (this.axes) this.axes.visible = display.axes;
    this.sketchRoot.visible = display.sketches;
    this.noteRoot.visible = display.fileNotes;
    const wantOrtho = display.projection === "ortho";
    if (wantOrtho !== (this.active === this.ortho)) this.setProjection(display.projection);
    this.applyExplode(display.explode);
    this.applySection(display.sectionOn, display.sectionAxis, display.sectionT);
    this.applyStyle();
    this.syncMeasures();
    this.kick(1);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.host.style.cursor = mode === "navigate" ? "default" : "crosshair";
  }

  setReview(review: ReviewState) {
    this.review = review;
    this.syncMeasures();
    this.kick(1);
  }

  fit(meshIds?: string[]) {
    const box = new THREE.Box3();
    const chosen = meshIds?.length
      ? meshIds.map((id) => this.entries.get(id)?.group).filter((group): group is THREE.Group => !!group)
      : [...this.entries.values()].filter((entry) => entry.group.visible).map((entry) => entry.group);
    const list = chosen.length ? chosen : [...this.entries.values()].map((entry) => entry.group);
    this.modelRoot.updateMatrixWorld(true);
    for (const group of list) box.expandByObject(group);
    if (this.sketchRoot.visible) box.expandByObject(this.sketchRoot);
    if (this.noteRoot.visible) box.expandByObject(this.noteRoot);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.y, size.z, 1e-4) * 0.5;
    const dir = this.active.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-8) dir.copy(VIEW_DIR.iso);
    dir.normalize();
    const dist = this.fitDistance();
    this.controls.target.copy(center);
    this.key.target.position.copy(center);
    this.active.position.copy(center).addScaledVector(dir, dist);
    this.active.up.set(0, 0, 1);
    this.active.lookAt(center);
    this.tuneClip();
    this.applyFrustum(dist);
    if (this.active === this.ortho) {
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
    }
    this.controls.minDistance = this.radius * 0.04;
    this.controls.maxDistance = this.radius * 50;
    this.controls.update();
    this.kick(2);
  }

  view(name: ViewName) {
    const center = this.controls.target.clone();
    const dist = this.fitDistance();
    this.active.up.set(0, 0, 1);
    this.active.position.copy(center).addScaledVector(VIEW_DIR[name], dist);
    this.active.lookAt(center);
    this.applyFrustum(dist);
    if (this.active === this.ortho) {
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
    }
    this.controls.update();
    this.kick(2);
  }

  getCamera(): CameraState {
    const position = this.active.position;
    const target = this.controls.target;
    return {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      up: [0, 0, 1],
      projection: this.active === this.ortho ? "ortho" : "persp",
    };
  }

  restoreCamera(camera: CameraState) {
    this.setProjection(camera.projection);
    this.active.position.set(camera.position[0], camera.position[1], camera.position[2]);
    this.controls.target.set(camera.target[0], camera.target[1], camera.target[2]);
    this.active.up.set(0, 0, 1);
    this.active.lookAt(this.controls.target);
    const dist = this.active.position.distanceTo(this.controls.target);
    this.tuneClip();
    this.applyFrustum(dist);
    this.controls.update();
    this.kick(2);
  }

  snapshot(): string {
    this.renderFrame();
    const source = this.renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return source.toDataURL("image/png");
    ctx.drawImage(source, 0, 0);
    const dpr = this.renderer.getPixelRatio();
    const badge = (world: THREE.Vector3, text: string, fill: string) => {
      const ndc = world.clone().project(this.active);
      if (ndc.z > 1) return;
      const x = (ndc.x * 0.5 + 0.5) * canvas.width;
      const y = (-ndc.y * 0.5 + 0.5) * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 15 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "#101412";
      ctx.stroke();
      ctx.fillStyle = "#101412";
      ctx.font = `600 ${12 * dpr}px "IBM Plex Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    };
    this.modelRoot.updateMatrixWorld(true);
    for (const markup of this.review.markups) {
      badge(this.worldOf(markup.meshId, markup.point), String(markup.index), KIND_COLOR[markup.kind]);
    }
    for (const measure of this.review.measures) {
      const a = this.worldOf(measure.meshA, measure.a);
      const b = this.worldOf(measure.meshB, measure.b);
      badge(a.clone().add(b).multiplyScalar(0.5), `M${measure.index}`, "#e7e4da");
    }
    return canvas.toDataURL("image/png");
  }

  private setProjection(projection: "persp" | "ortho") {
    const next = projection === "ortho" ? this.ortho : this.persp;
    if (next === this.active) return;
    next.position.copy(this.active.position);
    next.up.set(0, 0, 1);
    next.lookAt(this.controls.target);
    const dist = next.position.distanceTo(this.controls.target) || this.fitDistance();
    this.applyFrustum(dist);
    if (next === this.ortho) {
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
    }
    this.active = next;
    this.controls.object = next;
  }

  private fitDistance(): number {
    const aspect = this.persp.aspect || 1;
    const halfFov = (this.persp.fov * Math.PI) / 360;
    const distH = (this.radius * 1.4) / Math.tan(halfFov);
    const distW = distH / Math.max(aspect, 0.2);
    return Math.max(distH, distW);
  }

  private applyFrustum(dist: number) {
    const aspect = Math.max(this.host.clientWidth, 1) / Math.max(this.host.clientHeight, 1);
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.orthoHalf = Math.tan((this.persp.fov * Math.PI) / 360) * dist;
    this.ortho.top = this.orthoHalf;
    this.ortho.bottom = -this.orthoHalf;
    this.ortho.right = this.orthoHalf * aspect;
    this.ortho.left = -this.orthoHalf * aspect;
    this.ortho.updateProjectionMatrix();
  }

  private tuneClip() {
    const radius = Math.max(this.radius, 1e-3);
    this.persp.near = Math.max(radius / 800, 1e-4);
    this.persp.far = radius * 500;
    this.persp.updateProjectionMatrix();
    this.ortho.near = -radius * 80;
    this.ortho.far = radius * 80;
    this.ortho.updateProjectionMatrix();
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 2 || height < 2) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(width, height, false);
    this.persp.aspect = width / height;
    this.persp.updateProjectionMatrix();
    const aspect = width / height;
    this.ortho.top = this.orthoHalf;
    this.ortho.bottom = -this.orthoHalf;
    this.ortho.right = this.orthoHalf * aspect;
    this.ortho.left = -this.orthoHalf * aspect;
    this.ortho.updateProjectionMatrix();
  }

  private buildEntry(mesh: Geometry["meshes"][number]): Entry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.position, 3));
    if (mesh.normal.length === mesh.position.length) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normal, 3));
    }
    if (mesh.index.length) geometry.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

    const fallback = mesh.color
      ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
      : new THREE.Color(0xc4bfb4);
    const materials: THREE.MeshStandardMaterial[] = [this.makeMaterial(fallback, !mesh.color)];
    if (mesh.faces.length) {
      const triangleCount = mesh.index.length / 3;
      let triangle = 0;
      let faceIndex = 0;
      while (triangle < triangleCount) {
        let last = triangleCount;
        let materialIndex = 0;
        if (faceIndex >= mesh.faces.length) {
          last = triangleCount;
          materialIndex = 0;
        } else if (triangle < mesh.faces[faceIndex].first) {
          last = mesh.faces[faceIndex].first;
          materialIndex = 0;
        } else {
          last = mesh.faces[faceIndex].last + 1;
          const color = mesh.faces[faceIndex].color;
          const matColor = color ? new THREE.Color(color[0], color[1], color[2]) : fallback;
          materials.push(this.makeMaterial(matColor, !color));
          materialIndex = materials.length - 1;
          faceIndex += 1;
        }
        if (last <= triangle) last = triangleCount;
        geometry.addGroup(triangle * 3, (last - triangle) * 3, materialIndex);
        triangle = last;
      }
    }

    const threeMesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
    threeMesh.name = mesh.name;
    threeMesh.userData.meshId = mesh.id;
    const edges = this.buildEdges(geometry, mesh.faces);
    const group = new THREE.Group();
    group.add(threeMesh);
    group.add(edges);
    const center = centroid(mesh.position);
    return { id: mesh.id, name: mesh.name, group, mesh: threeMesh, edges, materials, center };
  }

  private makeMaterial(color: THREE.Color, metal: boolean): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal ? 0.22 : 0.04,
      roughness: metal ? 0.46 : 0.55,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }

  private buildEdges(geometry: THREE.BufferGeometry, faces: Geometry["meshes"][number]["faces"]): THREE.Object3D {
    if (!faces.length || faces.length > 400) {
      return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 26), this.edgeMat);
    }
    const group = new THREE.Group();
    const position = geometry.getAttribute("position");
    const source = geometry.getIndex();
    if (!source || !position) return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 26), this.edgeMat);
    for (const face of faces) {
      const start = face.first * 3;
      const count = (face.last - face.first + 1) * 3;
      if (count <= 0) continue;
      const inner = new THREE.BufferGeometry();
      inner.setAttribute("position", position);
      inner.setIndex(new THREE.BufferAttribute(source.array.slice(start, start + count), 1));
      const edges = new THREE.EdgesGeometry(inner, 1);
      inner.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      inner.dispose();
      const line = new THREE.LineSegments(edges, this.edgeMat);
      line.raycast = () => {};
      group.add(line);
    }
    return group;
  }

  private applyStyle() {
    for (const [id, entry] of this.entries) {
      const selected = id === this.selectedId;
      const ghost = this.xray && !selected;
      for (const material of entry.materials) {
        material.wireframe = this.style === "wire";
        material.transparent = ghost || material.opacity < 1;
        material.opacity = ghost ? 0.18 : 1;
        material.depthWrite = !ghost;
        material.emissive.set(selected ? 0x16343c : 0x000000);
        material.emissiveIntensity = selected ? 0.6 : 0;
      }
      entry.edges.visible = this.style === "edges";
      entry.mesh.visible = true;
    }
  }

  private applyExplode(amount: number) {
    if (!this.bounds) return;
    const center = new THREE.Vector3(
      (this.bounds.min[0] + this.bounds.max[0]) / 2,
      (this.bounds.min[1] + this.bounds.max[1]) / 2,
      (this.bounds.min[2] + this.bounds.max[2]) / 2,
    );
    for (const entry of this.entries.values()) {
      if (amount <= 0.001) {
        entry.group.position.set(0, 0, 0);
        continue;
      }
      entry.group.position.copy(entry.center).sub(center).multiplyScalar(amount * 1.6);
    }
  }

  private applySection(on: boolean, axis: "x" | "y" | "z", t: number) {
    const planes = on && this.bounds ? [this.plane] : [];
    if (on && this.bounds) {
      const index = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      const coord = this.bounds.min[index] + THREE.MathUtils.clamp(t, 0, 1) * (this.bounds.max[index] - this.bounds.min[index]);
      const normal = new THREE.Vector3(axis === "x" ? -1 : 0, axis === "y" ? -1 : 0, axis === "z" ? -1 : 0);
      const point = new THREE.Vector3();
      point.setComponent(index, coord);
      this.plane.setFromNormalAndCoplanarPoint(normal, point);
    }
    const side = on ? THREE.DoubleSide : THREE.FrontSide;
    for (const entry of this.entries.values()) {
      for (const material of entry.materials) {
        material.clippingPlanes = planes;
        material.side = side;
      }
    }
    this.edgeMat.clippingPlanes = planes;
    this.faceMat.clippingPlanes = planes;
    this.measureMat.clippingPlanes = planes;
    this.measureGhost.clippingPlanes = planes;
  }

  private setFaceHighlight(meshId: string | null, triangle: number | null) {
    if (this.highlight) {
      const geometry = this.highlight.geometry;
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      geometry.dispose();
      this.highlight.removeFromParent();
      this.highlight = null;
    }
    if (!meshId || triangle == null) return;
    const entry = this.entries.get(meshId);
    const data = this.meshById.get(meshId);
    if (!entry || !data) return;
    const slot = faceSlot(data, triangle);
    const start = (slot ? slot.first : triangle) * 3;
    const end = (slot ? slot.last + 1 : triangle + 1) * 3;
    const sliced = data.index.slice(start, end);
    const position = entry.mesh.geometry.getAttribute("position");
    if (!sliced.length || !position) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setIndex(new THREE.BufferAttribute(sliced, 1));
    const mesh = new THREE.Mesh(geometry, this.faceMat);
    mesh.raycast = () => {};
    entry.group.add(mesh);
    this.highlight = mesh;
  }

  private syncMeasures() {
    this.clearGroup(this.measureRoot);
    this.modelRoot.updateMatrixWorld(true);
    const draw = (meshA: string, a: Vec3, meshB: string, b: Vec3, ghost: boolean) => {
      const geo = new THREE.BufferGeometry().setFromPoints([this.worldOf(meshA, a), this.worldOf(meshB, b)]);
      const line = new THREE.Line(geo, ghost ? this.measureGhost : this.measureMat);
      line.frustumCulled = false;
      this.measureRoot.add(line);
    };
    for (const measure of this.review.measures) draw(measure.meshA, measure.a, measure.meshB, measure.b, false);
    if (this.review.anchor && this.hover) {
      draw(this.review.anchor.meshId, this.review.anchor.point, this.hover.meshId, this.hover.point, true);
    }
  }

  private placeHelpers(bounds: Bounds) {
    disposeHelper(this.grid);
    disposeHelper(this.axes);
    const sx = bounds.max[0] - bounds.min[0];
    const sy = bounds.max[1] - bounds.min[1];
    const sz = bounds.max[2] - bounds.min[2];
    const size = Math.max(sx, sy, sz, 1);
    this.grid = new THREE.GridHelper(size * 2.4, 20, 0x3d4a43, 0x2a3330);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.set((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, bounds.min[2]);
    this.grid.visible = this.showGrid;
    this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(size * 0.38);
    this.axes.position.set(bounds.min[0], bounds.min[1], bounds.min[2]);
    this.axes.visible = this.showAxes;
    this.scene.add(this.axes);
  }

  private pick(clientX: number, clientY: number): PickHit | null {
    const rect = this.host.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.active);
    const targets: THREE.Object3D[] = [];
    for (const entry of this.entries.values()) {
      if (entry.group.visible) targets.push(entry.mesh);
    }
    const hits = raycaster.intersectObjects(targets, false);
    const hit = hits[0];
    if (!hit || !hit.object.userData.meshId) return null;
    const meshId = String(hit.object.userData.meshId);
    const data = this.meshById.get(meshId);
    const local = this.snapPoint(hit, clientX, clientY, rect);
    const normal = new THREE.Vector3();
    if (hit.face) {
      normal.copy(hit.face.normal);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();
    } else {
      normal.set(0, 0, 1);
    }
    return {
      meshId,
      meshName: data?.name || hit.object.name || meshId,
      triangle: hit.faceIndex ?? null,
      point: [local.x, local.y, local.z],
      normal: [normal.x, normal.y, normal.z],
    };
  }

  private snapPoint(hit: THREE.Intersection, clientX: number, clientY: number, rect: DOMRect): THREE.Vector3 {
    const localHit = hit.object.worldToLocal(hit.point.clone());
    const geometry = (hit.object as THREE.Mesh).geometry;
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    if (!position || !index || hit.faceIndex == null) return localHit;
    let best = localHit;
    let bestPx = 16;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index.getX(hit.faceIndex * 3 + corner);
      const candidate = new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      const world = candidate.clone().applyMatrix4(hit.object.matrixWorld).project(this.active);
      const sx = (world.x * 0.5 + 0.5) * rect.width;
      const sy = (-world.y * 0.5 + 0.5) * rect.height;
      const pixels = Math.hypot(sx - px, sy - py);
      if (pixels < bestPx) {
        bestPx = pixels;
        best = candidate;
      }
    }
    return best;
  }

  private worldOf(meshId: string, point: Vec3): THREE.Vector3 {
    const vector = new THREE.Vector3(point[0], point[1], point[2]);
    const entry = this.entries.get(meshId);
    return entry ? vector.applyMatrix4(entry.group.matrixWorld) : vector;
  }

  private renderFrame() {
    if (this.disposed) return;
    this.key.position.copy(this.active.position);
    this.renderer.render(this.scene, this.active);
    this.positionMarkers();
  }

  private positionMarkers() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.modelRoot.updateMatrixWorld(true);
    const nodes = this.overlay.querySelectorAll<HTMLElement>("[data-marker]");
    nodes.forEach((node) => {
      const id = node.dataset.marker || "";
      const world = this.markerWorld(id);
      if (!world) {
        node.hidden = true;
        return;
      }
      const forward = new THREE.Vector3();
      this.active.getWorldDirection(forward);
      const behind = world.clone().sub(this.active.position).dot(forward) <= 0;
      const ndc = world.project(this.active);
      node.hidden = behind;
      if (behind) return;
      const x = (ndc.x * 0.5 + 0.5) * width;
      const y = (-ndc.y * 0.5 + 0.5) * height;
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
  }

  private markerWorld(id: string): THREE.Vector3 | null {
    if (id === "__draft" && this.review.draft) return this.worldOf(this.review.draft.meshId, this.review.draft.point);
    if (id === "__live" && this.review.anchor && this.hover) {
      const a = this.worldOf(this.review.anchor.meshId, this.review.anchor.point);
      const b = this.worldOf(this.hover.meshId, this.hover.point);
      return a.add(b).multiplyScalar(0.5);
    }
    if (id.startsWith("measure-")) {
      const measure = this.review.measures.find((item) => `measure-${item.id}` === id);
      if (!measure) return null;
      const a = this.worldOf(measure.meshA, measure.a);
      const b = this.worldOf(measure.meshB, measure.b);
      return a.add(b).multiplyScalar(0.5);
    }
    const markup = this.review.markups.find((item) => item.id === id);
    if (!markup) return null;
    return this.worldOf(markup.meshId, markup.point);
  }

  private addSketch(sketch: StepSketch) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(sketch.positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: sketch.kind === "plane" ? 0x8ec8d4 : 0xe0b56a,
      depthTest: false,
    });
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = 2;
    this.sketchRoot.add(line);
  }

  private addNote(note: StepNote, index: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(16, 20, 18, 0.92)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e0b56a";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = "#e0b56a";
    ctx.font = "600 34px sans-serif";
    ctx.fillText(note.title || "Note", 28, 62);
    ctx.fillStyle = "#e7e4da";
    ctx.font = "26px sans-serif";
    const words = note.body.split(/\s+/);
    let line = "";
    let y = 112;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 660) {
        ctx.fillText(line, 28, y);
        line = word;
        y += 36;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, 28, y);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    const span = this.modelSpan();
    const width = span * 0.42;
    const height = width * (canvas.height / canvas.width);
    sprite.scale.set(width, height, 1);
    const anchor = note.anchor ?? this.boundsCenter();
    const top = this.bounds ? this.bounds.max[2] : anchor[2];
    sprite.position.set(anchor[0], anchor[1], top + height * 0.65 + index * height * 1.08);
    const leader = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(anchor[0], anchor[1], anchor[2]),
      sprite.position.clone(),
    ]);
    this.noteRoot.add(
      new THREE.Line(leader, new THREE.LineBasicMaterial({ color: 0xe0b56a, depthTest: false })),
    );
    this.noteRoot.add(sprite);
  }

  private modelSpan(): number {
    if (!this.bounds) return 80;
    return Math.max(
      this.bounds.max[0] - this.bounds.min[0],
      this.bounds.max[1] - this.bounds.min[1],
      this.bounds.max[2] - this.bounds.min[2],
      1,
    );
  }

  private boundsCenter(): [number, number, number] {
    if (!this.bounds) return [0, 0, 0];
    return [
      (this.bounds.min[0] + this.bounds.max[0]) / 2,
      (this.bounds.min[1] + this.bounds.max[1]) / 2,
      (this.bounds.min[2] + this.bounds.max[2]) / 2,
    ];
  }

  private clearSupplement() {
    for (const child of [...this.sketchRoot.children, ...this.noteRoot.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material.dispose();
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
  }

  private kick(frames = 1) {
    this.pending = Math.max(this.pending, frames);
    if (this.raf) return;
    const step = () => {
      this.controls.update();
      this.renderFrame();
      this.pending -= 1;
      if (this.pending > 0 && !this.disposed) this.raf = requestAnimationFrame(step);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(step);
  }

  private clearModel() {
    if (this.highlight) {
      this.highlight.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
    for (const entry of this.entries.values()) {
      entry.mesh.geometry.dispose();
      for (const material of entry.materials) material.dispose();
      disposeEdges(entry.edges);
      entry.group.removeFromParent();
    }
    this.entries.clear();
    this.clearGroup(this.measureRoot);
  }

  private clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Line || child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }
  }
}

function centroid(position: Float32Array): THREE.Vector3 {
  const center = new THREE.Vector3();
  const count = position.length / 3;
  if (!count) return center;
  for (let i = 0; i < position.length; i += 3) {
    center.x += position[i];
    center.y += position[i + 1];
    center.z += position[i + 2];
  }
  return center.multiplyScalar(1 / count);
}

function disposeEdges(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.LineSegments) child.geometry.dispose();
  });
}

function disposeHelper(object: THREE.Object3D | null) {
  if (!object) return;
  object.removeFromParent();
  if (object instanceof THREE.LineSegments || object instanceof THREE.Mesh) {
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  }
}
