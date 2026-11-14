import type { NativeUnit, StepMeta } from "@/lib/datum/types";

function topLevelParams(source: string): string[] {
  const start = source.indexOf("(");
  if (start < 0) return [];
  const params: string[] = [];
  let depth = 0;
  let token = "";
  let inString = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      token += char;
      if (char === "'") {
        if (source[i + 1] === "'") {
          token += "'";
          i += 1;
        } else {
          inString = false;
        }
      }
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
      if (depth === 0) {
        params.push(token.trim());
        break;
      }
      token += char;
      continue;
    }
    if (char === "," && depth === 1) {
      params.push(token.trim());
      token = "";
      continue;
    }
    token += char;
  }
  return params.map(unquote);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function detectNativeUnit(text: string): NativeUnit {
  let inch = false;
  let foot = false;
  let milli = false;
  let centi = false;
  let metre = false;
  let at = 0;
  while (at < text.length) {
    const found = text.indexOf("LENGTH_UNIT", at);
    if (found < 0) break;
    const window = text.slice(Math.max(0, found - 200), Math.min(text.length, found + 80));
    if (/INCH/i.test(window)) inch = true;
    else if (/FOOT/i.test(window)) foot = true;
    else if (/\.MILLI\./i.test(window)) milli = true;
    else if (/\.CENTI\./i.test(window)) centi = true;
    else if (/\.METRE\./i.test(window)) metre = true;
    at = found + 11;
  }
  if (inch) return "in";
  if (foot) return "ft";
  if (milli) return "mm";
  if (centi) return "cm";
  if (metre) return "m";
  return "unknown";
}

function productsFrom(text: string): string[] {
  const found = new Set<string>();
  const re = /\bPRODUCT\s*\(\s*'((?:[^']|'')*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = match[1].replace(/''/g, "'").trim();
    if (name && name !== " " && name.length < 80) found.add(name);
    if (found.size >= 8) break;
  }
  return [...found];
}

export function parseStepMeta(text: string): StepMeta {
  const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1] ?? "STEP";
  const fileNameAt = text.indexOf("FILE_NAME");
  const params = fileNameAt >= 0 ? topLevelParams(text.slice(fileNameAt)) : [];
  return {
    schema,
    fileName: params[0] || "",
    timestamp: params[1] || "",
    preprocessor: params[4] || "",
    originating: params[5] || "",
    products: productsFrom(text),
    nativeUnit: detectNativeUnit(text),
    entityCount: (text.match(/#\d+\s*=/g) || []).length,
  };
}

export function parseIgesMeta(text: string): StepMeta {
  const start = text.indexOf("S");
  const header = start >= 0 ? text.slice(0, 400) : text.slice(0, 400);
  return {
    schema: "IGES",
    fileName: "",
    timestamp: "",
    preprocessor: "",
    originating: header.replace(/\s+/g, " ").trim().slice(0, 80),
    products: [],
    nativeUnit: detectNativeUnit(text),
    entityCount: 0,
  };
}
