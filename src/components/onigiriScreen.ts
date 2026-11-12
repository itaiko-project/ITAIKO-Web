import * as THREE from "three";
import { OLED_H, OLED_W, type Onigiri } from "./oled";

// The onigiri's OLED, drawn from the firmware simulation's pixels. Shared by the live controller in the drum scene
// and the still render under it.

// The housing's opening over the screen quad (Controller_Low local space), measured from the mesh. The quad itself
// runs ~0.03 further on each side, under the bezel.
const SCREEN_WINDOW = { x0: -0.674, x1: 0.631, z0: 12.33, z1: 13.023 };
const SCREEN_PAD = 0.035;     // black border between the bezel and the first pixel column
const OLED_LIT = [0.86, 0.93, 1.0]; // linear RGB; SSD1306 white has a faint cool cast
const OLED_OFF = [0.004, 0.0045, 0.006]; // unlit pixels, barely visible against the black glass

/** Centre of the screen window, in Controller_Low's local space (y just above the glass). */
export const SCREEN_CENTER = new THREE.Vector3((SCREEN_WINDOW.x0 + SCREEN_WINDOW.x1) / 2, 0.85, (SCREEN_WINDOW.z0 + SCREEN_WINDOW.z1) / 2);

/**
 * Puts `oled` on the controller's screen quad (the mesh with the Schermo_MAT material). `upload()` pushes the
 * current pixels to the GPU; call it after the simulation changes the picture. Null if the model has no screen.
 */
export function oledScreen(controller: THREE.Object3D, oled: Onigiri) {
  let screen: THREE.Mesh | undefined;
  controller.traverse((o) => {
    if (o instanceof THREE.Mesh && [o.material].flat().some((m) => m.name === "Schermo_MAT")) screen = o;
  });
  if (!screen) return null;

  // One texel per OLED pixel, nearest-sampled.
  const texels = new Uint8Array(OLED_W * OLED_H);
  const texture = new THREE.DataTexture(texels, OLED_W, OLED_H, THREE.RedFormat);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  const upload = () => {
    for (let i = 0; i < texels.length; i++) texels[i] = oled.pixels[i] * 255;
    texture.needsUpdate = true;
  };
  upload();

  // The quad's own UVs point into the material atlas, and the housing's window is a little smaller than the
  // quad, so map the panel onto the window instead: centred, 2:1, inset by SCREEN_PAD. UV (0,0) is the panel's
  // top-left pixel; anything outside 0..1 is rendered as black glass.
  const { x0, x1, z0, z1 } = SCREEN_WINDOW;
  const width = Math.min(x1 - x0, ((z1 - z0) * OLED_W) / OLED_H) - 2 * SCREEN_PAD;
  const height = (width * OLED_H) / OLED_W;
  const left = (x0 + x1 - width) / 2, top = (z0 + z1 - height) / 2;
  const geometry = screen.geometry.clone();
  const pos = geometry.getAttribute("position");
  const uv = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (const i of new Set(geometry.index!.array)) uv.setXY(i, (pos.getX(i) - left) / width, (pos.getZ(i) - top) / height);
  geometry.setAttribute("uv", uv);
  screen.geometry.dispose();
  screen.geometry = geometry;
  for (const m of [screen.material].flat()) m.dispose();
  screen.material = new THREE.ShaderMaterial({
    uniforms: { panel: { value: texture }, opacity: { value: 1 } }, // opacity: set by the drum scene's fader
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D panel;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec2 grid = vec2(${OLED_W}.0, ${OLED_H}.0);
        vec2 p = vUv * grid;
        float inside = step(0.0, vUv.x) * step(vUv.x, 1.0) * step(0.0, vUv.y) * step(vUv.y, 1.0);
        float on = texture2D(panel, (floor(p) + 0.5) / grid).r * inside;
        vec3 lit = vec3(${OLED_LIT.join(", ")}), off = vec3(${OLED_OFF.join(", ")});
        gl_FragColor = vec4(mix(off * inside, lit, on), opacity);
        #include <colorspace_fragment>
      }`,
  });

  return { texture, upload, dispose: () => texture.dispose() };
}
