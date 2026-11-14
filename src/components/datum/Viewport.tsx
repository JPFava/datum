import { useEffect, useRef } from "react";
import { bridge } from "@/lib/datum/bridge";
import { DatumEngine } from "@/lib/datum/engine";
import { distance, fmtLen, kindLabel } from "@/lib/datum/format";
import { descendantMeshIds, findNode } from "@/lib/datum/geometry";
import { session } from "@/lib/datum/session";
import { useDatum } from "@/lib/datum/store";
import type { MarkupKind } from "@/lib/datum/types";

const PIN: Record<MarkupKind, string> = {
  note: "bg-bronze text-bg",
  question: "bg-steel text-bg",
  issue: "bg-issue text-bg",
  ok: "bg-ok text-bg",
};

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DatumEngine | null>(null);

  const geometryRev = useDatum((state) => state.geometryRev);
  const display = useDatum((state) => state.display);
  const visibility = useDatum((state) => state.visibility);
  const isolatedNodeId = useDatum((state) => state.isolatedNodeId);
  const selectedMeshId = useDatum((state) => state.selectedMeshId);
  const selectedTriangle = useDatum((state) => state.selectedTriangle);
  const markups = useDatum((state) => state.markups);
  const measures = useDatum((state) => state.measures);
  const draft = useDatum((state) => state.draft);
  const measureAnchor = useDatum((state) => state.measureAnchor);
  const mode = useDatum((state) => state.mode);
  const activeMarkupId = useDatum((state) => state.activeMarkupId);
  const file = useDatum((state) => state.file);

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;
    let engine: DatumEngine;
    try {
      engine = new DatumEngine(host, overlay, {
        onPick: (hit) => useDatum.getState().handlePick(hit),
        onHover: (hit) => useDatum.getState().setHover(hit),
      });
    } catch (error) {
      useDatum.setState({
        error: error instanceof Error ? error.message : "This browser could not start WebGL.",
      });
      return;
    }
    engineRef.current = engine;
    bridge.getCamera = () => engine.getCamera();
    bridge.restoreCamera = (camera) => engine.restoreCamera(camera);
    bridge.fit = (meshIds) => engine.fit(meshIds);
    bridge.view = (name) => engine.view(name);
    bridge.snapshot = () => engine.snapshot();
    engine.setGeometry(session.geometry);
    engine.setSupplement(session.geometry ? session.supplement : null);
    engine.setDisplay(useDatum.getState().display);
    if (session.geometry) engine.fit();
    return () => {
      engine.dispose();
      engineRef.current = null;
      bridge.getCamera = () => null;
      bridge.restoreCamera = () => {};
      bridge.fit = () => {};
      bridge.view = () => {};
      bridge.snapshot = () => null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setGeometry(session.geometry);
    engine.setSupplement(session.geometry ? session.supplement : null);
    engine.setDisplay(useDatum.getState().display);
    if (session.geometry) engine.fit();
  }, [geometryRev]);

  useEffect(() => {
    engineRef.current?.setDisplay(display);
  }, [display]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    const geometry = session.geometry;
    const node = geometry && isolatedNodeId ? findNode(geometry.tree, isolatedNodeId) : null;
    const isolated = node ? descendantMeshIds(node) : isolatedNodeId ? [] : null;
    engineRef.current?.setVisibility(visibility, isolated);
  }, [visibility, isolatedNodeId, geometryRev]);

  useEffect(() => {
    engineRef.current?.setSelection(selectedMeshId, selectedTriangle);
  }, [selectedMeshId, selectedTriangle, geometryRev]);

  useEffect(() => {
    engineRef.current?.setReview({ markups, measures, draft, anchor: measureAnchor });
  }, [markups, measures, draft, measureAnchor]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0 touch-none" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {markups.map((markup) => (
          <button
            key={markup.id}
            type="button"
            data-marker={markup.id}
            hidden
            title={`${kindLabel(markup.kind)} #${markup.index}${markup.title ? `: ${markup.title}` : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => useDatum.getState().selectMarkup(markup.id)}
            className={`pointer-events-auto absolute top-0 left-0 z-10 flex size-8 items-center justify-center rounded-full border border-bg font-mono text-xs ${PIN[markup.kind]} ${markup.resolved ? "opacity-45" : ""} ${activeMarkupId === markup.id ? "ring-2 ring-fg" : ""}`}
          >
            {markup.index}
          </button>
        ))}
        {draft ? (
          <div
            data-marker="__draft"
            hidden
            className="absolute top-0 left-0 z-10 flex size-8 items-center justify-center rounded-full border border-dashed border-bronze bg-bg/80 font-mono text-xs text-bronze"
          >
            +
          </div>
        ) : null}
        {measures.map((measure) => (
          <div
            key={measure.id}
            data-marker={`measure-${measure.id}`}
            hidden
            className="absolute top-0 left-0 z-10 rounded-md border border-line bg-bg/90 px-1.5 py-0.5 font-mono text-xs text-fg"
          >
            M{measure.index} {fmtLen(distance(measure.a, measure.b), display.unit)}
          </div>
        ))}
        {measureAnchor ? (
          <div
            data-marker="__live"
            hidden
            className="absolute top-0 left-0 z-10 size-2 rounded-full bg-bronze"
          />
        ) : null}
      </div>
      {file ? (
        <p className="pointer-events-none absolute bottom-2 left-3 z-20 font-mono text-xs text-muted">
          Z up · drag to orbit · right-drag to pan · scroll to zoom
        </p>
      ) : null}
    </div>
  );
}
