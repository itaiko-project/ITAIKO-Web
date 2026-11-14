// Regenerates the site's pre-rendered images from the live 3D scene, through a headless Chromium:
//   public/static/{d,m}-{0..5}.webp  each slide's 3D content in its final state (desktop and phone layouts),
//   public/static/mini.webp          the small drum of the closing panel,
//   public/shots/*.webp + src/components/shots.json   the plate comparisons and the onigiri close-ups.
// Usage (dev server running on :5173):
//   chrome --headless=new --remote-debugging-port=9333 --enable-unsafe-swiftshader about:blank
//   node scripts/capture-static.mjs            (needs sharp: run with pnpm's node_modules resolvable)
import fs from "node:fs";
import { createRequire } from "node:module";
const sharp = createRequire(import.meta.url)("sharp"); // CommonJS resolution, so NODE_PATH works with pnpm

const ORIGIN = process.env.SITE ?? "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const waiting = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const webp = (base64, file) => sharp(Buffer.from(base64, "base64")).webp({ quality: 84 }).toFile(file);
await send("Page.enable");

// Everything that is not the 3D scene is hidden (layout kept), so each slot's rectangle shows only the scene.
const HIDE = `nav, [data-scroll-fade], .onigiri-hint, .fixed, button[aria-label] { visibility: hidden !important; }`;
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 22000); // software rendering is slow; a real GPU needs far less

// ONLY_LAYOUT=d or m: recapture just the desktop or the phone stills.
for (const [layout, width, height, dpr] of [["d", 1440, 900, 1.5], ["m", 412, 800, 3]].filter(([l]) => !process.env.ONLY_LAYOUT || process.env.ONLY_LAYOUT === l)) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: layout === "m" });
  await send("Page.navigate", { url: `${ORIGIN}/?3d=force&shots=live&hires` });
  await ev(`(async () => { for (;;) { const h = document.querySelector("canvas")?.parentElement; if (h && h.style.opacity === "1") return; await new Promise(r => setTimeout(r, 200)); } })()`);
  await ev(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(HIDE)}; document.head.append(s); })()`);
  const slides = await ev(`document.querySelectorAll("[data-section]").length`) - 1; // the last one has no 3D
  for (let k = 0; k < slides && !process.env.ONLY_SHOTS; k++) { // ONLY_SHOTS=1: just the product stills
    await ev(`(() => { const sc = document.querySelector(".snap-scroll"); sc.scrollTo({ top: sc.querySelector('[data-section="${k}"]').offsetTop, behavior: "instant" }); })()`);
    await sleep(k === 0 ? 3000 : SETTLE_MS);
    // The slot: the aria-hidden box of that section the scene frames itself on.
    const clip = await ev(`(() => { const r = document.querySelector('[data-section="${k}"] [aria-hidden]').getBoundingClientRect(); return { x: Math.max(r.x, 0), y: Math.max(r.y, 0), width: Math.min(r.width, innerWidth), height: Math.min(r.height, innerHeight - Math.max(r.y, 0)), scale: 1 }; })()`);
    const shot = await send("Page.captureScreenshot", { format: "png", clip });
    await webp(shot.result.data, `public/static/${layout}-${k}.webp`);
    if (k === 4) {
      // The stand slide again with its flash held on: the page blinks the stand by fading this over the plain still.
      await ev("window.__standFlash = true");
      await sleep(Math.max(SETTLE_MS / 4, 1500));
      await webp((await send("Page.captureScreenshot", { format: "png", clip })).result.data, `public/static/${layout}-${k}-flash.webp`);
      await ev("window.__standFlash = false");
    }
    console.log(`static/${layout}-${k}.webp`, Math.round(clip.width) + "x" + Math.round(clip.height));
  }
  if (layout !== "d") continue;
  if (process.env.ONLY_SHOTS) await sleep(1000);
  // Desktop pass only: the product stills (rendered live by ?shots=live) and the closing panel's small drum.
  const keys = ["steel-ours", "steel-original", "birch-ours", "birch-original", "onigiri-port", "onigiri-screen"];
  await ev(`(async () => { for (;;) { if (${JSON.stringify(keys)}.every(k => window.__shots?.[k])) return; await new Promise(r => setTimeout(r, 500)); } })()`);
  const manifest = {};
  for (const key of keys) {
    const data = await ev(`(async () => { const b = await (await fetch(window.__shots[${JSON.stringify(key)}].url)).blob(); const a = new Uint8Array(await b.arrayBuffer()); let s = ""; for (const c of a) s += String.fromCharCode(c); return btoa(s); })()`);
    const still = await sharp(Buffer.from(data, "base64")).webp({ quality: 86 }).toFile(`public/shots/${key}.webp`);
    if (still.size < 4000) throw new Error(`${key} came out empty (${still.size} B): run the capture again`);
    const { url: _url, ...dims } = await ev(`window.__shots[${JSON.stringify(key)}]`);
    if (Object.keys(dims).length) manifest[key] = dims;
    console.log(`shots/${key}.webp`);
  }
  fs.writeFileSync("src/components/shots.json", JSON.stringify(manifest, null, 2) + "\n");
  await ev(`(() => { const sc = document.querySelector(".snap-scroll"); sc.scrollTo({ top: sc.scrollHeight, behavior: "instant" }); })()`);
  await ev(`(async () => { for (;;) { const c = document.querySelectorAll("canvas"); if (c.length > 1 && c[c.length - 1].parentElement.style.opacity === "1") return; await new Promise(r => setTimeout(r, 300)); } })()`);
  await sleep(4000);
  const clip = await ev(`(() => { const c = document.querySelectorAll("canvas"); const r = c[c.length - 1].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`);
  if (!process.env.ONLY_SHOTS) await webp((await send("Page.captureScreenshot", { format: "png", clip })).result.data, "public/static/mini.webp");
  console.log("static/mini.webp");
}
ws.close();
