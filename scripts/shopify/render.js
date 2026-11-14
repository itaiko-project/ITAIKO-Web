// High-resolution product renders for the shop, in the site's look (the first slide's lights, tone mapping and
// floor reflection). Loaded by render.html on the dev server; capture.mjs calls window.renderShot(spec).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { OLED_PANEL } from "/src/components/onigiriScreen.ts";
import { OLED_H, OLED_W } from "/src/components/oled.ts";
import { buildPlates } from "/src/components/plates.ts";
import { birchMaterial, galvanizedSteel, loadPlywood } from "/src/components/materials.ts";

// The site's stage (src/components/DrumViewer.tsx), copied: same numbers, same look.
const ENV_INTENSITY = 0.3, KEY = 2.2, FILL = 0.7, BACK = 2.6, EXPOSURE = 0.95;
const FLOOR_STRENGTH = 0.24, FLOOR_RADIUS = 1.6, HERO_TURN = 0.6;
const BACKGROUND = 0x0a0a0a;

const loader = new GLTFLoader();
const cache = new Map();
// High-resolution sources (project root, served by the dev server): the full Pro with 4-8K textures, the rope-less
// drum, and the onigiri controller on its own (stood upright, front towards +Z).
const PRO_URL = "/iTaiko+Controller+Cavo_GLB.glb";
const NO_ROPE_URL = "/TaikoNoRope_HD.glb";
const ONIGIRI_URL = "/ControllerGLB.glb";
const load = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

function lights(radius) {
  const key = new THREE.SpotLight(0xffffff, KEY, 0, 0.85, 1);
  key.position.set(radius * 1.6, radius * 2.2, radius * 1.8);
  key.decay = 0;
  key.target.position.set(0, 0, 0);
  const fill = new THREE.DirectionalLight(0xc8daff, FILL);
  fill.position.set(-radius * 2.2, radius * 0.8, radius * 1.2);
  const rim = new THREE.DirectionalLight(0xffffff, BACK);
  rim.position.set(-radius * 0.8, radius * 1.8, -radius * 2.4);
  return [key, key.target, fill, rim];
}

/** The site's floor: a mirror disc that fades out with distance and into the page. */
function floor(radius, y, size) {
  const mirror = new Reflector(new THREE.CircleGeometry(radius * FLOOR_RADIUS, 96), { textureWidth: size, textureHeight: size, color: 0x999999 });
  mirror.rotateX(-Math.PI / 2);
  mirror.position.y = y;
  const material = mirror.material;
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("varying vec4 vUv;", "varying vec4 vUv;\nvarying vec2 vLocal;")
      .replace("vUv = textureMatrix", "vLocal = position.xy;\n\t\t\tvUv = textureMatrix");
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec4 vUv;", "varying vec4 vUv;\nvarying vec2 vLocal;")
      .replace(
        `vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );`,
        `vec2 uv = vUv.xy / vUv.w;
			float d = length( vLocal ) / ${radius.toFixed(4)};
			vec2 edge = min( uv, 1.0 - uv );
			float border = smoothstep( 0.0, 0.05, min( edge.x, edge.y ) );
			vec4 base = texture2D( tDiffuse, uv );
			vec3 reflected = base.rgb / max( base.a, 0.0001 );
			float a = ${FLOOR_STRENGTH} * ( 1.0 - smoothstep( 0.05, 0.85, d ) );
			a *= border * base.a;
			gl_FragColor = vec4( reflected, a );`,
      );
  };
  return mirror;
}

// The upright controller file vs the controller inside the drum model (where OLED_PANEL is measured): same mesh,
// stood up: drum-frame z (towards the player) is 13.827 minus the upright y.
const UPRIGHT_Z0 = 13.827;
const ONIGIRI_WHITE = 1.18; // the plastic a little brighter than its texture: it should read as clean white

/** The ITAIKO pixel logo (public/itaiko.png, 128×64) as the OLED's lit pixels. */
async function logoPixels() {
  const bitmap = await createImageBitmap(await (await fetch("/itaiko.png")).blob());
  const canvas = new OffscreenCanvas(OLED_W, OLED_H);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, OLED_W, OLED_H);
  const { data } = ctx.getImageData(0, 0, OLED_W, OLED_H);
  const texels = new Uint8Array(OLED_W * OLED_H);
  for (let i = 0; i < texels.length; i++) texels[i] = data[i * 4 + 3] > 128 && data[i * 4] > 128 ? 255 : 0;
  return texels;
}

/** Puts the logo on the upright controller's screen quad, like the site's OLED (onigiriScreen.ts). */
async function oledLogo(controller) {
  let screen;
  controller.traverse((o) => { if (o.isMesh && [o.material].flat().some((m) => m.name === "Schermo_MAT")) screen = o; });
  if (!screen) return;
  const texture = new THREE.DataTexture(await logoPixels(), OLED_W, OLED_H, THREE.RedFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const { left, top, width, height } = OLED_PANEL;
  const geometry = screen.geometry.clone();
  const pos = geometry.getAttribute("position");
  const uv = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - left) / width, (UPRIGHT_Z0 - pos.getY(i) - top) / height);
  geometry.setAttribute("uv", uv);
  screen.geometry = geometry;
  screen.material = new THREE.ShaderMaterial({
    uniforms: { panel: { value: texture } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D panel;
      varying vec2 vUv;
      void main() {
        float inside = step(0.0, vUv.x) * step(vUv.x, 1.0) * step(0.0, vUv.y) * step(vUv.y, 1.0);
        float on = texture2D(panel, vUv).r * inside;
        gl_FragColor = vec4(mix(vec3(0.004, 0.0045, 0.006) * inside, vec3(0.86, 0.93, 1.0), on), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// The plywood face in two parts: the Don disc (centre, r <= 166.5 mm) and the Ka ring (rim, 171.5-211.5 mm).
const DON_KA_SPLIT_MM = 169;
/** The triangles of the plywood face in the centre disc (center = true) or the rim ring. */
function plywoodPart(source, center) {
  const g = source.index ? source.toNonIndexed() : source;
  const pos = g.getAttribute("position");
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    if ((Math.hypot(x, y) < DON_KA_SPLIT_MM) === center) keep.push(t, t + 1, t + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const data = new attr.array.constructor(keep.length * attr.itemSize);
    keep.forEach((v, i) => { for (let c = 0; c < attr.itemSize; c++) data[i * attr.itemSize + c] = attr.array[v * attr.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(data, attr.itemSize, attr.normalized));
  }
  return out;
}

let renderer = null;
function getRenderer(width, height) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    document.body.append(renderer.domElement);
  }
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  return renderer;
}

/**
 * spec: { model: "pro" | "standard" | "rubber" | "onigiri" | "steel-plates" | "wood-plates", view: "hero" | "front" |
 * "left" | "right" | "rubber-front" | "rubber-side" | "rubber-back" | "rubber-34", width, height, transparent }.
 * Returns a PNG data URL.
 */
window.renderShot = async ({ model, view, width, height, transparent }) => {
  const r = getRenderer(width, height);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = ENV_INTENSITY;
  r.setClearColor(BACKGROUND, transparent ? 0 : 1);

  const group = new THREE.Group();
  let radius, floorY, target, dir, fill, floorMesh = null;
  let even = false; // flat plates: even studio light instead of the stage's
  if (model === "rubber") {
    const rubber = (await load("/foto_shopify/gomma.glb")).scene.clone(true);
    rubber.traverse((o) => { if (o.isMesh) o.material.side = THREE.DoubleSide; }); // the back is the face's underside
    group.add(rubber);
    radius = 0.25; // m: the cap is Ø 474 mm
    target = new THREE.Vector3(0, 0, -0.027);
    if (view === "rubber-34") {
      // As it sits on the Pro in that model's 3/4 photo: leaning back like the drum head (the GLB was stood up by
      // undoing that 34.8 degree lean), turned like the drum, the same camera, on the mirror floor.
      rubber.rotation.x = -THREE.MathUtils.degToRad(34.8);
      group.rotation.y = HERO_TURN;
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      target = box.getCenter(new THREE.Vector3());
      floorY = box.min.y;
      dir = new THREE.Vector3(0, 0.3, 1).normalize();
      if (!transparent) floorMesh = floor(radius, floorY, 2048);
    } else {
      const [ang, elev] = { "rubber-front": [0, 8], "rubber-side": [90, 8], "rubber-back": [180, 8] }[view];
      const a = THREE.MathUtils.degToRad(ang), e = THREE.MathUtils.degToRad(elev);
      dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    }
    fill = 0.9;
  } else if (model === "steel-plates" || model === "wood-plates") {
    // The playing-face plates as on the site (its own geometry and materials), stood up facing the camera on the
    // mirror floor. "left" / "right": one half, cut at the split (x = 0); wood also "center-left", "rim-right"...:
    // one plate, the Don disc or the Ka ring half.
    even = true;
    const [part, side] = view.includes("-") ? view.split("-") : [null, view];
    let plates;
    if (model === "steel-plates") {
      const steel = galvanizedSteel(r);
      await steel.ready;
      plates = buildPlates(steel.material);
    } else {
      plates = new THREE.Mesh(await loadPlywood(), birchMaterial(r.capabilities.getMaxAnisotropy()));
    }
    const box = new THREE.Box3().setFromObject(plates);
    radius = box.getBoundingSphere(new THREE.Sphere()).radius; // a part at the same scale as the whole set
    if (part) {
      plates.geometry = plywoodPart(plates.geometry, part === "center");
      box.setFromObject(plates);
    }
    if (side === "left") box.max.x = Math.min(box.max.x, 0); // frame the kept half only
    if (side === "right") box.min.x = Math.max(box.min.x, 0);
    const center = box.getCenter(new THREE.Vector3());
    plates.position.sub(center);
    if (side === "left" || side === "right") {
      // Clipping planes are in world space: the split (x = 0) has moved to x = -center.x with the plates.
      const split = -center.x;
      const keep = side === "left" ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), split) : new THREE.Plane(new THREE.Vector3(1, 0, 0), -split);
      plates.traverse((o) => { if (o.isMesh) o.material = Object.assign(o.material.clone(), { clippingPlanes: [keep] }); });
      r.localClippingEnabled = true;
    }
    group.add(plates);
    floorY = box.min.y - center.y;
    target = new THREE.Vector3(0, 0, 0);
    dir = new THREE.Vector3(0, 0, 1);
    fill = 1.1;
    if (!transparent) floorMesh = floor(radius, floorY, 2048);
  } else if (model === "onigiri") {
    // Straight on, standing on the mirror floor.
    const oni = (await load(ONIGIRI_URL)).scene.clone(true);
    const box = new THREE.Box3().setFromObject(oni);
    const center = box.getCenter(new THREE.Vector3());
    oni.position.sub(center);
    oni.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [o.material].flat()) {
        m.dithering = true;
        if (m.name !== "Controller_MAT") continue;
        m.aoMap = null; // no baked soft shadows around the keys
        m.color.setScalar(ONIGIRI_WHITE);
        m.needsUpdate = true;
      }
    });
    await oledLogo(oni);
    group.add(oni);
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    floorY = box.min.y - center.y;
    target = new THREE.Vector3(0, 0, 0);
    dir = new THREE.Vector3(0, 0, 1);
    fill = 1.05;
    if (!transparent) floorMesh = floor(radius, floorY, 2048);
  } else {
    // Framing always from the Pro model (rope included), so both versions come out at the same size.
    const pro = (await load(PRO_URL)).scene;
    const sphere = new THREE.Box3().setFromObject(pro).getBoundingSphere(new THREE.Sphere());
    let drum;
    if (model === "pro") drum = pro.clone(true);
    else {
      drum = new THREE.Group();
      drum.add((await load(NO_ROPE_URL)).scene.clone(true));
      // The rope-less file has the drum only: the onigiri and its cable come from the Pro model (same coordinates).
      for (const name of ["Controller_Low", "Cavo_Low"]) drum.add(pro.getObjectByName(name).clone(true));
    }
    drum.position.sub(sphere.center);
    drum.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) m.dithering = true; });
    radius = sphere.radius * 1.05;
    floorY = -sphere.center.y;
    group.add(drum);
    if (view === "hero") {
      drum.rotation.y = HERO_TURN; // the first slide's three-quarter pose
      target = new THREE.Vector3(0, -radius * 0.18, 0);
      dir = new THREE.Vector3(0, 0.3, 1).normalize();
      fill = 1.55;
    } else {
      // Straight on, a little above: the drum face-on with the onigiri in front of it.
      target = new THREE.Vector3(0, -radius * 0.12, 0);
      const e = THREE.MathUtils.degToRad(12);
      dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
      fill = 1.55;
    }
    if (!transparent) floorMesh = floor(radius, floorY, 2048);
  }
  if (even) {
    // Flat plates under the stage lights came out bright on top and dark below (the room's ceiling lights reflected
    // in the steel, the key light from above). Even studio light instead: a uniform environment, plus a soft light
    // from the camera's side for the wood (the steel, a mirror, would only show it as a hot spot).
    scene.environment.dispose();
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(0xffffff);
    if (model === "steel-plates") {
      // A very light shading for the steel: the studio a few percent brighter above than below. The flat plate
      // reflects a band of about +-15 degrees around the horizon, so this comes out as a gentle top-to-bottom fade.
      const dome = new THREE.SphereGeometry(10, 32, 16);
      const colors = [];
      const pos = dome.getAttribute("position");
      for (let i = 0; i < pos.count; i++) colors.push(...Array(3).fill(Math.min(1.4, Math.max(0.35, 0.9 + 2.5 * (pos.getY(i) / 10)))));
      dome.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      studio.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      scene.environmentIntensity = 0.32 / 0.9; // the same mean brightness as the flat studio
    }
    scene.environment = pmrem.fromScene(studio).texture;
    if (model !== "steel-plates") scene.environmentIntensity = 0.55;
    scene.add(group);
    if (model === "wood-plates") {
      const front = new THREE.DirectionalLight(0xffffff, 1.5);
      front.position.set(0, radius * 0.8, radius * 4);
      scene.add(front);
    }
  } else scene.add(group, ...lights(radius));

  const camera = new THREE.PerspectiveCamera(30, width / height, radius * 0.01, radius * 20);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect));
  const dist = radius / Math.sin(fov / 2) / fill;
  camera.position.copy(dir).multiplyScalar(dist).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // Centre the subject: a small alpha-only probe render (no floor) finds its bounding box, then the camera pans
  // (same direction, same distance) so the box sits in the middle. Identical for the dark and transparent takes.
  {
    const pw = 300, ph = Math.round((300 * height) / width);
    const probe = new THREE.WebGLRenderTarget(pw, ph);
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(probe);
    r.render(scene, camera);
    const px = new Uint8Array(pw * ph * 4);
    r.readRenderTargetPixels(probe, 0, 0, pw, ph, px);
    r.setRenderTarget(null);
    probe.dispose();
    let x0 = pw, x1 = -1, y0 = ph, y1 = -1;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      if (px[(y * pw + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 >= 0) {
      const cx = ((x0 + x1 + 1) / 2 / pw) * 2 - 1, cy = ((y0 + y1 + 1) / 2 / ph) * 2 - 1; // NDC, y up (rows from the bottom)
      const halfH = dist * Math.tan(vFov / 2), halfW = halfH * camera.aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const pan = right.multiplyScalar(cx * halfW).add(up.multiplyScalar(cy * halfH));
      camera.position.add(pan);
      target.add(pan);
      camera.lookAt(target);
    }
    r.setClearColor(BACKGROUND, transparent ? 0 : 1);
  }
  if (floorMesh) scene.add(floorMesh);

  await r.compileAsync(scene, camera);
  r.render(scene, camera);
  const url = r.domElement.toDataURL("image/png");
  scene.environment.dispose();
  pmrem.dispose();
  return url;
};
window.rendererInfo = () => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
};
window.renderReady = true;
