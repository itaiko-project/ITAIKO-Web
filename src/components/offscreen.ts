import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { whenIdle } from "./materials";

// One shared offscreen renderer for the page's still product shots (plate comparisons, onigiri close-ups). Shots
// are made at page load, one per idle moment, never when they scroll into view: compiling and rendering then would
// stutter the scroll. Each comes back as an image URL.

export const SHOT_W = 480, SHOT_H = 360; // CSS px of a shot; drawn at 2× for sharpness

let shared: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function offscreenRenderer() {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    shared.setPixelRatio(2);
    shared.setSize(SHOT_W, SHOT_H, false);
    shared.toneMapping = THREE.NeutralToneMapping;
    shared.toneMappingExposure = 1;
  }
  return shared;
}

/** One shot at a time (they share the renderer's canvas), each in its own idle moment. */
export function enqueueShot<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(() => whenIdle(3000)).then(job);
  queue = run.catch(() => undefined);
  return run;
}

/** A scene with the soft studio light the shots share. Call `dispose` when done with it. */
export function studioScene(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-1, 2.2, 1.4);
  const rim = new THREE.DirectionalLight(0xc8daff, 1.2);
  rim.position.set(1.5, 1, -2);
  scene.add(key, rim);
  return {
    scene,
    dispose() {
      scene.environment?.dispose();
      pmrem.dispose();
    },
  };
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
