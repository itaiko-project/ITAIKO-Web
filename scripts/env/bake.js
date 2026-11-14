// The site's image-based lighting, baked: PMREMGenerator.fromScene(RoomEnvironment, 0.04), exactly as the viewer
// used to build it at load, read back as raw half floats (RGB only: the CubeUV lookup never reads alpha).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

window.bake = () => {
  const renderer = new THREE.WebGLRenderer();
  const rt = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04);
  const { width, height } = rt;
  const rgba = new Uint16Array(width * height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, rgba);
  const out = new Uint16Array(2 + width * height * 3);
  out[0] = width;
  out[1] = height;
  for (let i = 0, o = 2; i < rgba.length; i += 4, o += 3) out.set(rgba.subarray(i, i + 3), o);
  let s = "";
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
window.bakeReady = true;
