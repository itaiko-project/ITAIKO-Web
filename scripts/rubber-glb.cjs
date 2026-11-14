// The rubber head on its own, as a textured GLB for the shop: the rubber cap (face + skirt) cut out of the
// rope-less drum model, with that model's own 4K textures, stood upright (face towards +Z, centred on the face)
// and in metres (the drum model is 1 unit = 20 mm), so it comes out at its real size in AR viewers.
// Usage: node scripts/rubber-glb.cjs TaikoNoRope_HD.glb foto_shopify/gomma.glb
const fs = require("fs");
const [, , src, out] = process.argv;

const b = fs.readFileSync(src);
const jsonLength = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jsonLength));
const bin = 20 + jsonLength + 8;
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const read = (i) => {
  const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = SIZE[a.type];
  const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
  const stride = v.byteStride || n * bytes, base = bin + (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let k = 0; k < a.count; k++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const p = base + k * stride + c * bytes;
      row.push(a.componentType === 5126 ? b.readFloatLE(p) : a.componentType === 5125 ? b.readUInt32LE(p) : b.readUInt16LE(p));
    }
    out.push(row);
  }
  return out;
};

const prim = j.meshes[0].primitives[0];
const pos = read(prim.attributes.POSITION), nor = read(prim.attributes.NORMAL);
const uv = read(prim.attributes.TEXCOORD_0), tan = prim.attributes.TANGENT !== undefined ? read(prim.attributes.TANGENT) : null;
const idx = read(prim.indices).map((r) => r[0]);

// Loose parts (vertices welded by position); the rubber is the biggest one.
const weld = new Map();
const rep = pos.map((p, i) => { const k = p.map((x) => x.toFixed(4)).join(); if (!weld.has(k)) weld.set(k, i); return weld.get(k); });
const parent = pos.map((_, i) => i);
const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
for (let t = 0; t < idx.length; t += 3) {
  const a = find(rep[idx[t]]);
  for (let c = 1; c < 3; c++) { const q = find(rep[idx[t + c]]); if (q !== a) parent[q] = a; }
}
const tris = new Map();
for (let t = 0; t < idx.length; t += 3) { const r = find(rep[idx[t]]); tris.set(r, (tris.get(r) || 0) + 1); }
const rubber = [...tris.entries()].sort((x, y) => y[1] - x[1])[0][0];

// Upright: undo the head's 34.8° lean (rotate about X), front face centre to the origin, units to metres.
const TILT = (34.8 * Math.PI) / 180, C = [0, 14.69, 0.81], M = 0.02;
const rot = ([x, y, z]) => [x, y * Math.cos(TILT) - z * Math.sin(TILT), y * Math.sin(TILT) + z * Math.cos(TILT)];
const remap = new Map(), P = [], N = [], UV = [], TG = [], I = [];
for (let t = 0; t < idx.length; t += 3) {
  if (find(rep[idx[t]]) !== rubber) continue;
  for (let c = 0; c < 3; c++) {
    const i = idx[t + c];
    if (!remap.has(i)) {
      remap.set(i, P.length / 3);
      P.push(...rot(pos[i].map((x, k) => x - C[k])).map((x) => x * M));
      N.push(...rot(nor[i]));
      UV.push(...uv[i]);
      if (tan) TG.push(...rot(tan[i].slice(0, 3)), tan[i][3]);
    }
    I.push(remap.get(i));
  }
}

// New GLB: the rubber's geometry plus the source model's images, textures and material, unchanged.
const chunks = [];
let offset = 0;
const views = [], accessors = [];
const addView = (buf, target) => {
  const pad = (4 - (buf.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, ...(target ? { target } : {}) });
  chunks.push(buf, Buffer.alloc(pad));
  offset += buf.length + pad;
  return views.length - 1;
};
const addFloats = (arr, type, minmax) => {
  const n = SIZE[type], count = arr.length / n;
  const view = addView(Buffer.from(new Float32Array(arr).buffer), 34962);
  const acc = { bufferView: view, componentType: 5126, count, type };
  if (minmax) {
    acc.min = [...Array(n)].map((_, c) => Math.min(...arr.filter((_, i) => i % n === c)));
    acc.max = [...Array(n)].map((_, c) => Math.max(...arr.filter((_, i) => i % n === c)));
  }
  accessors.push(acc);
  return accessors.length - 1;
};
const attributes = { POSITION: addFloats(P, "VEC3", true), NORMAL: addFloats(N, "VEC3"), TEXCOORD_0: addFloats(UV, "VEC2") };
if (tan) attributes.TANGENT = addFloats(TG, "VEC4");
const big = P.length / 3 > 65535;
accessors.push({ bufferView: addView(Buffer.from((big ? new Uint32Array(I) : new Uint16Array(I)).buffer), 34963), componentType: big ? 5125 : 5123, count: I.length, type: "SCALAR" });
const indices = accessors.length - 1;
const images = j.images.map((im) => {
  const v = j.bufferViews[im.bufferView];
  return { mimeType: im.mimeType, bufferView: addView(b.slice(bin + (v.byteOffset || 0), bin + (v.byteOffset || 0) + v.byteLength)) };
});
const json = {
  asset: { version: "2.0", generator: "scripts/rubber-glb.cjs (ITAIKO rubber head)" },
  ...(j.extensionsUsed ? { extensionsUsed: j.extensionsUsed } : {}),
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: "ITAIKO_Rubber", mesh: 0 }],
  meshes: [{ name: "ITAIKO_Rubber", primitives: [{ attributes, indices, material: 0 }] }],
  // Double-sided: the cap is a single shell, and its back (the face's underside) has to show from behind.
  materials: [{ ...j.materials[prim.material ?? 0], name: "Rubber", doubleSided: true }],
  textures: j.textures, ...(j.samplers ? { samplers: j.samplers } : {}), images,
  accessors, bufferViews: views, buffers: [{ byteLength: offset }],
};
let js = Buffer.from(JSON.stringify(json));
if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
const header = Buffer.alloc(12);
header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + offset, 8);
const chunk = (length, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(length, 0); c.write(type, 4); return c; };
fs.mkdirSync(require("path").dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, chunk(js.length, "JSON"), js, chunk(offset, "BIN\0"), ...chunks]));
const ext = [0, 1, 2].map((k) => (Math.max(...P.filter((_, i) => i % 3 === k)) - Math.min(...P.filter((_, i) => i % 3 === k))) * 1000);
console.log(`${out}: ${P.length / 3} vertices, ${I.length / 3} triangles, ${ext.map((e) => e.toFixed(0)).join(" × ")} mm, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
