import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildPlates } from "./plates";
import { birchMaterial, galvanizedSteel, loadPlywood, MODEL_URL, PLY, reproportionPlywood } from "./materials";
import { enqueueShot, offscreenRenderer, SHOT_H, SHOT_W, shotCamera, shotUrl, studioScene } from "./offscreen";
import { Onigiri } from "./oled";
import { oledScreen, SCREEN_CENTER } from "./onigiriScreen";
import type { Point } from "./dimension";

// The live renderers behind the page's still product shots. The site itself ships the stills as files
// (public/shots, positions in shots.json); this module only runs in dev with ?shots=live, which is how
// scripts/capture-static.mjs regenerates them after the models or the framing change.

export { enqueueShot };

// Close-up product renders of the plates for the ours-vs-original comparisons, made at page load by the shared
// offscreen renderer (offscreen.ts) and shown as images. The dimension arrows go on top as SVG in real pixels, so
// they stay crisp at any size.

export type Material = "steel" | "birch";
export type Spec = { material: Material; thickness: number; ka?: number; ours: boolean };
export type Dim = { a: Point; b: Point; side: Point }; // image-normalized (0..1)
export type Result = { url: string; thickness: Dim; ka?: Dim };

// Plates lie face up (front face at y = 0), seen from above the rim. Angles are around the plate from +z toward +x,
// in degrees; `frame` is the radius (mm) kept in view around the target. Each view is shared by ours and the
// original, so a pair compares at the same scale. Spots avoid the screw holes.
const VIEW: Record<Material, { r: number; deg: number; y: number; frame: number; camDeg: number; elevation: number; thickDeg: number; kaDeg?: number }> = {
  // Tight on the rim: at 40 mm of frame the 3 mm edge came out ~6 px on screen.
  steel: { r: 200, deg: 46, y: -1.5, frame: 24, camDeg: 92, elevation: 28, thickDeg: 46 },
  birch: { r: 178, deg: 40, y: -6, frame: 70, camDeg: 95, elevation: 30, thickDeg: 52, kaDeg: 30 },
};

export async function renderPlate({ material, thickness, ka, ours }: Spec): Promise<Result> {
  const r = offscreenRenderer();
  const view = VIEW[material];
  const studio = studioScene();
  const scene = studio.scene;

  const disposables: { dispose(): void }[] = [];
  if (material === "steel") {
    const steel = galvanizedSteel(r);
    await steel.ready;
    const plates = buildPlates(steel.material, thickness);
    plates.rotation.x = -Math.PI / 2; // plate z (out of the face) → world y
    plates.position.y = -thickness;   // front face at y = 0, like the plywood
    scene.add(plates);
    plates.traverse((o) => { if (o instanceof THREE.Mesh) disposables.push(o.geometry); });
    disposables.push(steel.material, steel.material.map!, steel.material.roughnessMap!);
  } else {
    const base = await loadPlywood(); // shared with the drum scene: never disposed here
    const geometry = ours ? base : reproportionPlywood(base, thickness, ka ?? PLY.kaOut - PLY.kaIn);
    if (!ours) disposables.push(geometry);
    const wood = birchMaterial(r.capabilities.getMaxAnisotropy());
    disposables.push(wood, wood.map!);
    const mesh = new THREE.Mesh(geometry, wood);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
  }

  // Around the plate: world point at radius r and angle deg (0° = +z, toward +x).
  const around = (radius: number, deg: number, y: number) => {
    const a = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(radius * Math.sin(a), y, radius * Math.cos(a));
  };
  const camera = shotCamera(around(view.r, view.deg, view.y), view.camDeg, view.elevation, view.frame);

  r.render(scene, camera);
  const url = await shotUrl(r);

  const toImage = (v: THREE.Vector3): Point => {
    const p = v.clone().project(camera);
    return [(p.x + 1) / 2, (1 - p.y) / 2];
  };
  const centre = toImage(new THREE.Vector3());
  const away = (p: Point): Point => [p[0] - centre[0], p[1] - centre[1]];
  const top = toImage(around(PLY.kaOut, view.thickDeg, 0));
  const result: Result = { url, thickness: { a: top, b: toImage(around(PLY.kaOut, view.thickDeg, -thickness)), side: away(top) } };
  if (ka && view.kaDeg !== undefined) {
    result.ka = { a: toImage(around(PLY.kaOut - ka, view.kaDeg, 0)), b: toImage(around(PLY.kaOut, view.kaDeg, 0)), side: [0, -1] };
  }

  for (const d of disposables) d.dispose();
  studio.dispose();
  return result;
}

// Still close-ups of the onigiri for under its slide, made at page load by the shared offscreen renderer:
//  - "port": from underneath, cable unplugged, up the channel at the JTAG-8 socket;
//  - "screen": straight down on the OLED showing the firmware's main menu, the one you can drive on the live model.
// Coordinates are Controller_Low's own (the GLB's): housing z 9.0 (back, the ears) to 13.75 (front), top at y 0.84.

export type OnigiriShot = "port" | "screen";

// The JTAG-8 socket: 2 × 4 pins (x -0.24…0.14, y 0.15…0.31) facing back at z ≈ 10.75, at the end of the channel
// in the underside the cable runs along. (The port up in the back face, between the ears, is the USB-C.)
const SOCKET = new THREE.Vector3(-0.04, 0.22, 10.75);
// `up`: the scene direction that points up in the picture.
const ONIGIRI_VIEW: Record<OnigiriShot, { target: THREE.Vector3; azimuth: number; elevation: number; frame: number; up: THREE.Vector3 }> = {
  // From below and behind, up the channel; rolled 180° so the socket faces up in the picture.
  port: { target: SOCKET, azimuth: 195, elevation: -38, frame: 0.75, up: new THREE.Vector3(0, -1, 0) },
  // Straight down on the screen, the onigiri's back (its ears, -z) at the top, so the menu reads upright.
  screen: { target: SCREEN_CENTER, azimuth: 0, elevation: 90, frame: 0.8, up: new THREE.Vector3(0, 0, -1) },
};

let model: Promise<GLTF> | null = null; // the drum GLB (already in the browser cache from the scene above)

export async function renderOnigiri(shot: OnigiriShot): Promise<string> {
  model ??= new GLTFLoader().loadAsync(MODEL_URL);
  const source = (await model).scene.getObjectByName("Controller_Low");
  if (!source) throw new Error("no controller in the model");
  // A clone per shot: it shares geometry and textures, and the screen gets its own mesh and material below.
  const controller = source.clone(true);
  controller.position.set(0, 0, 0);
  controller.updateMatrixWorld(true);

  const r = offscreenRenderer();
  const studio = studioScene();
  studio.scene.add(controller);
  const view = ONIGIRI_VIEW[shot];
  const camera = shotCamera(view.target, view.azimuth, view.elevation, view.frame);
  camera.up.copy(view.up);
  camera.lookAt(view.target);
  camera.updateMatrixWorld();

  let screen: ReturnType<typeof oledScreen> = null;
  if (shot === "screen") {
    // Boot past the splash, then one press of + opens the main menu, as on the page above.
    const oled = new Onigiri(0);
    oled.update(2100);
    oled.press("start", true);
    oled.update(2110);
    oled.press("start", false);
    oled.update(2120);
    screen = oledScreen(controller, oled);
  } else {
    // A light from the camera's side, so the recessed socket isn't lost in shadow.
    const into = new THREE.PointLight(0xffffff, 6, 0, 1.2);
    into.position.copy(camera.position).lerp(view.target, 0.4);
    studio.scene.add(into);
  }

  r.setSize(SHOT_W, SHOT_H, false);
  r.render(studio.scene, camera);
  const url = await shotUrl(r);

  screen?.dispose();
  studio.dispose();
  return url;
}
