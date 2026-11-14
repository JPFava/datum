import { distance, fmtBytes, fmtLen, fmtVec, kindLabel, schemaLabel, unitLabel } from "@/lib/datum/format";
import { span } from "@/lib/datum/geometry";
import { session } from "@/lib/datum/session";
import type { CameraState, FileInfo, Geometry, Markup, Measure } from "@/lib/datum/types";

export function buildBriefing(args: {
  file: FileInfo;
  geometry: Geometry;
  markups: Markup[];
  measures: Measure[];
  unit: "mm" | "in";
  camera: CameraState | null;
}): string {
  const { file, geometry, markups, measures, unit, camera } = args;
  const size = span(geometry.bounds);
  const lines: string[] = [
    "DATUM REVIEW",
    `File: ${file.name}`,
    `SHA-256: ${file.hash}`,
    `Schema: ${schemaLabel(file.meta.schema)} · native unit: ${unitLabel(file.meta.nativeUnit)} · readout: ${unit}`,
    `Bytes: ${fmtBytes(file.size)} · solids: ${geometry.meshes.length} · triangles: ${geometry.triangles.toLocaleString()}`,
    `Bounding box: ${fmtLen(size[0], unit)} × ${fmtLen(size[1], unit)} × ${fmtLen(size[2], unit)}`,
    `Bounding box mm: ${size.map((n) => n.toFixed(3)).join(" × ")}`,
  ];
  if (file.meta.originating) lines.push(`Originating system: ${file.meta.originating}`);
  if (file.meta.timestamp) lines.push(`Timestamp: ${file.meta.timestamp}`);
  if (file.meta.products.length) lines.push(`Products: ${file.meta.products.join(", ")}`);
  lines.push(
    "Coordinates below are in the model frame after OpenCascade scaled the file to millimeters. Z is up. Readout units are noted separately.",
  );
  lines.push("");
  const fileNotes = session.supplement?.notes ?? [];
  if (fileNotes.length) {
    lines.push("Notes stored in the STEP file:");
    for (const note of fileNotes) {
      if (note.title) lines.push(note.title);
      if (note.body) lines.push(note.body);
      lines.push("");
    }
  }
  if (!markups.length && !measures.length && !fileNotes.length) {
    lines.push("No pins or measures.");
  }
  const ordered = [...markups].sort((a, b) => a.index - b.index);
  for (const markup of ordered) {
    lines.push(
      `#${markup.index} ${kindLabel(markup.kind).toUpperCase()}${markup.resolved ? " RESOLVED" : ""} · ${markup.meshName} · ${fmtVec(markup.point, "mm")}`,
    );
    if (markup.title) lines.push(`  ${markup.title}`);
    if (markup.body) lines.push(`  ${markup.body}`);
    lines.push(`  — ${markup.author}`);
    for (const reply of markup.replies) {
      lines.push(`  ${reply.author}: ${reply.body}`);
    }
    lines.push("");
  }
  const measuresOrdered = [...measures].sort((a, b) => a.index - b.index);
  for (const measure of measuresOrdered) {
    const mm = distance(measure.a, measure.b);
    lines.push(
      `M${measure.index}  ${fmtLen(mm, unit)}  (${mm.toFixed(3)} mm)  ${fmtVec(measure.a, "mm")} → ${fmtVec(measure.b, "mm")}`,
    );
  }
  if (camera) {
    lines.push("");
    lines.push(
      `Camera (${camera.projection}): pos ${fmtVec(camera.position, "mm")}  target ${fmtVec(camera.target, "mm")}`,
    );
  }
  return lines.join("\n").trim() + "\n";
}
