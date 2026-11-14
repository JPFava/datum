import { bridge } from "@/lib/datum/bridge";
import { buildBriefing } from "@/lib/datum/briefing";
import { assetUrl, copyText, downloadBlob } from "@/lib/datum/format";
import { session } from "@/lib/datum/session";
import { useDatum } from "@/lib/datum/store";
import type { Packet } from "@/lib/datum/types";

function fileBase(name: string) {
  return name.replace(/\.(step|stp|iges|igs)$/i, "");
}

function pngBlob(dataUrl: string): Blob {
  const body = dataUrl.split(",")[1] || "";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export async function copyBriefing() {
  const state = useDatum.getState();
  if (!state.file || !session.geometry) {
    state.setBanner("Open a model before copying a briefing.");
    return;
  }
  const text = buildBriefing({
    file: state.file,
    geometry: session.geometry,
    markups: state.markups,
    measures: state.measures,
    unit: state.display.unit,
    camera: bridge.getCamera(),
  });
  const ok = await copyText(text);
  state.setBanner(ok ? "Briefing copied. Paste it into the chat, then copy the image." : "Could not copy the briefing.");
}

export function downloadPacket() {
  const state = useDatum.getState();
  if (!state.file) {
    state.setBanner("Open a model before downloading a packet.");
    return;
  }
  const packet: Packet = {
    datum: 1,
    file: { name: state.file.name, hash: state.file.hash, size: state.file.size },
    unit: state.display.unit,
    markups: state.markups,
    measures: state.measures,
    camera: bridge.getCamera(),
  };
  downloadBlob(
    `${fileBase(state.file.name)}.datum.json`,
    new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }),
  );
  state.setBanner("Packet downloaded. It is the .datum.json file of these pins. Send it with the STEP file.");
}

export async function copyView() {
  const state = useDatum.getState();
  if (!state.file) {
    state.setBanner("Open a model before copying an image.");
    return;
  }
  const url = bridge.snapshot();
  if (!url) {
    state.setBanner("The view is not ready yet.");
    return;
  }
  const blob = pngBlob(url);
  const name = `${fileBase(state.file.name)}-datum.png`;
  rememberShot(blob);
  const hosted = await publishShot(name, blob);
  useDatum.getState().showShot({ url: hosted ?? URL.createObjectURL(blob), name });
  const copied = await writeClipboardImage(blob);
  state.setBanner(
    copied
      ? `Image copied. If you save the file instead, the name is ${name}.`
      : `Right-click the picture and choose Save image as. The name is ${name}.`,
  );
}

async function publishShot(name: string, blob: Blob): Promise<string | null> {
  const path = assetUrl(`/api/datum-shot/${encodeURIComponent(name)}`);
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: blob,
    });
    return response.ok ? path : null;
  } catch {
    return null;
  }
}

let shotBlob: Blob | null = null;

function rememberShot(blob: Blob) {
  shotBlob = blob;
}

export function currentShotFile(): File | null {
  const shot = useDatum.getState().shot;
  if (!shot || !shotBlob) return null;
  return new File([shotBlob], shot.name, { type: "image/png" });
}

async function writeClipboardImage(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function shareShot() {
  const shot = useDatum.getState().shot;
  const blob = shotBlob;
  if (!shot || !blob) return;
  const file = new File([blob], shot.name, { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) {
    useDatum.getState().setBanner(`Sharing is blocked here. Right-click the picture and save it as ${shot.name}.`);
    return;
  }
  try {
    await navigator.share({ files: [file], title: shot.name });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    useDatum.getState().setBanner(`Could not open the share sheet. Right-click the picture and save it as ${shot.name}.`);
  }
}
