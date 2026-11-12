import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Onigiri } from "./oled";
import { oledScreen, SCREEN_CENTER } from "./onigiriScreen";
import { enqueueShot, offscreenRenderer, SHOT_H, SHOT_W, shotCamera, studioScene } from "./offscreen";

// Still close-ups of the onigiri for under its slide, made at page load by the shared offscreen renderer:
//  - "port": from underneath, cable unplugged, up the channel at the JTAG-8 socket;
//  - "screen": straight down on the OLED showing the firmware's main menu, the one you can drive on the live model.
// Coordinates are Controller_Low's own (the GLB's): housing z 9.0 (back, the ears) to 13.75 (front), top at y 0.84.

export type OnigiriShot = "port" | "screen";

// The JTAG-8 socket: 2 × 4 pins (x -0.24…0.14, y 0.15…0.31) facing back at z ≈ 10.75, at the end of the channel
// in the underside the cable runs along. (The port up in the back face, between the ears, is the USB-C.)
const SOCKET = new THREE.Vector3(-0.04, 0.22, 10.75);
// `up`: the scene direction that points up in the picture.
const VIEW: Record<OnigiriShot, { target: THREE.Vector3; azimuth: number; elevation: number; frame: number; up: THREE.Vector3 }> = {
  // From below and behind, up the channel; rolled 180° so the socket faces up in the picture.
  port: { target: SOCKET, azimuth: 195, elevation: -38, frame: 0.75, up: new THREE.Vector3(0, -1, 0) },
  // Straight down on the screen, the onigiri's back (its ears, -z) at the top, so the menu reads upright.
  screen: { target: SCREEN_CENTER, azimuth: 0, elevation: 90, frame: 0.8, up: new THREE.Vector3(0, 0, -1) },
};

let model: Promise<GLTF> | null = null; // the drum GLB (already in the browser cache from the scene above)

async function renderOnigiri(shot: OnigiriShot): Promise<string> {
  model ??= new GLTFLoader().loadAsync("iTaiko.webp.glb");
  const source = (await model).scene.getObjectByName("Controller_Low");
  if (!source) throw new Error("no controller in the model");
  // A clone per shot: it shares geometry and textures, and the screen gets its own mesh and material below.
  const controller = source.clone(true);
  controller.position.set(0, 0, 0);
  controller.updateMatrixWorld(true);

  const r = offscreenRenderer();
  const studio = studioScene(r);
  studio.scene.add(controller);
  const view = VIEW[shot];
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
  const url = r.domElement.toDataURL("image/png");

  screen?.dispose();
  studio.dispose();
  return url;
}

/** A pre-rendered close-up of the onigiri with a caption under it. */
export default function OnigiriRender({ shot, caption }: { shot: OnigiriShot; caption: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    enqueueShot(() => (cancelled ? Promise.reject(new Error("unmounted")) : renderOnigiri(shot)))
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => undefined); // no WebGL: the caption still says it
    return () => { cancelled = true; };
  }, [shot]);

  return (
    <figure className="select-none">
      <div className="relative w-full overflow-hidden rounded-lg border bg-foreground/[0.03]" style={{ aspectRatio: `${SHOT_W} / ${SHOT_H}` }}>
        {url
          ? <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full" />
          : <div className="absolute inset-[18%] rounded-full bg-foreground/5 animate-pulse" />}
      </div>
      <figcaption className="mt-2 font-mono text-xs md:text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
