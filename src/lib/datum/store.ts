import { create } from "zustand";
import { bridge } from "@/lib/datum/bridge";
import { assetUrl, formatOf, sha256, uid } from "@/lib/datum/format";
import { listRecent, loadReview, readFileBlob, saveFileBlob, saveReview } from "@/lib/datum/idb";
import { tessellate } from "@/lib/datum/loadStep";
import { parseIgesMeta, parseStepMeta } from "@/lib/datum/stepMeta";
import { parseStepSupplement } from "@/lib/datum/stepSupplement";
import { session } from "@/lib/datum/session";
import type {
  CameraState,
  DisplayState,
  Draft,
  FileFormat,
  FileInfo,
  Markup,
  MarkupKind,
  MarkupReply,
  Measure,
  MeasureAnchor,
  MobileSheet,
  Mode,
  Packet,
  PanelTab,
  PickHit,
  Quality,
  RecentFile,
  Vec3,
} from "@/lib/datum/types";

export type DatumState = {
  loading: string | null;
  error: string | null;
  banner: string | null;
  file: FileInfo | null;
  geometryRev: number;
  visibility: Record<string, boolean>;
  isolatedNodeId: string | null;
  selectedMeshId: string | null;
  selectedTriangle: number | null;
  markups: Markup[];
  measures: Measure[];
  activeMarkupId: string | null;
  draft: Draft | null;
  measureAnchor: MeasureAnchor | null;
  mode: Mode;
  display: DisplayState;
  author: string;
  hoverText: string;
  recent: RecentFile[];
  panel: PanelTab;
  mobileSheet: MobileSheet;
  packetOffer: Packet | null;
  replyDraft: string;
  shot: { url: string; name: string } | null;
  setBanner: (banner: string | null) => void;
  setAuthor: (author: string) => void;
  setMode: (mode: Mode) => void;
  setPanel: (panel: PanelTab) => void;
  setMobileSheet: (sheet: MobileSheet) => void;
  setHover: (hit: PickHit | null) => void;
  patchDisplay: (patch: Partial<DisplayState>) => void;
  handlePick: (hit: PickHit | null) => void;
  selectMesh: (meshId: string | null, triangle?: number | null) => void;
  toggleVisible: (meshIds: string[]) => void;
  showAll: () => void;
  hideSelected: () => void;
  toggleIsolate: (nodeId: string, meshIds: string[]) => void;
  setDraftField: (patch: Partial<Pick<Draft, "kind" | "title" | "body">>) => void;
  cancelDraft: () => void;
  commitDraft: () => void;
  selectMarkup: (id: string | null) => void;
  toggleResolved: (id: string) => void;
  deleteMarkup: (id: string) => void;
  setReplyDraft: (value: string) => void;
  addReply: (id: string) => void;
  deleteMeasure: (id: string) => void;
  clearMeasureAnchor: () => void;
  openFile: (file: File) => Promise<void>;
  openSample: (fileName: string, label: string) => Promise<void>;
  openRecent: (hash: string) => Promise<void>;
  retessellate: (quality: Quality) => Promise<void>;
  refreshRecent: () => Promise<void>;
  closeFile: () => void;
  importPacket: (packet: Packet, force?: boolean) => void;
  dismissPacketOffer: () => void;
  showShot: (shot: { url: string; name: string }) => void;
  clearShot: () => void;
};

const displayDefault = (): DisplayState => ({
  projection: "persp",
  style: "edges",
  grid: true,
  axes: true,
  sectionOn: false,
  sectionAxis: "z",
  sectionT: 0.5,
  explode: 0,
  unit: "mm",
  quality: "standard",
  xray: false,
  sketches: true,
  fileNotes: true,
});

let saveTimer: number | undefined;

function scheduleSave() {
  if (typeof window === "undefined") return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const state = useDatum.getState();
    if (!state.file) return;
    void saveReview({
      hash: state.file.hash,
      markups: state.markups,
      measures: state.measures,
      unit: state.display.unit,
      updatedAt: Date.now(),
    }).catch(() => undefined);
  }, 400);
}

function nextIndex(items: { index: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.index), 0) + 1;
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isCamera(value: unknown): value is CameraState {
  if (!value || typeof value !== "object") return false;
  const camera = value as CameraState;
  return isVec3(camera.position) && isVec3(camera.target) && (camera.projection === "persp" || camera.projection === "ortho");
}

const KINDS = new Set<MarkupKind>(["note", "question", "issue", "ok"]);

export function parsePacket(text: string): Packet | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Packet>;
  if (raw.datum !== 1 || !raw.file || typeof raw.file !== "object") return null;
  const markups = (Array.isArray(raw.markups) ? raw.markups : [])
    .map((item, index) => sanitizeMarkup(item, index))
    .filter((item): item is Markup => !!item);
  const measures = (Array.isArray(raw.measures) ? raw.measures : [])
    .map((item, index) => sanitizeMeasure(item, index))
    .filter((item): item is Measure => !!item);
  return {
    datum: 1,
    file: {
      name: String(raw.file.name || "model"),
      hash: String(raw.file.hash || ""),
      size: Number(raw.file.size || 0),
    },
    unit: raw.unit === "in" ? "in" : "mm",
    markups,
    measures,
    camera: isCamera(raw.camera) ? raw.camera : null,
  };
}

function sanitizeMarkup(value: unknown, index: number): Markup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Markup>;
  if (!isVec3(raw.point)) return null;
  const kind = KINDS.has(raw.kind as MarkupKind) ? (raw.kind as MarkupKind) : "note";
  const replies = (Array.isArray(raw.replies) ? raw.replies : [])
    .map((reply) => {
      if (!reply || typeof reply !== "object") return null;
      const item = reply as Partial<MarkupReply>;
      if (!item.body) return null;
      return {
        id: item.id || uid(),
        author: item.author || "Reviewer",
        body: String(item.body),
        createdAt: item.createdAt || Date.now(),
      } satisfies MarkupReply;
    })
    .filter((reply): reply is MarkupReply => !!reply);
  return {
    id: raw.id || uid(),
    index: typeof raw.index === "number" ? raw.index : index + 1,
    kind,
    title: raw.title || "",
    body: raw.body || "",
    meshId: raw.meshId || "",
    meshName: raw.meshName || "Solid",
    point: raw.point,
    normal: isVec3(raw.normal) ? raw.normal : [0, 0, 1],
    camera: isCamera(raw.camera) ? raw.camera : null,
    author: raw.author || "Reviewer",
    createdAt: raw.createdAt || Date.now(),
    resolved: !!raw.resolved,
    replies,
  };
}

function sanitizeMeasure(value: unknown, index: number): Measure | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Measure>;
  if (!isVec3(raw.a) || !isVec3(raw.b)) return null;
  return {
    id: raw.id || uid(),
    index: typeof raw.index === "number" ? raw.index : index + 1,
    meshA: raw.meshA || "",
    meshB: raw.meshB || "",
    a: raw.a,
    b: raw.b,
    createdAt: raw.createdAt || Date.now(),
  };
}

async function decodeMeta(buffer: ArrayBuffer, format: FileFormat) {
  const slice = buffer.byteLength > 12_000_000 ? buffer.slice(0, 8_000_000) : buffer;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  return format === "iges" ? parseIgesMeta(text) : parseStepMeta(text);
}

export const useDatum = create<DatumState>((set, get) => ({
  loading: null,
  error: null,
  banner: null,
  file: null,
  geometryRev: 0,
  visibility: {},
  isolatedNodeId: null,
  selectedMeshId: null,
  selectedTriangle: null,
  markups: [],
  measures: [],
  activeMarkupId: null,
  draft: null,
  measureAnchor: null,
  mode: "navigate",
  display: displayDefault(),
  author: "",
  hoverText: "",
  recent: [],
  panel: "notes",
  mobileSheet: null,
  packetOffer: null,
  replyDraft: "",
  shot: null,

  setBanner: (banner) => set({ banner }),
  setAuthor: (author) => {
    set({ author });
    try {
      localStorage.setItem("datum-author", author);
    } catch {
      /* private mode */
    }
  },
  setMode: (mode) =>
    set({
      mode,
      measureAnchor: mode === "measure" ? get().measureAnchor : null,
      draft: mode === "note" ? get().draft : null,
    }),
  setPanel: (panel) => set({ panel }),
  setMobileSheet: (mobileSheet) => set({ mobileSheet }),
  setHover: (hit) => {
    const unit = get().display.unit;
    const hoverText = hit
      ? `${hit.meshName}  ${hit.point.map((n) => (unit === "in" ? n / 25.4 : n).toFixed(unit === "in" ? 4 : 2)).join(", ")} ${unit}`
      : "";
    if (hoverText === get().hoverText) return;
    set({ hoverText });
  },
  patchDisplay: (patch) => {
    const display = { ...get().display, ...patch };
    set({ display });
    if (patch.unit) scheduleSave();
  },
  handlePick: (hit) => {
    const state = get();
    if (state.mode === "note") {
      if (!hit) return;
      set({
        draft: {
          meshId: hit.meshId,
          meshName: hit.meshName,
          point: hit.point,
          normal: hit.normal,
          kind: state.draft?.kind ?? "note",
          title: state.draft?.title ?? "",
          body: state.draft?.body ?? "",
        },
        selectedMeshId: hit.meshId,
        selectedTriangle: hit.triangle,
        panel: "notes",
        mobileSheet: "review",
      });
      return;
    }
    if (state.mode === "measure") {
      if (!hit) return;
      if (!state.measureAnchor) {
        set({
          measureAnchor: { meshId: hit.meshId, meshName: hit.meshName, point: hit.point },
          panel: "measures",
          mobileSheet: "review",
        });
        return;
      }
      const measure: Measure = {
        id: uid(),
        index: nextIndex(state.measures),
        meshA: state.measureAnchor.meshId,
        meshB: hit.meshId,
        a: state.measureAnchor.point,
        b: hit.point,
        createdAt: Date.now(),
      };
      set({ measures: [...state.measures, measure], measureAnchor: null, panel: "measures" });
      scheduleSave();
      return;
    }
    if (!hit) {
      set({ selectedMeshId: null, selectedTriangle: null });
      return;
    }
    set({ selectedMeshId: hit.meshId, selectedTriangle: hit.triangle });
  },
  selectMesh: (meshId, triangle = null) => set({ selectedMeshId: meshId, selectedTriangle: triangle }),
  toggleVisible: (meshIds) => {
    const visibility = { ...get().visibility };
    const allShown = meshIds.every((id) => visibility[id] !== false);
    for (const id of meshIds) visibility[id] = !allShown;
    set({ visibility });
  },
  showAll: () => set({ visibility: {}, isolatedNodeId: null }),
  hideSelected: () => {
    const id = get().selectedMeshId;
    if (!id) return;
    set({ visibility: { ...get().visibility, [id]: false }, selectedMeshId: null, selectedTriangle: null });
  },
  toggleIsolate: (nodeId, _meshIds) => {
    set({ isolatedNodeId: get().isolatedNodeId === nodeId ? null : nodeId });
  },
  setDraftField: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, ...patch } });
  },
  cancelDraft: () => set({ draft: null }),
  commitDraft: () => {
    const state = get();
    const draft = state.draft;
    if (!draft || (!draft.body.trim() && !draft.title.trim())) return;
    const markup: Markup = {
      id: uid(),
      index: nextIndex(state.markups),
      kind: draft.kind,
      title: draft.title.trim(),
      body: draft.body.trim(),
      meshId: draft.meshId,
      meshName: draft.meshName,
      point: draft.point,
      normal: draft.normal,
      camera: bridge.getCamera(),
      author: state.author.trim() || "Reviewer",
      createdAt: Date.now(),
      resolved: false,
      replies: [],
    };
    set({
      markups: [...state.markups, markup],
      draft: null,
      activeMarkupId: markup.id,
      mode: "navigate",
      banner: `Pin #${markup.index} saved on ${markup.meshName}.`,
    });
    scheduleSave();
  },
  selectMarkup: (id) => {
    const markup = get().markups.find((item) => item.id === id);
    set({
      activeMarkupId: id,
      panel: "notes",
      selectedMeshId: markup?.meshId ?? get().selectedMeshId,
    });
    if (markup?.camera) bridge.restoreCamera(markup.camera);
  },
  toggleResolved: (id) => {
    set({
      markups: get().markups.map((item) => (item.id === id ? { ...item, resolved: !item.resolved } : item)),
    });
    scheduleSave();
  },
  deleteMarkup: (id) => {
    set({
      markups: get().markups.filter((item) => item.id !== id),
      activeMarkupId: get().activeMarkupId === id ? null : get().activeMarkupId,
    });
    scheduleSave();
  },
  setReplyDraft: (replyDraft) => set({ replyDraft }),
  addReply: (id) => {
    const body = get().replyDraft.trim();
    if (!body) return;
    const reply: MarkupReply = {
      id: uid(),
      author: get().author.trim() || "Reviewer",
      body,
      createdAt: Date.now(),
    };
    set({
      replyDraft: "",
      markups: get().markups.map((item) => (item.id === id ? { ...item, replies: [...item.replies, reply] } : item)),
    });
    scheduleSave();
  },
  deleteMeasure: (id) => {
    set({ measures: get().measures.filter((item) => item.id !== id) });
    scheduleSave();
  },
  clearMeasureAnchor: () => set({ measureAnchor: null }),
  refreshRecent: async () => {
    try {
      const recent = await listRecent();
      set({ recent });
    } catch {
      set({ recent: [] });
    }
  },
  openFile: async (file) => {
    const buffer = await file.arrayBuffer();
    const head = new TextDecoder().decode(buffer.slice(0, 64)).trim();
    if (file.name.toLowerCase().endsWith(".json") || head.startsWith("{")) {
      const packet = parsePacket(new TextDecoder().decode(buffer));
      if (!packet) {
        set({ error: "That JSON is not a Datum review packet." });
        return;
      }
      get().importPacket(packet);
      return;
    }
    const format = formatOf(file.name);
    if (format !== "step" && format !== "iges") {
      set({ error: "Open a .step, .stp, .iges, .igs file, or a Datum .json packet." });
      return;
    }
    await loadBuffer(set, get, { name: file.name, buffer, format });
  },
  openSample: async (fileName, label) => {
    set({ loading: "Fetching sample…", error: null });
    const response = await fetch(assetUrl(`/samples/${fileName}`));
    if (!response.ok) {
      set({ loading: null, error: "The sample model could not be fetched." });
      return;
    }
    const buffer = await response.arrayBuffer();
    await loadBuffer(set, get, { name: label.endsWith(".stp") || label.includes(".") ? fileName : fileName, buffer, format: "step" });
  },
  openRecent: async (hash) => {
    set({ loading: "Opening saved file…", error: null });
    const row = await readFileBlob(hash);
    if (!row) {
      set({ loading: null, error: "That recent file is no longer in this browser." });
      return;
    }
    await loadBuffer(set, get, { name: row.meta.name, buffer: row.buffer, format: row.meta.format });
  },
  retessellate: async (quality) => {
    const state = get();
    if (!session.buffer || !state.file) return;
    set({ display: { ...state.display, quality }, loading: "Re-tessellating…", error: null });
    try {
      const geometry = await tessellate(session.buffer, state.file.format, quality, (message) => set({ loading: message }));
      session.geometry = geometry;
      set({ loading: null, geometryRev: get().geometryRev + 1, banner: `Tessellation set to ${quality}.` });
    } catch (error) {
      set({ loading: null, error: error instanceof Error ? error.message : "Re-tessellation failed." });
    }
  },
  closeFile: () => {
    session.buffer = null;
    session.geometry = null;
    set({
      file: null,
      geometryRev: get().geometryRev + 1,
      visibility: {},
      isolatedNodeId: null,
      selectedMeshId: null,
      selectedTriangle: null,
      markups: [],
      measures: [],
      draft: null,
      measureAnchor: null,
      activeMarkupId: null,
      mode: "navigate",
      error: null,
      loading: null,
      hoverText: "",
    });
  },
  importPacket: (packet, force = false) => {
    const file = get().file;
    if (!file) {
      set({
        packetOffer: packet,
        banner: `Holding a review for ${packet.file.name}. Open that STEP file and the pins can be applied.`,
        panel: "notes",
      });
      return;
    }
    if (!force && packet.file.hash && packet.file.hash !== file.hash) {
      set({
        packetOffer: packet,
        banner: `This review was made for ${packet.file.name}. The open file hash does not match.`,
      });
      return;
    }
    applyPacket(set, packet);
  },
  dismissPacketOffer: () => set({ packetOffer: null, banner: null }),
  showShot: (shot) => {
    const previous = get().shot;
    if (previous && previous.url !== shot.url) URL.revokeObjectURL(previous.url);
    set({ shot, mobileSheet: null });
  },
  clearShot: () => {
    const previous = get().shot;
    if (previous) URL.revokeObjectURL(previous.url);
    set({ shot: null });
  },
}));

function applyPacket(
  set: (partial: Partial<DatumState> | ((state: DatumState) => Partial<DatumState>)) => void,
  packet: Packet,
) {
  set((state) => ({
    markups: packet.markups,
    measures: packet.measures,
    display: { ...state.display, unit: packet.unit },
    packetOffer: null,
    panel: "notes",
    mobileSheet: "review",
    activeMarkupId: packet.markups[0]?.id ?? null,
    banner: `Applied ${packet.markups.length} pins and ${packet.measures.length} measures.`,
  }));
  if (packet.camera) bridge.restoreCamera(packet.camera);
  scheduleSave();
}

async function loadBuffer(
  set: (partial: Partial<DatumState> | ((state: DatumState) => Partial<DatumState>)) => void,
  get: () => DatumState,
  source: { name: string; buffer: ArrayBuffer; format: FileFormat },
) {
  set({ loading: "Reading file…", error: null, banner: null });
  try {
    const hash = await sha256(source.buffer);
    const meta = await decodeMeta(source.buffer, source.format);
    const review = await loadReview(hash).catch(() => null);
    session.buffer = source.buffer;
    const quality = get().display.quality;
    const geometry = await tessellate(source.buffer, source.format, quality, (message) => set({ loading: message }));
    session.geometry = geometry;
    session.supplement =
      source.format === "step" && source.buffer.byteLength < 25_000_000
        ? parseStepSupplement(new TextDecoder("utf-8", { fatal: false }).decode(source.buffer), meta.nativeUnit)
        : null;
    const file: FileInfo = {
      name: source.name,
      size: source.buffer.byteLength,
      hash,
      format: source.format,
      meta,
    };
    const unit = review?.unit ?? (meta.nativeUnit === "in" ? "in" : "mm");
    const offer = get().packetOffer;
    const offerMatches = offer && (!offer.file.hash || offer.file.hash === hash);
    set({
      loading: null,
      file,
      geometryRev: get().geometryRev + 1,
      visibility: {},
      isolatedNodeId: null,
      selectedMeshId: null,
      selectedTriangle: null,
      markups: offerMatches && offer ? offer.markups : (review?.markups ?? []),
      measures: offerMatches && offer ? offer.measures : (review?.measures ?? []),
      draft: null,
      measureAnchor: null,
      activeMarkupId: null,
      mode: "navigate",
      hoverText: "",
      packetOffer: offerMatches ? null : offer,
      display: { ...get().display, unit },
      banner: offerMatches
        ? "Applied the review packet that was waiting."
        : review
          ? "Restored pins saved in this browser for this file."
          : null,
    });
    void saveFileBlob(
      { hash, name: source.name, size: source.buffer.byteLength, format: source.format, openedAt: Date.now() },
      source.buffer,
    )
      .then(() => get().refreshRecent())
      .catch(() => undefined);
  } catch (error) {
    set({ loading: null, error: error instanceof Error ? error.message : "Could not open that file." });
  }
}
