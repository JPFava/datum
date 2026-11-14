/* global occtimportjs */
importScripts("occt-import-js.js");

let occtPromise = null;

function kernel() {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (path) => path,
    });
  }
  return occtPromise;
}

function num(arr) {
  if (!arr || !arr.length) return new Float32Array(0);
  return Float32Array.from(arr);
}

function idx(arr) {
  if (!arr || !arr.length) return new Uint32Array(0);
  return Uint32Array.from(arr);
}

self.onmessage = async (ev) => {
  const { id, format, buffer, params } = ev.data || {};
  try {
    self.postMessage({ id, progress: "Starting the geometry kernel…" });
    const occt = await kernel();
    self.postMessage({ id, progress: "Tessellating surfaces…" });
    const fileBuffer = new Uint8Array(buffer);
    const result =
      format === "iges"
        ? occt.ReadIgesFile(fileBuffer, params)
        : occt.ReadStepFile(fileBuffer, params);
    if (!result || !result.success) {
      self.postMessage({
        id,
        ok: false,
        error: "OpenCascade could not read this file. It may be corrupt, empty, or not a solid model.",
      });
      return;
    }
    const meshes = (result.meshes || []).map((mesh, i) => ({
      name: (mesh.name && String(mesh.name).trim()) || `Solid ${i + 1}`,
      color: mesh.color ? [mesh.color[0], mesh.color[1], mesh.color[2]] : null,
      position: num(mesh.attributes?.position?.array),
      normal: num(mesh.attributes?.normal?.array),
      index: idx(mesh.index?.array),
      faces: (mesh.brep_faces || []).map((face) => ({
        first: face.first,
        last: face.last,
        color: face.color ? [face.color[0], face.color[1], face.color[2]] : null,
      })),
    }));
    const transfers = [];
    for (const mesh of meshes) {
      transfers.push(mesh.position.buffer, mesh.normal.buffer, mesh.index.buffer);
    }
    let root = { name: "", meshes: [], children: [] };
    try {
      root = JSON.parse(JSON.stringify(result.root || root));
    } catch {
      root = { name: "", meshes: [], children: [] };
    }
    self.postMessage({ id, ok: true, root, meshes }, transfers);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err && err.message ? String(err.message) : "The geometry kernel failed.",
    });
  }
};
