import { previewPathPrefix } from "@/lib/preview-path-prefix";
import type { FileFormat, MarkupKind, NativeUnit, Vec3 } from "@/lib/datum/types";
import { INCH } from "@/lib/datum/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function assetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") return normalized;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
  return prefix ? `${prefix}${normalized}` : normalized;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatOf(name: string): FileFormat | "packet" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "packet";
  if (lower.endsWith(".iges") || lower.endsWith(".igs")) return "iges";
  if (lower.endsWith(".stp") || lower.endsWith(".step")) return "step";
  return null;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDisplay(mm: number, unit: "mm" | "in"): number {
  return unit === "in" ? mm / INCH : mm;
}

export function fmtLen(mm: number, unit: "mm" | "in"): string {
  const value = toDisplay(mm, unit);
  const digits = unit === "in" ? 4 : Math.abs(value) >= 100 ? 2 : 3;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${unit}`;
}

export function fmtVec(point: Vec3, unit: "mm" | "in"): string {
  const digits = unit === "in" ? 4 : 3;
  const parts = point.map((n) =>
    toDisplay(n, unit).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );
  return `(${parts.join(", ")}) ${unit}`;
}

export function fmtArea(mm2: number, unit: "mm" | "in"): string {
  const value = unit === "in" ? mm2 / (INCH * INCH) : mm2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: unit === "in" ? 3 : 1 })} ${unit}²`;
}

export function fmtVol(mm3: number, unit: "mm" | "in"): string {
  const value = unit === "in" ? mm3 / INCH ** 3 : mm3;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: unit === "in" ? 4 : 1 })} ${unit}³`;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function schemaLabel(schema: string): string {
  if (/AP242|INTEGRATED_CNC|10303\s*-?\s*242/i.test(schema)) return "AP242";
  if (/AUTOMOTIVE_DESIGN|10303\s*-?\s*214|\b214\b/.test(schema)) return "AP214";
  if (/CONFIG_CONTROL_DESIGN|10303\s*-?\s*203|\b203\b/.test(schema)) return "AP203";
  if (!schema) return "STEP";
  return schema.length > 42 ? `${schema.slice(0, 42)}…` : schema;
}

export function unitLabel(unit: NativeUnit): string {
  if (unit === "mm") return "millimeters";
  if (unit === "in") return "inches";
  if (unit === "cm") return "centimeters";
  if (unit === "m") return "meters";
  if (unit === "ft") return "feet";
  return "not declared";
}

export function kindLabel(kind: MarkupKind): string {
  if (kind === "note") return "Note";
  if (kind === "question") return "Question";
  if (kind === "issue") return "Issue";
  return "OK";
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
