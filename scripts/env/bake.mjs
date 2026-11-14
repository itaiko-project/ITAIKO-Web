// Bakes public/env/room.bin.gz (the viewer's environment lighting, see bake.js) through a headless Chromium
// driving scripts/env/bake.html on the dev server. Rerun after a three.js upgrade or a change to the environment.
//   chrome --headless=new --remote-debugging-port=9333 --use-angle=d3d11 about:blank
//   node scripts/env/bake.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const ORIGIN = process.env.SITE ?? "http://localhost:5173";
const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const waiting = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await send("Page.navigate", { url: `${ORIGIN}/scripts/env/bake.html` });
for (let i = 0; i < 100 && !(await ev("!!window.bakeReady")); i++) await new Promise((r) => setTimeout(r, 200));
const raw = Buffer.from(await ev("window.bake()"), "base64");
const width = raw.readUInt16LE(0), height = raw.readUInt16LE(2);
const half = new Uint16Array(raw.buffer.slice(raw.byteOffset + 4, raw.byteOffset + raw.length));

// Packed for size (decoded by bakedEnvironment() in src/components/materials.ts): each half float rounded to 6
// mantissa bits (under 0.8% error, finer than the 8-bit output) and kept as its top 12 bits, minus the texel
// above it (the layout is smooth top to bottom), then split into a high-byte and a low-byte plane, gzipped.
const DROP = 4, n = width * height * 3;
const q = half.map((v) => { const r = v + (1 << (DROP - 1)); return ((r & 0x7c00) === 0x7c00 ? v : r) >> DROP; });
const out = Buffer.alloc(4 + 2 * n);
out.writeUInt16LE(width, 0);
out.writeUInt16LE(height, 2);
for (let i = 0; i < n; i++) {
  const d = (q[i] - (i >= width * 3 ? q[i - width * 3] : 0)) & 0xfff;
  out[4 + i] = d >> 8;
  out[4 + n + i] = d & 0xff;
}
fs.mkdirSync("public/env", { recursive: true });
const gz = zlib.gzipSync(out, { level: 9 });
fs.writeFileSync("public/env/room.bin.gz", gz);
console.log(`public/env/room.bin.gz: ${width}x${height}, ${(gz.length / 1024).toFixed(0)} KB`);
ws.close();
