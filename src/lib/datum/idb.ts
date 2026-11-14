import type { FileFormat, Markup, Measure, RecentFile } from "@/lib/datum/types";

const DB_NAME = "datum-review";
const DB_VERSION = 1;

type FileMeta = RecentFile;

type BlobRow = { hash: string; buffer: ArrayBuffer };

export type ReviewRow = {
  hash: string;
  markups: Markup[];
  measures: Measure[];
  unit: "mm" | "in";
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "hash" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "hash" });
      if (!db.objectStoreNames.contains("reviews")) db.createObjectStore("reviews", { keyPath: "hash" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFileBlob(meta: FileMeta, buffer: ArrayBuffer): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["meta", "blobs"], "readwrite");
  tx.objectStore("meta").put(meta);
  tx.objectStore("blobs").put({ hash: meta.hash, buffer } satisfies BlobRow);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const all = await requestToPromise(db.transaction("meta", "readonly").objectStore("meta").getAll());
  const rows = (all as FileMeta[]).sort((a, b) => b.openedAt - a.openedAt);
  const drop = rows.slice(8);
  if (drop.length) {
    const cleanup = db.transaction(["meta", "blobs"], "readwrite");
    for (const row of drop) {
      cleanup.objectStore("meta").delete(row.hash);
      cleanup.objectStore("blobs").delete(row.hash);
    }
    await new Promise<void>((resolve) => {
      cleanup.oncomplete = () => resolve();
      cleanup.onerror = () => resolve();
    });
  }
  db.close();
}

export async function listRecent(): Promise<RecentFile[]> {
  const db = await openDb();
  const rows = (await requestToPromise(db.transaction("meta", "readonly").objectStore("meta").getAll())) as FileMeta[];
  db.close();
  return rows.sort((a, b) => b.openedAt - a.openedAt);
}

export async function readFileBlob(hash: string): Promise<{ meta: FileMeta; buffer: ArrayBuffer } | null> {
  const db = await openDb();
  const meta = (await requestToPromise(db.transaction("meta", "readonly").objectStore("meta").get(hash))) as
    | FileMeta
    | undefined;
  const blob = (await requestToPromise(db.transaction("blobs", "readonly").objectStore("blobs").get(hash))) as
    | BlobRow
    | undefined;
  db.close();
  if (!meta || !blob) return null;
  return { meta, buffer: blob.buffer };
}

export async function saveReview(row: ReviewRow): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("reviews", "readwrite");
  tx.objectStore("reviews").put(row);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadReview(hash: string): Promise<ReviewRow | null> {
  const db = await openDb();
  const row = (await requestToPromise(db.transaction("reviews", "readonly").objectStore("reviews").get(hash))) as
    | ReviewRow
    | undefined;
  db.close();
  return row ?? null;
}

export function emptyMeta(format: FileFormat): FileMeta {
  return { hash: "", name: "", size: 0, format, openedAt: 0 };
}
