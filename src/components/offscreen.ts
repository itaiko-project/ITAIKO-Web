import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { sceneReady, whenIdle } from "./materials";

// One shared offscreen renderer for the page's still product shots (plate comparisons, onigiri close-ups). Shots
// are made once the main drum scene is up, one per idle moment, never when they scroll into view: compiling and
// rendering then would stutter the scroll. Each comes back as an image URL. When the queue runs dry the renderer
// and its GL context are released: three live contexts is a lot of memory on a phone.

export const SHOT_W = 480, SHOT_H = 360; // CSS px of a shot; drawn at 2× for sharpness

let shared: { renderer: THREE.WebGLRenderer; pmrem: THREE.PMREMGenerator; environment: THREE.Texture } | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

function acquire() {
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(2);
    renderer.setSize(SHOT_W, SHOT_H, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    // The studio's environment light, prefiltered once and shared by every shot.
    const pmrem = new THREE.PMREMGenerator(renderer);
    shared = { renderer, pmrem, environment: pmrem.fromScene(new RoomEnvironment(), 0.04).texture };
  }
  return shared;
}

function release() {
  if (!shared) return;
  shared.environment.dispose();
  shared.pmrem.dispose();
  shared.renderer.dispose();
  shared.renderer.forceContextLoss();
  shared = null;
}

export function offscreenRenderer() {
  return acquire().renderer;
}

/** One shot at a time (they share the renderer's canvas), each in its own idle moment, after the main scene. */
export function enqueueShot<T>(job: () => Promise<T>): Promise<T> {
  pending++;
  const run = queue.then(() => sceneReady).then(() => whenIdle(3000)).then(job);
  queue = run.catch(() => undefined).then(() => {
    // A moment's grace before letting go, in case more shots are queued right after (another component mounting).
    if (--pending === 0) setTimeout(() => { if (pending === 0) release(); }, 2000);
  });
  return run;
}

/** The canvas as a compact image URL (WebP with alpha; PNG where the browser cannot encode WebP). */
export function shotUrl(renderer: THREE.WebGLRenderer): Promise<string> {
  return new Promise((resolve) => {
    renderer.domElement.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : renderer.domElement.toDataURL("image/png")),
      "image/webp", 0.9,
    );
  });
}

/** A scene with the soft studio light the shots share. Call `dispose` when done with it. */
export function studioScene() {
  const scene = new THREE.Scene();
  scene.environment = acquire().environment;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-1, 2.2, 1.4);
  const rim = new THREE.DirectionalLight(0xc8daff, 1.2);
  rim.position.set(1.5, 1, -2);
  scene.add(key, rim);
  return { scene, dispose() { scene.environment = null; } };
}

/** A camera at `elevation`° above, `azimuth`° around (0 = from +z, 90 = from +x), keeping `frame` around `target`. */
export function shotCamera(target: THREE.Vector3, azimuth: number, elevation: number, frame: number) {
  const camera = new THREE.PerspectiveCamera(30, SHOT_W / SHOT_H, frame * 0.02, frame * 200);
  const e = THREE.MathUtils.degToRad(elevation), c = THREE.MathUtils.degToRad(azimuth);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect));
  const dist = frame / Math.sin(fov / 2);
  camera.position.set(Math.sin(c) * Math.cos(e), Math.sin(e), Math.cos(c) * Math.cos(e)).multiplyScalar(dist).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}
