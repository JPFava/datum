import { Camera, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { bridge } from "@/lib/datum/bridge";
import {
  cx,
  fmtArea,
  fmtBytes,
  fmtLen,
  fmtVec,
  fmtVol,
  kindLabel,
  schemaLabel,
  unitLabel,
} from "@/lib/datum/format";
import { descendantMeshIds, faceSlot, span } from "@/lib/datum/geometry";
import { session } from "@/lib/datum/session";
import { copyBriefing, copyView, downloadPacket } from "@/lib/datum/share";
import { useDatum } from "@/lib/datum/store";
import type { MarkupKind, TreeNode } from "@/lib/datum/types";
import { SAMPLES } from "@/lib/datum/types";
import { SectionLabel, ToolButton } from "@/components/datum/ui";

const KIND_IDLE: Record<MarkupKind, string> = {
  note: "border-bronze/40 text-bronze",
  question: "border-steel/40 text-steel",
  issue: "border-issue/40 text-issue",
  ok: "border-ok/40 text-ok",
};

const KIND_ON: Record<MarkupKind, string> = {
  note: "border-bronze bg-bronze text-bg",
  question: "border-steel bg-steel text-bg",
  issue: "border-issue bg-issue text-bg",
  ok: "border-ok bg-ok text-bg",
};

export function LeftPanel() {
  const geometryRev = useDatum((state) => state.geometryRev);
  const file = useDatum((state) => state.file);
  const recent = useDatum((state) => state.recent);
  const display = useDatum((state) => state.display);
  const loading = useDatum((state) => state.loading);
  const geometry = geometryRev >= 0 ? session.geometry : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SectionLabel>Samples</SectionLabel>
        <ul className="px-2">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                disabled={!!loading}
                onClick={() => void useDatum.getState().openSample(sample.file, sample.name)}
                className="flex min-h-11 w-full items-baseline justify-between gap-3 rounded-md px-2 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <span>{sample.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{sample.note}</span>
              </button>
            </li>
          ))}
        </ul>
        {recent.length ? (
          <>
            <SectionLabel>Recent in this browser</SectionLabel>
            <ul className="px-2">
              {recent.map((item) => (
                <li key={item.hash}>
                  <button
                    type="button"
                    disabled={!!loading}
                    onClick={() => void useDatum.getState().openRecent(item.hash)}
                    className="flex min-h-11 w-full items-baseline justify-between gap-3 rounded-md px-2 text-left hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{fmtBytes(item.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <SectionLabel>Structure</SectionLabel>
        {geometry && file ? (
          <div className="px-1 pb-3">
            <div className="mb-1 flex gap-2 px-2">
              <button
                type="button"
                className="text-xs text-steel hover:underline"
                onClick={() => useDatum.getState().showAll()}
              >
                Show all
              </button>
              <button type="button" className="text-xs text-steel hover:underline" onClick={() => bridge.fit()}>
                Fit all
              </button>
            </div>
            <TreeRows node={geometry.tree} depth={0} />
          </div>
        ) : (
          <p className="px-3 pb-3 text-muted">Open a model to see its solids.</p>
        )}
      </div>
      <div className="max-h-[50%] shrink-0 overflow-y-auto border-t border-line">
        <SectionLabel>Display</SectionLabel>
        <div className="flex flex-wrap gap-2 px-3 pb-2">
          {(
            [
              ["shaded", "Shaded"],
              ["edges", "Edges"],
              ["wire", "Wire"],
            ] as const
          ).map(([style, label]) => (
            <ToolButton
              key={style}
              className="h-9 px-2 text-xs"
              active={display.style === style}
              onClick={() => useDatum.getState().patchDisplay({ style })}
            >
              {label}
            </ToolButton>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          <ToolButton
            className="h-9 px-2 text-xs"
            active={display.projection === "ortho"}
            onClick={() =>
              useDatum.getState().patchDisplay({
                projection: display.projection === "ortho" ? "persp" : "ortho",
              })
            }
          >
            {display.projection === "ortho" ? "Ortho" : "Perspective"}
          </ToolButton>
          <ToolButton
            className="h-9 px-2 text-xs"
            active={display.grid}
            onClick={() => useDatum.getState().patchDisplay({ grid: !display.grid })}
          >
            Grid
          </ToolButton>
          <ToolButton
            className="h-9 px-2 text-xs"
            active={display.axes}
            onClick={() => useDatum.getState().patchDisplay({ axes: !display.axes })}
          >
            Axes
          </ToolButton>
          <ToolButton
            className="h-9 px-2 text-xs"
            active={display.xray}
            onClick={() => useDatum.getState().patchDisplay({ xray: !display.xray })}
          >
            X-ray
          </ToolButton>
          {session.supplement?.sketches.length ? (
            <ToolButton
              className="h-9 px-2 text-xs"
              active={display.sketches}
              onClick={() => useDatum.getState().patchDisplay({ sketches: !display.sketches })}
            >
              Sketches
            </ToolButton>
          ) : null}
          {session.supplement?.notes.length ? (
            <ToolButton
              className="h-9 px-2 text-xs"
              active={display.fileNotes}
              onClick={() => useDatum.getState().patchDisplay({ fileNotes: !display.fileNotes })}
            >
              File notes
            </ToolButton>
          ) : null}
        </div>
        <label className="block px-3 pb-3 text-xs text-muted">
          <span className="mb-1 flex items-center justify-between">
            <span>Section</span>
            <button
              type="button"
              className="text-steel"
              onClick={() => useDatum.getState().patchDisplay({ sectionOn: !display.sectionOn })}
            >
              {display.sectionOn ? "On" : "Off"}
            </button>
          </span>
          <span className="mb-2 flex gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                disabled={!display.sectionOn}
                onClick={() => useDatum.getState().patchDisplay({ sectionAxis: axis })}
                className={cx(
                  "h-8 flex-1 rounded-md border font-mono uppercase disabled:opacity-40",
                  display.sectionAxis === axis ? "border-bronze text-bronze" : "border-line",
                )}
              >
                {axis}
              </button>
            ))}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={display.sectionT}
            disabled={!display.sectionOn}
            onChange={(event) => useDatum.getState().patchDisplay({ sectionT: Number(event.target.value) })}
            className="w-full accent-bronze disabled:opacity-40"
          />
        </label>
        <label className="block px-3 pb-4 text-xs text-muted">
          <span className="mb-1 flex justify-between">
            <span>Explode</span>
            <span className="font-mono tabular-nums">{Math.round(display.explode * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={display.explode}
            onChange={(event) => useDatum.getState().patchDisplay({ explode: Number(event.target.value) })}
            className="w-full accent-bronze"
          />
        </label>
      </div>
    </div>
  );
}

function TreeRows({ node, depth }: { node: TreeNode; depth: number }) {
  const visibility = useDatum((state) => state.visibility);
  const isolatedNodeId = useDatum((state) => state.isolatedNodeId);
  const selectedMeshId = useDatum((state) => state.selectedMeshId);
  const ids = descendantMeshIds(node);
  const hidden = ids.length > 0 && ids.every((id) => visibility[id] === false);
  const selected = !!selectedMeshId && ids.includes(selectedMeshId);
  const pad = ["pl-2", "pl-5", "pl-8", "pl-11"][Math.min(depth, 3)];
  return (
    <>
      <div className={cx("flex min-h-11 items-center gap-1 pr-2", pad, selected && "bg-surface-2")}>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => {
            useDatum.getState().selectMesh(ids[0] ?? null, null);
            if (ids.length) bridge.fit(ids);
          }}
        >
          <span className={hidden ? "text-muted line-through" : ""}>{node.name || "Model"}</span>
          {ids.length ? <span className="ml-2 font-mono text-xs text-muted">{ids.length}</span> : null}
        </button>
        {ids.length ? (
          <button
            type="button"
            className={cx("px-1 text-xs", isolatedNodeId === node.id ? "text-bronze" : "text-muted")}
            onClick={() => useDatum.getState().toggleIsolate(node.id, ids)}
          >
            Solo
          </button>
        ) : null}
        {ids.length ? (
          <button
            type="button"
            aria-label={hidden ? "Show" : "Hide"}
            className="inline-flex size-9 items-center justify-center text-muted hover:text-fg"
            onClick={() => useDatum.getState().toggleVisible(ids)}
          >
            {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
      {node.children.map((child) => (
        <TreeRows key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function RightPanel() {
  const panel = useDatum((state) => state.panel);
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-sm">
      <div className="grid shrink-0 grid-cols-3 border-b border-line">
        {(
          [
            ["notes", "Notes"],
            ["measures", "Measures"],
            ["part", "Part"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => useDatum.getState().setPanel(id)}
            className={cx(
              "h-11 border-b-2 text-sm",
              panel === id ? "border-bronze text-bronze" : "border-transparent text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "notes" ? <NotesTab /> : null}
        {panel === "measures" ? <MeasuresTab /> : null}
        {panel === "part" ? <PartTab /> : null}
      </div>
    </div>
  );
}

function NotesTab() {
  const markups = useDatum((state) => state.markups);
  const draft = useDatum((state) => state.draft);
  const author = useDatum((state) => state.author);
  const activeMarkupId = useDatum((state) => state.activeMarkupId);
  const replyDraft = useDatum((state) => state.replyDraft);
  const unit = useDatum((state) => state.display.unit);
  const mode = useDatum((state) => state.mode);
  const file = useDatum((state) => state.file);
  const geometryRev = useDatum((state) => state.geometryRev);
  const fileNotes = geometryRev >= 0 ? (session.supplement?.notes ?? []) : [];

  return (
    <div className="px-3 py-3">
      <div className="mb-4 rounded-md border border-line bg-bg p-3">
        <p className="text-xs text-muted">Send this view</p>
        <div className="mt-2 flex flex-col gap-2">
          <ToolButton className="w-full" disabled={!file} onClick={() => void copyBriefing()}>
            <Copy className="size-4" />
            Copy briefing
          </ToolButton>
          <ToolButton className="w-full" disabled={!file} onClick={() => void copyView()}>
            <Camera className="size-4" />
            Show picture
          </ToolButton>
          <ToolButton className="w-full" disabled={!file} onClick={downloadPacket}>
            Download packet
          </ToolButton>
        </div>
        <p className="mt-2 text-xs text-pretty text-muted">
          Briefing is the notes as text. Show picture opens the view so you can right-click it and choose Save image as.
          Packet is the same notes as a .datum.json file.
        </p>
      </div>
      {fileNotes.length ? (
        <div className="mb-4 rounded-md border border-line bg-bg p-3">
          <p className="text-xs text-muted">In the STEP file</p>
          {fileNotes.map((note) => (
            <div key={`${note.title}-${note.body.slice(0, 24)}`} className="mt-2">
              <p className="font-medium">{note.title}</p>
              <p className="text-sm text-pretty">{note.body}</p>
            </div>
          ))}
          <p className="mt-2 text-xs text-pretty text-muted">
            These notes belong to the file. Pins you add stay in this browser and are not written back into the STEP.
          </p>
        </div>
      ) : null}
      <label className="mb-3 block text-xs text-muted">
        Name on pins
        <input
          value={author}
          onChange={(event) => useDatum.getState().setAuthor(event.target.value)}
          placeholder="Reviewer"
          className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-2 text-sm text-fg"
        />
      </label>
      <ToolButton
        className="mb-3 w-full"
        active={mode === "note"}
        onClick={() => useDatum.getState().setMode(mode === "note" ? "navigate" : "note")}
      >
        {mode === "note" ? "Click the model to place a pin" : "Place a pin"}
      </ToolButton>
      {draft ? (
        <div className="mb-4 rounded-md border border-bronze/50 bg-bg p-3">
          <p className="mb-2 font-mono text-xs text-bronze">
            {draft.meshName} · {fmtVec(draft.point, unit)}
          </p>
          <div className="mb-2 grid grid-cols-4 gap-1">
            {(["note", "question", "issue", "ok"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => useDatum.getState().setDraftField({ kind })}
                className={cx(
                  "h-9 rounded-md border text-xs",
                  draft.kind === kind ? KIND_ON[kind] : KIND_IDLE[kind],
                )}
              >
                {kindLabel(kind)}
              </button>
            ))}
          </div>
          <input
            value={draft.title}
            onChange={(event) => useDatum.getState().setDraftField({ title: event.target.value })}
            placeholder="Short title"
            className="mb-2 h-10 w-full rounded-md border border-line bg-surface px-2"
          />
          <textarea
            value={draft.body}
            onChange={(event) => useDatum.getState().setDraftField({ body: event.target.value })}
            placeholder="What should we look at here?"
            rows={3}
            className="mb-2 w-full rounded-md border border-line bg-surface px-2 py-2"
          />
          <div className="flex gap-2">
            <ToolButton className="flex-1" onClick={() => useDatum.getState().commitDraft()}>
              Save pin
            </ToolButton>
            <ToolButton onClick={() => useDatum.getState().cancelDraft()}>Cancel</ToolButton>
          </div>
        </div>
      ) : null}
      {markups.length === 0 ? (
        <p className="text-pretty text-muted">
          Pins stay with the file in this browser. Copy a briefing when you want to talk through the model.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...markups]
            .sort((a, b) => a.index - b.index)
            .map((markup) => {
              const open = markup.id === activeMarkupId;
              return (
                <li key={markup.id} className="rounded-md border border-line bg-bg">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-2 py-2 text-left"
                    onClick={() => useDatum.getState().selectMarkup(markup.id)}
                  >
                    <span
                      className={cx(
                        "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs",
                        KIND_ON[markup.kind],
                      )}
                    >
                      {markup.index}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block", markup.resolved && "text-muted line-through")}>
                        {markup.title || markup.body || kindLabel(markup.kind)}
                      </span>
                      <span className="font-mono text-xs text-muted">
                        {markup.meshName} · {fmtVec(markup.point, "mm")}
                      </span>
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-line px-3 py-2">
                      {markup.body ? <p className="mb-2 text-pretty whitespace-pre-wrap">{markup.body}</p> : null}
                      <p className="mb-2 text-xs text-muted">
                        {markup.author} · {new Date(markup.createdAt).toLocaleString()}
                      </p>
                      <ul className="mb-2 flex flex-col gap-1">
                        {markup.replies.map((reply) => (
                          <li key={reply.id} className="rounded-md bg-surface px-2 py-1">
                            <span className="text-xs text-muted">{reply.author}: </span>
                            {reply.body}
                          </li>
                        ))}
                      </ul>
                      <div className="mb-2 flex gap-2">
                        <input
                          value={replyDraft}
                          onChange={(event) => useDatum.getState().setReplyDraft(event.target.value)}
                          placeholder="Reply"
                          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-2"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") useDatum.getState().addReply(markup.id);
                          }}
                        />
                        <ToolButton className="h-10" onClick={() => useDatum.getState().addReply(markup.id)}>
                          Send
                        </ToolButton>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-steel"
                          onClick={() => useDatum.getState().toggleResolved(markup.id)}
                        >
                          {markup.resolved ? "Reopen" : "Resolve"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-issue"
                          onClick={() => useDatum.getState().deleteMarkup(markup.id)}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

function MeasuresTab() {
  const measures = useDatum((state) => state.measures);
  const anchor = useDatum((state) => state.measureAnchor);
  const unit = useDatum((state) => state.display.unit);
  const mode = useDatum((state) => state.mode);
  return (
    <div className="px-3 py-3">
      <ToolButton
        className="mb-3 w-full"
        active={mode === "measure"}
        onClick={() => useDatum.getState().setMode(mode === "measure" ? "navigate" : "measure")}
      >
        {mode === "measure" ? "Click two points" : "Measure distance"}
      </ToolButton>
      {anchor ? (
        <p className="mb-3 text-xs text-bronze">
          First point on {anchor.meshName}. Click the second point, or press Esc.
        </p>
      ) : (
        <p className="mb-3 text-muted">
          Snaps to a nearby corner of the triangle you click. Distance is in the model frame, not the exploded view.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {measures.map((measure) => (
          <li key={measure.id} className="flex items-start justify-between gap-2 rounded-md border border-line bg-bg px-2 py-2">
            <div>
              <p className="font-mono tabular-nums">
                M{measure.index} {fmtLen(Math.hypot(measure.a[0] - measure.b[0], measure.a[1] - measure.b[1], measure.a[2] - measure.b[2]), unit)}
              </p>
              <p className="font-mono text-xs text-muted">
                {fmtVec(measure.a, "mm")} → {fmtVec(measure.b, "mm")}
              </p>
            </div>
            <button
              type="button"
              aria-label="Delete measure"
              className="inline-flex size-9 items-center justify-center text-muted hover:text-issue"
              onClick={() => useDatum.getState().deleteMeasure(measure.id)}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartTab() {
  const geometryRev = useDatum((state) => state.geometryRev);
  const file = useDatum((state) => state.file);
  const display = useDatum((state) => state.display);
  const selectedMeshId = useDatum((state) => state.selectedMeshId);
  const selectedTriangle = useDatum((state) => state.selectedTriangle);
  const loading = useDatum((state) => state.loading);
  const geometry = geometryRev >= 0 ? session.geometry : null;
  if (!file || !geometry) {
    return <p className="px-3 py-3 text-muted">No model open.</p>;
  }
  const size = span(geometry.bounds);
  const mesh = geometry.meshes.find((item) => item.id === selectedMeshId) ?? null;
  const face = mesh && selectedTriangle != null ? faceSlot(mesh, selectedTriangle) : null;
  return (
    <div className="px-3 py-3">
      <h2 className="text-balance text-base font-medium">{file.name}</h2>
      <p className="mt-1 font-mono text-xs text-muted">
        {schemaLabel(file.meta.schema)} · {fmtBytes(file.size)} · {file.hash.slice(0, 12)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <dt className="text-muted">Native unit</dt>
        <dd>{unitLabel(file.meta.nativeUnit)}</dd>
        <dt className="text-muted">Shown as</dt>
        <dd className="flex gap-2">
          <button
            type="button"
            className={display.unit === "mm" ? "text-bronze" : "text-fg"}
            onClick={() => useDatum.getState().patchDisplay({ unit: "mm" })}
          >
            mm
          </button>
          <button
            type="button"
            className={display.unit === "in" ? "text-bronze" : "text-fg"}
            onClick={() => useDatum.getState().patchDisplay({ unit: "in" })}
          >
            in
          </button>
        </dd>
        <dt className="text-muted">Solids</dt>
        <dd className="tabular-nums">{geometry.meshes.length}</dd>
        <dt className="text-muted">Triangles</dt>
        <dd className="tabular-nums">{geometry.triangles.toLocaleString()}</dd>
        {session.supplement?.sketches.length ? (
          <>
            <dt className="text-muted">Sketches</dt>
            <dd className="tabular-nums">{session.supplement.sketches.length}</dd>
          </>
        ) : null}
        <dt className="text-muted">Box X</dt>
        <dd className="font-mono">{fmtLen(size[0], display.unit)}</dd>
        <dt className="text-muted">Box Y</dt>
        <dd className="font-mono">{fmtLen(size[1], display.unit)}</dd>
        <dt className="text-muted">Box Z</dt>
        <dd className="font-mono">{fmtLen(size[2], display.unit)}</dd>
        <dt className="text-muted">Area est.</dt>
        <dd className="font-mono">{fmtArea(geometry.area, display.unit)}</dd>
        <dt className="text-muted">Volume est.</dt>
        <dd className="font-mono">{fmtVol(geometry.volume, display.unit)}</dd>
      </dl>
      {file.meta.originating ? (
        <p className="mt-3 text-xs text-muted">From {file.meta.originating}</p>
      ) : null}
      {file.meta.products.length ? (
        <p className="mt-1 text-xs text-muted">Products: {file.meta.products.join(", ")}</p>
      ) : null}
      <div className="mt-4 rounded-md border border-line bg-bg p-3">
        <p className="text-xs text-muted">Selection</p>
        {mesh ? (
          <>
            <p className="mt-1">{mesh.name}</p>
            <p className="font-mono text-xs text-muted">
              {face ? `Face ${face.index + 1}` : "Solid"}
              {selectedTriangle != null ? ` · triangle ${selectedTriangle}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ToolButton className="h-9 text-xs" onClick={() => bridge.fit([mesh.id])}>
                Fit
              </ToolButton>
              <ToolButton className="h-9 text-xs" onClick={() => useDatum.getState().hideSelected()}>
                Hide
              </ToolButton>
            </div>
          </>
        ) : (
          <p className="mt-1 text-muted">Click a solid to select it. The face under the cursor is highlighted.</p>
        )}
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs text-muted">Tessellation</p>
        <div className="flex gap-2">
          {(["coarse", "standard", "fine"] as const).map((quality) => (
            <ToolButton
              key={quality}
              className="h-9 flex-1 px-1 text-xs capitalize"
              active={display.quality === quality}
              disabled={!!loading}
              onClick={() => void useDatum.getState().retessellate(quality)}
            >
              {quality}
            </ToolButton>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Geometry is scaled to millimeters by OpenCascade, then labeled in the unit you pick. Files never leave this
          browser.
        </p>
        <p className="mt-2 text-xs text-muted">
          Kernel: Open CASCADE via occt-import-js (LGPL).{" "}
          <a className="text-steel underline" href="/occt/license.occt.txt">
            License
          </a>
        </p>
      </div>
    </div>
  );
}
