import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Copy, FolderOpen, MapPin, Ruler, Square, X } from "lucide-react";
import { LeftPanel, RightPanel } from "@/components/datum/Panels";
import { ToolButton } from "@/components/datum/ui";
import { Viewport } from "@/components/datum/Viewport";
import { bridge } from "@/lib/datum/bridge";
import { cx, fmtLen } from "@/lib/datum/format";
import { session } from "@/lib/datum/session";
import { copyBriefing, copyView, currentShotFile, downloadPacket, shareShot } from "@/lib/datum/share";
import { useDatum } from "@/lib/datum/store";
import type { ViewName } from "@/lib/datum/types";

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "iso", label: "Iso" },
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];

export function DatumApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragTimer = useRef<number | null>(null);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useDatum((state) => state.file);
  const loading = useDatum((state) => state.loading);
  const error = useDatum((state) => state.error);
  const banner = useDatum((state) => state.banner);
  const packetOffer = useDatum((state) => state.packetOffer);
  const shot = useDatum((state) => state.shot);
  const mode = useDatum((state) => state.mode);
  const hoverText = useDatum((state) => state.hoverText);
  const mobileSheet = useDatum((state) => state.mobileSheet);
  const geometryRev = useDatum((state) => state.geometryRev);
  const display = useDatum((state) => state.display);
  const geometry = geometryRev >= 0 ? session.geometry : null;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("datum-author");
      if (saved) useDatum.getState().setAuthor(saved);
    } catch {
      /* ignore */
    }
    void useDatum.getState().refreshRecent();
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const state = useDatum.getState();
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        state.setMode("navigate");
        state.cancelDraft();
        state.clearMeasureAnchor();
        state.setMobileSheet(null);
        setHelp(false);
        return;
      }
      if (key === "f") bridge.fit();
      else if (key === "i") bridge.view("iso");
      else if (key === "1") bridge.view("front");
      else if (key === "2") bridge.view("back");
      else if (key === "3") bridge.view("left");
      else if (key === "4") bridge.view("right");
      else if (key === "5") bridge.view("top");
      else if (key === "6") bridge.view("bottom");
      else if (key === "n") state.setMode(state.mode === "note" ? "navigate" : "note");
      else if (key === "m") state.setMode(state.mode === "measure" ? "navigate" : "measure");
      else if (key === "g") state.patchDisplay({ grid: !state.display.grid });
      else if (key === "o")
        state.patchDisplay({ projection: state.display.projection === "ortho" ? "persp" : "ortho" });
      else if (key === "h") state.hideSelected();
      else if (key === "w") {
        const order = ["shaded", "edges", "wire"] as const;
        const next = order[(order.indexOf(state.display.style) + 1) % order.length];
        state.patchDisplay({ style: next });
      } else if (event.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (dragTimer.current) window.clearTimeout(dragTimer.current);
    };
  }, []);

  function showDropHint() {
    setDragging(true);
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => setDragging(false), 180);
  }

  function hideDropHint() {
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = null;
    setDragging(false);
  }

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg"
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        showDropHint();
      }}
      onDrop={(event) => {
        event.preventDefault();
        hideDropHint();
        const dropped = event.dataTransfer.files[0];
        if (dropped) void useDatum.getState().openFile(dropped);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Mark />
        <div className="min-w-0 flex-1">
          <p className="font-medium tracking-wide">Datum</p>
          <p className="truncate font-mono text-xs text-muted">{file ? file.name : "STEP review"}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".step,.stp,.iges,.igs,.json,model/step"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) void useDatum.getState().openFile(chosen);
          }}
        />
        <ToolButton className="h-10 px-3" onClick={() => inputRef.current?.click()}>
          <FolderOpen className="size-4" />
          Open
        </ToolButton>
        <ToolButton className="h-10 px-3 max-lg:hidden!" onClick={() => void copyBriefing()} disabled={!file}>
          <Copy className="size-4" />
          Briefing
        </ToolButton>
        <ToolButton className="h-10 px-3 max-lg:hidden!" onClick={downloadPacket} disabled={!file}>
          Packet
        </ToolButton>
        <ToolButton
          className="h-10 px-3 max-lg:hidden!"
          onClick={() => void copyView()}
          disabled={!file}
          aria-label="Copy image"
          title="Open the picture so you can save it"
        >
          <Camera className="size-4" />
          Image
        </ToolButton>
        <button type="button" className="h-10 px-2 text-sm text-muted max-lg:hidden" onClick={() => setHelp(true)}>
          Keys
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-line lg:flex">
          <LeftPanel />
        </aside>
        <div className="relative min-w-0 flex-1 bg-viewport">
          <Viewport />
          {file ? (
            <div className="absolute top-2 left-2 z-20 flex max-w-[calc(100%-0.75rem)] gap-1 overflow-x-auto max-lg:hidden!">
              <ToolButton className="h-9 shrink-0 bg-surface/90 px-2 text-xs" onClick={() => bridge.fit()}>
                Fit
              </ToolButton>
              {VIEWS.map((view) => (
                <ToolButton
                  key={view.id}
                  className="h-9 shrink-0 bg-surface/90 px-2 text-xs"
                  onClick={() => bridge.view(view.id)}
                >
                  {view.label}
                </ToolButton>
              ))}
            </div>
          ) : null}
          {!file && !loading ? <EmptyStage onOpen={() => inputRef.current?.click()} /> : null}
          {loading ? (
            <div className="absolute inset-x-0 top-0 z-30 border-b border-line bg-bg/90 px-4 py-3">
              <p className="text-sm">{loading}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                <div className="datum-sweep h-full w-1/3 bg-bronze" />
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-x-3 top-14 z-30 rounded-md border border-issue/50 bg-bg px-3 py-2 text-sm text-issue">
              {error}
              <button type="button" className="ml-3 text-fg" onClick={() => useDatum.setState({ error: null })}>
                Dismiss
              </button>
            </div>
          ) : null}
          {banner ? (
            <div className="absolute inset-x-3 bottom-10 z-30 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <p className="min-w-0 flex-1">{banner}</p>
              {packetOffer && file ? (
                <button
                  type="button"
                  className="text-bronze"
                  onClick={() => useDatum.getState().importPacket(packetOffer, true)}
                >
                  Apply
                </button>
              ) : null}
              <button type="button" aria-label="Dismiss" onClick={() => useDatum.getState().dismissPacketOffer()}>
                <X className="size-4 text-muted" />
              </button>
            </div>
          ) : null}
          {dragging ? (
            <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-md border border-dashed border-bronze bg-bg/80 text-bronze">
              Drop a STEP file
            </div>
          ) : null}
          {mobileSheet ? (
            <div
              className="absolute inset-0 z-30 flex flex-col justify-end bg-bg/50 lg:hidden"
              onClick={() => useDatum.getState().setMobileSheet(null)}
            >
              <div
                className="max-h-[78%] overflow-hidden rounded-t-lg border border-line bg-surface"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex h-11 items-center justify-between border-b border-line px-3">
                  <p className="text-sm">
                    {mobileSheet === "tree" ? "Model" : mobileSheet === "views" ? "Views" : "Review"}
                  </p>
                  <button type="button" onClick={() => useDatum.getState().setMobileSheet(null)} aria-label="Close">
                    <X className="size-5" />
                  </button>
                </div>
                <div className="h-[min(70dvh,32rem)]">
                  {mobileSheet === "tree" ? <LeftPanel /> : null}
                  {mobileSheet === "review" ? <RightPanel /> : null}
                  {mobileSheet === "views" ? (
                    <div className="grid grid-cols-2 gap-2 p-3">
                      {VIEWS.map((view) => (
                        <ToolButton
                          key={view.id}
                          onClick={() => {
                            bridge.view(view.id);
                            useDatum.getState().setMobileSheet(null);
                          }}
                        >
                          {view.label}
                        </ToolButton>
                      ))}
                      <ToolButton onClick={() => bridge.fit()}>Fit</ToolButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <aside className="hidden h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-line xl:flex">
          <RightPanel />
        </aside>
      </div>

      <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-3 font-mono text-xs text-muted">
        <span className="capitalize">{mode}</span>
        {geometry ? (
          <span className="tabular-nums">
            {geometry.triangles.toLocaleString()} tris
            {file ? ` · ${fmtLen(geometry.bounds.max[0] - geometry.bounds.min[0], display.unit)} wide` : ""}
          </span>
        ) : (
          <span>No model</span>
        )}
        <span className="min-w-0 flex-1 truncate text-right">{hoverText}</span>
      </footer>

      <nav className="grid shrink-0 grid-cols-6 border-t border-line bg-surface lg:hidden">
        <MobileTab
          label="Model"
          onClick={() => useDatum.getState().setMobileSheet("tree")}
          icon={<Square className="size-4" />}
        />
        <MobileTab
          label="Views"
          onClick={() => useDatum.getState().setMobileSheet("views")}
          icon={<span className="font-mono text-xs">ISO</span>}
        />
        <MobileTab label="Fit" onClick={() => bridge.fit()} icon={<span className="font-mono text-xs">FIT</span>} />
        <MobileTab
          label="Note"
          active={mode === "note"}
          onClick={() => useDatum.getState().setMode(mode === "note" ? "navigate" : "note")}
          icon={<MapPin className="size-4" />}
        />
        <MobileTab
          label="Size"
          active={mode === "measure"}
          onClick={() => useDatum.getState().setMode(mode === "measure" ? "navigate" : "measure")}
          icon={<Ruler className="size-4" />}
        />
        <MobileTab
          label="Review"
          onClick={() => useDatum.getState().setMobileSheet("review")}
          icon={<span className="font-mono text-xs">PIN</span>}
        />
      </nav>

      {help ? (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center bg-bg/60 p-4 sm:items-center"
          onClick={() => setHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-surface p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-medium">Keys</h2>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted">
              <li>F fit</li>
              <li>I iso</li>
              <li>1–6 views</li>
              <li>N pin</li>
              <li>M measure</li>
              <li>G grid</li>
              <li>O ortho</li>
              <li>W shading</li>
              <li>H hide</li>
              <li>Esc cancel</li>
            </ul>
            <p className="mt-3 text-sm text-pretty text-muted">
              Drag orbits. Right-drag or two fingers pan. Briefing copies the notes as text. Image copies the picture
              so you can paste both into the chat. Packet downloads the same notes as a file.
            </p>
          </div>
        </div>
      ) : null}
      {shot ? (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 sm:items-center"
          onClick={() => useDatum.getState().clearShot()}
        >
          <div
            className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-lg border border-line bg-surface p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-xs text-muted">{shot.name}</p>
              <button type="button" aria-label="Close" onClick={() => useDatum.getState().clearShot()}>
                <X className="size-5" />
              </button>
            </div>
            <img
              src={shot.url}
              alt="Current Datum view"
              data-datum-shot=""
              draggable
              className="max-h-[60dvh] min-h-0 w-full bg-viewport object-contain"
              onDragStart={(event) => {
                const file = currentShotFile();
                if (file) {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.items.add(file);
                }
                const absolute = new URL(shot.url, window.location.href).href;
                if (absolute.startsWith("http")) {
                  event.dataTransfer.setData("DownloadURL", `image/png:${shot.name}:${absolute}`);
                }
              }}
            />
            <p className="truncate font-mono text-sm text-fg" title={shot.name}>
              {shot.name}
            </p>
            <p className="text-sm text-pretty text-muted">
              Right-click the picture and choose <span className="text-fg">Save image as</span>. A button cannot open
              that menu. The file name is the one above. Dragging into the chat does nothing. Drag the picture onto
              the desktop if you want the file there.
            </p>
            <ToolButton onClick={() => void shareShot()}>Share</ToolButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileTab({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-14 flex-col items-center justify-center gap-0.5 text-xs",
        active ? "text-bronze" : "text-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyStage({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-xs tracking-widest text-bronze uppercase">Review bench</p>
        <h1 className="mt-2 text-3xl font-medium text-balance">Drop a STEP file on the bench.</h1>
        <p className="mt-3 text-pretty text-muted">
          Orbit the solid, section it, measure corners, and pin notes on the faces you want to talk about. Copy a
          briefing when the model is marked up.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ToolButton onClick={onOpen}>
            <FolderOpen className="size-4" />
            Open STEP
          </ToolButton>
          <ToolButton onClick={() => void useDatum.getState().openSample("as1-assembly.stp", "as1-assembly.stp")}>
            Load assembly
          </ToolButton>
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-8 shrink-0 text-bronze" aria-hidden>
      <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 15.5h5.5V21" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 8.5h5M16.5 6v5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
