import { createFileRoute } from "@tanstack/react-router";

type ShotStore = Map<string, Uint8Array>;

function shots(): ShotStore {
  const host = globalThis as typeof globalThis & { __datumShots?: ShotStore };
  host.__datumShots ??= new Map();
  return host.__datumShots;
}

function shotName(value: string) {
  let name = value;
  try {
    name = decodeURIComponent(value);
  } catch {
    name = value;
  }
  if (!name.endsWith(".png") || name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  return name;
}

export const Route = createFileRoute("/api/datum-shot/$name")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const name = shotName(params.name);
        if (!name) return new Response("Bad name", { status: 400 });
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (!bytes.byteLength || bytes.byteLength > 12_000_000) return new Response("Bad image", { status: 413 });
        const store = shots();
        store.set(name, bytes);
        while (store.size > 6) {
          const oldest = store.keys().next().value;
          if (!oldest) break;
          store.delete(oldest);
        }
        return new Response(null, { status: 204 });
      },
      GET: async ({ params }) => {
        const name = shotName(params.name);
        const bytes = name ? shots().get(name) : undefined;
        if (!name || !bytes) return new Response("Not found", { status: 404 });
        const copy = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(copy).set(bytes);
        return new Response(copy, {
          headers: {
            "content-type": "image/png",
            "content-disposition": `inline; filename="${name.replaceAll('"', "")}"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
