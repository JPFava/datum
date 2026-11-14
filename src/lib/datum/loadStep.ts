import { assetUrl } from "@/lib/datum/format";
import { buildGeometry } from "@/lib/datum/geometry";
import type { FileFormat, Geometry, Quality } from "@/lib/datum/types";

type WorkerMesh = {
  name: string;
  color: [number, number, number] | null;
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  faces: { first: number; last: number; color: [number, number, number] | null }[];
};

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) worker = new Worker(assetUrl("/occt/worker.js"));
  return worker;
}

export function qualityParams(quality: Quality) {
  const table = {
    coarse: { linearDeflection: 0.02, angularDeflection: 0.5 },
    standard: { linearDeflection: 0.004, angularDeflection: 0.18 },
    fine: { linearDeflection: 0.0012, angularDeflection: 0.08 },
  } satisfies Record<Quality, { linearDeflection: number; angularDeflection: number }>;
  return {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    ...table[quality],
  };
}

export function tessellate(
  buffer: ArrayBuffer,
  format: FileFormat,
  quality: Quality,
  onProgress?: (message: string) => void,
): Promise<Geometry> {
  const id = ++seq;
  const current = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        id?: number;
        progress?: string;
        ok?: boolean;
        error?: string;
        root?: { name?: string; meshes?: number[]; children?: [] };
        meshes?: WorkerMesh[];
      };
      if (!data || data.id !== id) return;
      if (data.progress) {
        onProgress?.(data.progress);
        return;
      }
      current.removeEventListener("message", onMessage);
      if (!data.ok || !data.meshes) {
        reject(new Error(data.error || "Import failed."));
        return;
      }
      if (!data.meshes.length) {
        reject(new Error("No solid geometry was found in this file."));
        return;
      }
      resolve(buildGeometry(data.root || { name: "", meshes: [], children: [] }, data.meshes));
    };
    const onError = (event: ErrorEvent) => {
      current.removeEventListener("message", onMessage);
      reject(new Error(event.message || "The geometry kernel failed to start."));
    };
    current.addEventListener("message", onMessage);
    current.addEventListener("error", onError, { once: true });
    const copy = buffer.slice(0);
    current.postMessage({ id, format, buffer: copy, params: qualityParams(quality) }, [copy]);
  });
}
