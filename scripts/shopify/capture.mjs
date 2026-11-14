// Renders the shop photos into foto_shopify/ through a headless Chromium driving scripts/shopify/render.html on
// the dev server. Usage (dev server on :5173, after scripts/rubber-glb.cjs has made foto_shopify/gomma.glb):
//   chrome --headless=new --remote-debugging-port=9333 --use-angle=d3d11 about:blank
//   node scripts/shopify/capture.mjs
import fs from "node:fs";

const ORIGIN = process.env.SITE ?? "http://localhost:5173";
const OUT = "foto_shopify";
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

await send("Page.enable");
await send("Page.navigate", { url: `${ORIGIN}/scripts/shopify/render.html` });
for (let i = 0; i < 100 && !(await ev("!!window.renderReady")); i++) await new Promise((r) => setTimeout(r, 200));
console.log("GPU:", await ev("window.rendererInfo()"));
fs.mkdirSync(OUT, { recursive: true });

const shots = [];
for (const model of ["pro", "standard"]) {
  for (const view of ["hero", "front"]) {
    shots.push({ name: `itaiko-${model}-${view === "hero" ? "3-4" : "frontale"}`, spec: { model, view, width: 3000, height: 3750 } });
  }
}
for (const view of ["rubber-front", "rubber-side", "rubber-back"]) {
  shots.push({ name: `gomma-${{ "rubber-front": "frontale", "rubber-side": "lato", "rubber-back": "retro" }[view]}`, spec: { model: "rubber", view, width: 3000, height: 3000 } });
}
shots.push({ name: "onigiri-frontale", spec: { model: "onigiri", view: "front", width: 3000, height: 3000 } });
shots.push({ name: "gomma-3-4", spec: { model: "rubber", view: "rubber-34", width: 3000, height: 3000 } });
shots.push({ name: "piastre-acciaio-frontale", spec: { model: "steel-plates", view: "front", width: 3000, height: 3000 } });
shots.push({ name: "piastre-legno-frontale", spec: { model: "wood-plates", view: "front", width: 3000, height: 3000 } });
// One wood plate each: the centre (Don) or the rim (Ka), left or right.
for (const part of ["center", "rim"]) {
  for (const side of ["left", "right"]) {
    const name = `piastra-legno-${{ center: "centro", rim: "bordo" }[part]}-${{ left: "sinistra", right: "destra" }[side]}`;
    shots.push({ name, spec: { model: "wood-plates", view: `${part}-${side}`, width: 3000, height: 3000 } });
  }
}
// ONLY=itaiko,onigiri: just the shots whose name starts with one of these.
const only = process.env.ONLY?.split(",");
for (const { name, spec } of shots.filter((s) => !only || only.some((o) => s.name.startsWith(o)))) {
  for (const transparent of [false, true]) {
    const file = `${OUT}/${name}${transparent ? "-trasparente" : ""}.png`;
    const url = await ev(`window.renderShot(${JSON.stringify({ ...spec, transparent })})`);
    fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    console.log(file, `${spec.width}x${spec.height}`);
  }
}
ws.close();
