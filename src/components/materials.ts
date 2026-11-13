import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Shared by the drum scene and the plate comparison renders.

/** Phones: narrow screens get the lighter model, a lower pixel ratio and a cheaper floor reflection. */
export const PHONE = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
/**
 * The drum model. Phones get the variant with 1024 px textures (scripts/glb-mobile.cjs): 1 MB less to download and a
 * quarter of the texture memory. index.html preloads the same file by the same media query.
 */
export const MODEL_URL = PHONE ? "iTaiko.mobile.glb" : "iTaiko.webp.glb";
export const MODEL_BYTES = PHONE ? 1_574_424 : 2_569_528; // progress fallback when the server sends no Content-Length
/** Device pixel ratio the 3D canvases draw at: capped, since fill rate is what makes phones (and Firefox) stutter. */
export const PIXEL_RATIO = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, PHONE ? 1.5 : 1.75);

let resolveSceneReady!: () => void;
/** Resolves once the main drum scene is on screen (or after 10 s): secondary 3D work waits for it. */
export const sceneReady: Promise<void> = new Promise((resolve) => {
  resolveSceneReady = resolve;
  if (typeof window !== "undefined") setTimeout(resolve, 10000);
});
export const markSceneReady = () => resolveSceneReady();

/** Plywood Don + Ka halves, exported from the assembly 3MF by scripts/plywood-glb.cjs: mm, head frame, front at z = 0. */
export const PLYWOOD_URL = "plywood.glb";
/** The plywood face as built (mm): Don disc, Ka ring, and board thickness. */
export const PLY = { donR: 166.5, kaIn: 171.5, kaOut: 211.5, thickness: 12 };
const WOOD_TILE_MM = 450; // one texture across the whole 423 mm face: no visible repeat
const STEEL_TILE_MM = 250; // one repeat of the galvanized texture; its spangles come out ~8 mm across

/**
 * Birch veneer, drawn once into a canvas: pale base, a few broad tone drifts, then fine wavy grain lines along x.
 * Sized to cover the whole face in one tile, so it never needs to wrap seamlessly.
 */
export function birchTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  let seed = 7; // fixed seed: the same board on every visit
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  ctx.fillStyle = "#e6cfa3";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = rand() * size, y = rand() * size, r = 120 + rand() * 360;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.5 ? "255,240,214" : "176,128,72";
    g.addColorStop(0, `rgba(${tone},${0.05 + rand() * 0.08})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Rotary-cut birch: long, gently wandering lines, mostly faint, a few darker.
  for (let y = 0; y < size + 20;) {
    y += 2 + rand() * 7;
    const amp = 2 + rand() * 6, freq = 1 + Math.floor(rand() * 3), phase = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(122,82,40,${rand() < 0.15 ? 0.18 + rand() * 0.12 : 0.04 + rand() * 0.08})`;
    ctx.lineWidth = 0.6 + rand() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 16) {
      const yy = y + Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp + Math.sin(x * 0.031 + phase) * 1.2;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

export function birchMaterial(anisotropy: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map: birchTexture(anisotropy), roughness: 0.72, metalness: 0, ...options });
}

/**
 * Galvanized sheet steel. ExtrudeGeometry's UVs are in mm, so the repeat sets the texture's physical size.
 * `onTexture` fires as each map arrives (they load async), e.g. to request a redraw.
 */
export function galvanizedSteel(renderer: THREE.WebGLRenderer, options: THREE.MeshStandardMaterialParameters = {}, onTexture?: () => void) {
  // roughness scales the map (mean ~0.33) down to ~0.12: the real sheet reflects almost like a mirror. Extra
  // env reflection keeps a polished metal from going dark on a dim stage.
  const steel = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.35, envMapIntensity: 2.5, ...options });
  const loader = new THREE.TextureLoader();
  const pending: Promise<void>[] = [];
  const tex = (name: string, srgb = false) => {
    let done!: () => void;
    pending.push(new Promise((resolve) => (done = resolve)));
    return loader.load(`textures/galvanized-${name}.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.setScalar(1 / STEEL_TILE_MM);
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      steel.needsUpdate = true;
      renderer.initTexture(t); // upload now, not on the first frame the steel shows
      onTexture?.();
      done();
    }, undefined, () => done());
  };
  steel.map = tex("color", true);
  steel.roughnessMap = tex("roughness"); // the set's normal map is flat and its metalness map solid white
  return { material: steel, ready: Promise.all(pending).then(() => undefined) };
}

/**
 * Resolves when the browser is idle (or after `timeout` ms at the latest). Heavy one-off GPU work (shader compiles,
 * offscreen renders) is started this way at page load, so it never lands mid-scroll as a stutter.
 */
export function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout });
    else setTimeout(resolve, 200);
  });
}

let plywood: Promise<THREE.BufferGeometry> | null = null;

/** The plywood face as one flat-shaded geometry with planar UVs (mm). Loaded once and shared; clone before changing. */
export function loadPlywood(): Promise<THREE.BufferGeometry> {
  plywood ??= new GLTFLoader().loadAsync(PLYWOOD_URL).then((gltf) => {
    let source: THREE.BufferGeometry | undefined;
    gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) source ??= o.geometry; });
    if (!source) throw new Error("plywood.glb has no mesh");
    const geometry = source.toNonIndexed();
    source.dispose();
    geometry.computeVertexNormals(); // split vertices, so every face is flat
    const p = geometry.getAttribute("position");
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[2 * i] = p.getX(i) / WOOD_TILE_MM + 0.5;
      uv[2 * i + 1] = p.getY(i) / WOOD_TILE_MM + 0.5;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geometry;
  });
  return plywood;
}

/**
 * The same face reproportioned: another board thickness and Ka width, outer diameter and Don–Ka groove kept.
 * Radii are remapped per piece (Don scaled to its new radius, Ka squeezed into its new band), so the screw holes
 * come along, just slightly stretched.
 */
export function reproportionPlywood(source: THREE.BufferGeometry, thickness: number, kaWidth: number): THREE.BufferGeometry {
  const geometry = source.clone();
  const p = geometry.getAttribute("position") as THREE.BufferAttribute;
  const groove = PLY.kaIn - PLY.donR;
  const kaIn = PLY.kaOut - kaWidth, donR = kaIn - groove;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y);
    if (r < 1e-6) continue;
    const to = r <= (PLY.donR + PLY.kaIn) / 2
      ? (r * donR) / PLY.donR
      : kaIn + ((r - PLY.kaIn) * kaWidth) / (PLY.kaOut - PLY.kaIn);
    p.setXYZ(i, (x * to) / r, (y * to) / r, (p.getZ(i) * thickness) / PLY.thickness);
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
