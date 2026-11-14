import type { NativeUnit, Vec3 } from "@/lib/datum/types";

export type StepSketch = {
  name: string;
  kind: "sketch" | "plane";
  positions: Float32Array;
};

export type StepNote = {
  title: string;
  body: string;
  anchor: Vec3 | null;
};

export type StepSupplement = {
  sketches: StepSketch[];
  notes: StepNote[];
};

const EMPTY: StepSupplement = { sketches: [], notes: [] };

type RecordBody = { keyword: string; args: string[] };

export function parseStepSupplement(text: string, unit: NativeUnit): StepSupplement {
  if (!/GEOMETRIC_CURVE_SET|DESCRIPTIVE_REPRESENTATION_ITEM|DRAUGHTING_CALLOUT/.test(text)) return EMPTY;
  const records = indexRecords(text);
  if (!records.size) return EMPTY;
  const scale = unitScale(unit);
  const sketches = sketchesFrom(records, scale);
  const notes = notesFrom(records, sketches);
  if (!sketches.length && !notes.length) return EMPTY;
  return { sketches, notes };
}

function unitScale(unit: NativeUnit): number {
  if (unit === "in") return 25.4;
  if (unit === "ft") return 304.8;
  if (unit === "cm") return 10;
  if (unit === "m") return 1000;
  return 1;
}

function indexRecords(text: string): Map<number, RecordBody> {
  const records = new Map<number, RecordBody>();
  const n = text.length;
  let i = 0;
  let inString = false;
  while (i < n) {
    const char = text[i];
    if (inString) {
      if (char === "'" && text[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (char === "'") inString = false;
      i += 1;
      continue;
    }
    if (char === "'") {
      inString = true;
      i += 1;
      continue;
    }
    if (char !== "#") {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && text[j] >= "0" && text[j] <= "9") j += 1;
    if (j === i + 1) {
      i += 1;
      continue;
    }
    let k = j;
    while (k < n && (text[k] === " " || text[k] === "\t" || text[k] === "\n" || text[k] === "\r")) k += 1;
    if (text[k] !== "=") {
      i = j;
      continue;
    }
    const id = Number(text.slice(i + 1, j));
    let p = k + 1;
    let quoted = false;
    let raw = "";
    while (p < n) {
      const next = text[p];
      if (quoted) {
        if (next === "'" && text[p + 1] === "'") {
          raw += "''";
          p += 2;
          continue;
        }
        if (next === "'") {
          quoted = false;
          raw += next;
          p += 1;
          continue;
        }
        if (next !== "\n" && next !== "\r") raw += next;
        p += 1;
        continue;
      }
      if (next === "'") {
        quoted = true;
        raw += next;
        p += 1;
        continue;
      }
      if (next === ";") break;
      raw += next === "\n" || next === "\r" ? " " : next;
      p += 1;
    }
    const trimmed = raw.trim();
    const keyword = /^([A-Z][A-Z0-9_]*)\s*\(/.exec(trimmed);
    if (keyword) {
      const open = trimmed.indexOf("(");
      const close = trimmed.endsWith(")") ? trimmed.length - 1 : trimmed.length;
      records.set(id, { keyword: keyword[1], args: splitArgs(trimmed.slice(open + 1, close)) });
    }
    i = p + 1;
  }
  return records;
}

function splitArgs(body: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let token = "";
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (inString) {
      token += char;
      if (char === "'" && body[i + 1] === "'") {
        token += "'";
        i += 1;
        continue;
      }
      if (char === "'") inString = false;
      continue;
    }
    if (char === "'") {
      inString = true;
      token += char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      token += char;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      token += char;
      continue;
    }
    if (char === "," && depth === 0) {
      params.push(token.trim());
      token = "";
      continue;
    }
    token += char;
  }
  if (token.trim()) params.push(token.trim());
  return params;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function refs(value: string): number[] {
  return [...value.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
}

function numbers(value: string): number[] {
  return [...value.matchAll(/[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[Ee][-+]?\d+)?/g)].map((match) => Number(match[0]));
}

function pointOf(records: Map<number, RecordBody>, id: number, scale: number): Vec3 | null {
  const record = records.get(id);
  if (!record || record.keyword !== "CARTESIAN_POINT") return null;
  const coords = numbers(record.args[1] || "");
  if (coords.length < 3) return null;
  return [coords[0] * scale, coords[1] * scale, coords[2] * scale];
}

function directionOf(records: Map<number, RecordBody>, id: number): Vec3 | null {
  const record = records.get(id);
  if (!record || record.keyword !== "DIRECTION") return null;
  const coords = numbers(record.args[1] || "");
  if (coords.length < 3) return null;
  return [coords[0], coords[1], coords[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function curvePoints(records: Map<number, RecordBody>, id: number, scale: number): Vec3[] | null {
  const record = records.get(id);
  if (!record) return null;
  if (record.keyword === "POLYLINE") {
    const points = refs(record.args[1] || "")
      .map((ref) => pointOf(records, ref, scale))
      .filter((point): point is Vec3 => !!point);
    return points.length >= 2 ? points : null;
  }
  if (record.keyword === "TRIMMED_CURVE") return trimmedPoints(records, record, scale);
  if (record.keyword === "CIRCLE") return circlePoints(records, record, 0, Math.PI * 2, true, scale);
  return null;
}

function trimmedPoints(records: Map<number, RecordBody>, record: RecordBody, scale: number): Vec3[] | null {
  const basisId = refs(record.args[1] || "")[0];
  const basis = basisId ? records.get(basisId) : undefined;
  if (!basis || basis.keyword !== "CIRCLE") return null;
  const start = parameterOf(record.args[2] || "");
  const end = parameterOf(record.args[3] || "");
  if (start == null || end == null) return null;
  const sense = !/^\.F\.$/.test(record.args[4] || "");
  return circlePoints(records, basis, start, end, sense, scale);
}

function parameterOf(value: string): number | null {
  const match = /PARAMETER_VALUE\s*\(\s*([-+0-9.eE]+)\s*\)/.exec(value);
  if (!match) return null;
  const parameter = Number(match[1]);
  return Number.isFinite(parameter) ? parameter : null;
}

function circlePoints(
  records: Map<number, RecordBody>,
  circle: RecordBody,
  start: number,
  end: number,
  sense: boolean,
  scale: number,
): Vec3[] | null {
  const placementId = refs(circle.args[1] || "")[0];
  const placement = placementId ? records.get(placementId) : undefined;
  if (!placement || placement.keyword !== "AXIS2_PLACEMENT_3D") return null;
  const place = refs(placement.args.slice(1).join(","));
  const origin = place[0] ? pointOf(records, place[0], scale) : null;
  const axis = place[1] ? directionOf(records, place[1]) : ([0, 0, 1] as Vec3);
  const ref = place[2] ? directionOf(records, place[2]) : ([1, 0, 0] as Vec3);
  const radius = numbers(circle.args[2] || "")[0];
  if (!origin || !axis || !ref || !radius) return null;
  const yAxis = cross(axis, ref);
  let sweep = sense ? end - start : start - end;
  while (sweep <= 0) sweep += Math.PI * 2;
  if (sweep > Math.PI * 2) sweep = Math.PI * 2;
  const steps = Math.max(4, Math.ceil(sweep / (Math.PI / 18)));
  const points: Vec3[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = sense ? start + (sweep * step) / steps : start - (sweep * step) / steps;
    const local = add(scaleVec(ref, Math.cos(angle)), scaleVec(yAxis, Math.sin(angle)));
    points.push(add(origin, scaleVec(local, radius * scale)));
  }
  return points;
}

function segmentsOf(points: Vec3[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  return out;
}

function centroidOf(positions: Float32Array): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = positions.length / 3;
  for (let i = 0; i < positions.length; i += 3) {
    x += positions[i];
    y += positions[i + 1];
    z += positions[i + 2];
  }
  return [x / count, y / count, z / count];
}

function sketchesFrom(records: Map<number, RecordBody>, scale: number): StepSketch[] {
  const sketches: StepSketch[] = [];
  for (const record of records.values()) {
    if (record.keyword !== "GEOMETRIC_CURVE_SET") continue;
    const name = unquote(record.args[0] || "") || "Sketch";
    const xyz: number[] = [];
    for (const id of refs(record.args[1] || "")) {
      const points = curvePoints(records, id, scale);
      if (points) xyz.push(...segmentsOf(points));
    }
    if (xyz.length < 6) continue;
    sketches.push({
      name,
      kind: /plane/i.test(name) ? "plane" : "sketch",
      positions: Float32Array.from(xyz),
    });
  }
  return sketches;
}

function notesFrom(records: Map<number, RecordBody>, sketches: StepSketch[]): StepNote[] {
  const notes: StepNote[] = [];
  for (const [id, record] of records) {
    if (record.keyword !== "PROPERTY_DEFINITION") continue;
    const label = `${unquote(record.args[0] || "")} ${unquote(record.args[1] || "")}`;
    if (!/semantic text/i.test(label)) continue;
    const texts = descriptionOf(records, id);
    if (!texts.length) continue;
    const title = texts.find((text) => text.length <= 48) || "";
    const body = texts.filter((text) => text !== title).join("\n") || (title ? "" : texts[0]);
    notes.push({ title: title || "Note", body: body || title, anchor: anchorFor(title, sketches) });
  }
  if (notes.length) return notes;
  for (const record of records.values()) {
    if (record.keyword !== "DRAUGHTING_CALLOUT") continue;
    const title = unquote(record.args[0] || "") || "Note";
    notes.push({
      title,
      body: "This note is drawn in the file, but the readable wording was not stored beside it.",
      anchor: anchorFor(title, sketches),
    });
  }
  return notes;
}

function descriptionOf(records: Map<number, RecordBody>, propertyId: number): string[] {
  for (const record of records.values()) {
    if (record.keyword !== "PROPERTY_DEFINITION_REPRESENTATION") continue;
    if (!refs(record.args[0] || "").includes(propertyId)) continue;
    const representationId = refs(record.args[1] || "")[0];
    const representation = representationId ? records.get(representationId) : undefined;
    if (!representation) continue;
    const texts: string[] = [];
    for (const itemId of refs(representation.args[1] || "")) {
      const item = records.get(itemId);
      if (!item || item.keyword !== "DESCRIPTIVE_REPRESENTATION_ITEM") continue;
      const text = unquote(item.args[1] || "") || unquote(item.args[0] || "");
      if (text) texts.push(text.replace(/\s+/g, " ").trim());
    }
    if (texts.length) return texts;
  }
  return [];
}

function anchorFor(title: string, sketches: StepSketch[]): Vec3 | null {
  const key = title.toLowerCase().replace(/sketch|note/g, "").trim();
  const sketch = sketches.find((item) => {
    const name = item.name.toLowerCase().replace(/sketch|note/g, "").trim();
    return key && (name.includes(key) || key.includes(name));
  });
  return sketch ? centroidOf(sketch.positions) : null;
}
