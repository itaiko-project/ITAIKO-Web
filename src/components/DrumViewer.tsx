import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { Onigiri, OLED_H, OLED_W, type Button } from "./oled";
import { buildPlates } from "./plates";

const MODEL_URL = "iTaiko.webp.glb";
const MODEL_BYTES = 2_569_528; // progress fallback when the server sends no Content-Length

// Stage look — tune these, everything else derives from the model's size.
const FILL = 1.25;          // >1 crops the bounding sphere a little so the drum is not lost in whitespace
const ENV_INTENSITY = 0.3;  // soft ambient bounce; the three lights below do the shaping
const KEY_INTENSITY = 2.2;  // neutral white, high and off to one side — the light you actually see
const FILL_INTENSITY = 0.7; // cool and dim, opposite the key, just to lift the shadow side
const BACK_INTENSITY = 2.6; // behind the drum, rakes the rope so it separates from the background
const EXPOSURE = 0.95;
const FLOOR_STRENGTH = 0.24; // restrained reflection right under the drum
const MIRROR_BLUR = 0.0;    // keep bright reflections from bleeding into a broad floor halo
const MIRROR_SPREAD = 0.04; // only a trace of distance softening
const FLOOR_RADIUS = 1.6;   // mirror disc radius, in bounding-sphere radii
const MIRROR_MAX = 2048;    // longest side of the reflection render target
const DETAIL_FILL = 1.02;   // controller slide: >1 leaves breathing room around the onigiri, lower zooms closer

// The rubber head, measured off the mesh (GLB space): centre of its front face, and its lean back from vertical.
// The plates are sized to it at 0.05 units/mm, which puts their 211.5 mm rim just inside the 10.62 head radius.
const HEAD_CENTER = new THREE.Vector3(0, 14.69, 0.81);
const HEAD_TILT = THREE.MathUtils.degToRad(34.8);
const HEAD_NORMAL = new THREE.Vector3(0, Math.sin(HEAD_TILT), Math.cos(HEAD_TILT));
const PLATE_SCALE = 0.05;
const PLATES_LIFT = 3;      // how far the exploded plates float out in front of the head, in model units
const PLATES_REVEAL_S = 0.45; // the rise plays on its own clock once you're at the stop, however fast you scrolled
const STEEL_TILE_MM = 250;  // one repeat of the galvanized texture; its spangles come out ~8 mm across

const UP = new THREE.Vector3(0, 1, 0);
const CONTROLLER_ELEVATION = Math.atan2(1, 0.06); // near-overhead, without a singular lookAt at 90°

/**
 * A close-up between the hero and the controller. Coordinates are in the GLB's own space (before centring),
 * read off the model: the head faces +z, leans back ~35°, and stands on the floor at y = 0.
 */
export type TourStop = {
  slot: React.RefObject<HTMLElement | null>; // empty box in that section the camera frames
  target: [number, number, number];         // what the camera looks at
  size: number;                              // radius around target to fit in the slot
  yaw: number;                               // degrees around the drum, 0 = front, 90 = its right side
  elevation: number;                         // degrees above the horizon
  plates?: boolean;                          // slide the steel plates out of the head at this stop
};

type Pose = { box: { left: number; top: number; width: number; height: number }; target: THREE.Vector3; yaw: number; elevation: number; dist: number };

/**
 * Interactive 3D drum on a reflective stage. Drag to spin.
 * The canvas is meant to be full-bleed so the reflection never gets clipped; `focusRef` points at
 * the (empty) element holding the drum's place in the layout, and the camera frames that box.
 * Scrolling flies the camera through `tour` (one section each, right after the hero) and then onto the
 * controller in the section after those.
 */
export default function DrumViewer({ className, style, focusRef, controllerRef, scrollRef, tour = [], hint, onProgress }: {
  className?: string;
  /** 0..1 while the model downloads; 1 once it is on screen. */
  onProgress?: (progress: number) => void;
  /** Label for the arrow pointing at + on the controller slide, until the first press. */
  hint?: string;
  style?: React.CSSProperties;
  focusRef?: React.RefObject<HTMLElement | null>;
  controllerRef?: React.RefObject<HTMLElement | null>;
  scrollRef?: React.RefObject<HTMLElement | null>;
  tour?: TourStop[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hintLabelRef = useRef<HTMLSpanElement | null>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current!;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Neutral rolls the highlights off instead of clipping them — the drum head is near-white and
    // ACES was flattening it into a paper cutout.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    // ponytail: pan-y keeps vertical page scroll working on touch; drum spins on horizontal drags only.
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab";
    host.appendChild(renderer.domElement);

    // "Try me" arrow at the onigiri's + key; wireOnigiri places and hides it.
    const hintEls = { line: document.createElement("div"), label: document.createElement("span") };
    hintEls.line.className = "onigiri-hint-line";
    hintEls.label.className = "onigiri-hint";
    host.append(hintEls.line, hintEls.label);
    hintLabelRef.current = hintEls.label;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = ENV_INTENSITY;

    const camera = new THREE.PerspectiveCamera(35, 1); // near/far are set from the model in fit()
    // Keep the interactive hero pose separate from the camera flying between sections.
    const heroCamera = new THREE.PerspectiveCamera(35, 1);
    const controls = new OrbitControls(heroCamera, focusRef?.current ?? renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // never dip under the stage
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    let mirror: Reflector | null = null;
    let model: THREE.Object3D | null = null;
    let disposed = false;
    let progress = 0; // which stop the camera is at: 0 hero, 1..tour.length close-ups, then the controller
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controllerCenter = new THREE.Vector3();
    const controllerSize = new THREE.Vector3();
    let hasController = false;
    let onigiri: ReturnType<typeof wireOnigiri> | null = null;
    let width = 0, height = 0;
    const stopCount = () => 1 + tour.length + (hasController ? 1 : 0);

    // Fit each stop's subject to its slot, then widen the frustum out to the whole canvas with
    // setViewOffset — same framing, but the stage can spill past the box.
    let radius = 1;
    let dirty = true; // something changed that the per-frame state can't see (resize, a texture arriving)
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      if (w !== width || h !== height) {
        renderer.setSize(w, h, false);
        width = w;
        height = h;

      // Match the reflection to the canvas. A fixed low-res target stretched over the whole view
      // is what makes the reflection look blocky; the blur should come from the mip bias, not from
      // magnifying texels.
      const scale = Math.min(renderer.getPixelRatio(), MIRROR_MAX / Math.max(w, h));
      mirror?.getRenderTarget().setSize(Math.round(w * scale), Math.round(h * scale));
      }

      const hostRect = host.getBoundingClientRect();
      const scrollTop = scrollRef?.current?.scrollTop ?? 0;
      const sectionHeight = scrollRef?.current?.clientHeight ?? h;
      // Stop k lives in section k; measure its slot as it sits when that section is snapped in.
      const boxOf = (el: HTMLElement | null | undefined, k: number) => {
        const r = el?.getBoundingClientRect();
        const b = r?.width && r.height ? r : hostRect;
        return { left: b.left, width: b.width, height: b.height, top: b.top + scrollTop - k * sectionHeight };
      };
      const fovs = (box: Pose["box"]) => {
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        return { vFov, hFov: 2 * Math.atan(Math.tan(vFov / 2) * (box.width / box.height)) };
      };
      const offset = model?.position ?? new THREE.Vector3();

      const pose = (k: number): Pose => {
        if (k === 0) {
          // FILL crops the bounding sphere against the focus box, which can push the drum off the
          // canvas when the box hugs an edge — so also keep it clear of the canvas itself.
          const box = boxOf(focusRef?.current, 0);
          const { vFov, hFov } = fovs(box);
          const pxPerUnit = box.height / 2 / Math.tan(vFov / 2);
          const cx = box.left - hostRect.left + box.width / 2;
          const cy = box.top - hostRect.top + box.height / 2;
          const margin = Math.max(Math.min(cx, w - cx, cy, h - cy), 1);
          const dist = Math.max(radius / Math.sin(Math.min(vFov, hFov) / 2) / FILL, (radius * pxPerUnit) / margin);
          const dir = heroCamera.position.clone().sub(controls.target).normalize();
          heroCamera.position.copy(controls.target).addScaledVector(dir, dist);
          controls.minDistance = controls.maxDistance = dist;
          return { box, target: controls.target.clone(), yaw: Math.atan2(dir.x, dir.z), elevation: Math.asin(dir.y), dist };
        }
        if (k <= tour.length) {
          const stop = tour[k - 1];
          const box = boxOf(stop.slot.current, k);
          const { vFov, hFov } = fovs(box);
          return {
            box,
            target: new THREE.Vector3(...stop.target).add(offset),
            yaw: THREE.MathUtils.degToRad(stop.yaw),
            elevation: THREE.MathUtils.degToRad(stop.elevation),
            dist: stop.size / Math.sin(Math.min(vFov, hFov) / 2),
          };
        }
        const box = boxOf(controllerRef?.current, k);
        const { vFov, hFov } = fovs(box);
        const above = Math.max(
          controllerSize.x / (2 * Math.tan(hFov / 2)),
          controllerSize.z / (2 * Math.tan(vFov / 2)),
        ) * DETAIL_FILL + controllerSize.y / 2;
        return { box, target: controllerCenter.clone(), yaw: 0, elevation: CONTROLLER_ELEVATION, dist: above / Math.sin(CONTROLLER_ELEVATION) };
      };

      const i = Math.min(Math.floor(progress), stopCount() - 2);
      const f = progress - Math.max(i, 0);
      const a = pose(Math.max(i, 0)), b = i >= 0 ? pose(i + 1) : a;
      const lerp = THREE.MathUtils.lerp;
      // Orbit around the subject rather than lerping positions, so a front-to-back move swings past the
      // drum instead of through it; yaw takes the short way round.
      const dYaw = THREE.MathUtils.euclideanModulo(b.yaw - a.yaw + Math.PI, Math.PI * 2) - Math.PI;
      const yaw = a.yaw + dYaw * f;
      const elevation = lerp(a.elevation, b.elevation, f);
      const dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), f));
      const target = a.target.clone().lerp(b.target, f);
      const box = {
        width: lerp(a.box.width, b.box.width, f),
        height: lerp(a.box.height, b.box.height, f),
        left: lerp(a.box.left, b.box.left, f),
        // Slot positions at rest, interpolated: keeps the subject on screen throughout the flight.
        top: lerp(a.box.top, b.box.top, f),
      };

      camera.aspect = box.width / box.height;
      camera.setViewOffset(box.width, box.height, hostRect.left - box.left, hostRect.top - box.top, w, h);
      // Clip planes have to follow the model's scale, or the far plane saws through the mirror
      // floor as the fit distance grows — a straight line across it, then no reflection at all.
      camera.near = radius * 0.001;
      camera.far = dist + FLOOR_RADIUS * radius * 2;
      camera.updateProjectionMatrix();
      camera.position.set(Math.cos(elevation) * Math.sin(yaw), Math.sin(elevation), Math.cos(elevation) * Math.cos(yaw))
        .multiplyScalar(dist).add(target);
      camera.lookAt(target);

      // The shared canvas leaves with the controller's section, so it cannot sit behind the ones after it.
      const last = stopCount() - 1;
      host.style.opacity = String(1 - THREE.MathUtils.smoothstep(scrollTop / sectionHeight, last, last + 0.75));
    };

    let frame = 0;
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      if (disposed) {
        disposeModel(gltf.scene);
        return;
      }
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      gltf.scene.position.sub(sphere.center);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) m.dithering = true;
      });
      radius = sphere.radius * 1.05; // margin so it never kisses the edges
      scene.add(gltf.scene);
      // Box3.setFromObject does not update parents, so push the re-centering down first.
      gltf.scene.updateMatrixWorld(true);
      const controller = gltf.scene.getObjectByName('Controller_Low');
      if (controller) {
        const bounds = new THREE.Box3().setFromObject(controller);
        bounds.getCenter(controllerCenter);
        bounds.getSize(controllerSize);
        hasController = true;
        if (controllerRef?.current) onigiri = wireOnigiri(controller, camera, renderer.domElement, controllerRef.current, hintEls);
      }
      // Everything but the onigiri fades out on the controller slide.
      // A transparent mesh blends its own back and inner faces in draw order, which flickers as
      // the drum turns. A depth-only twin drawn in the opaque pass leaves just the front surface.
      const fading: THREE.Material[] = [];
      const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
      const masks: THREE.Mesh[] = [];
      for (const name of ['iTaiko_Low', 'Cavo_Low']) gltf.scene.getObjectByName(name)?.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.mask) return;
        fading.push(...[o.material].flat());
        const mask = new THREE.Mesh(o.geometry, depthOnly);
        mask.userData.mask = true;
        mask.visible = false;
        o.add(mask);
        masks.push(mask);
      });
      const fadeOthers = (opacity: number) => {
        for (const m of fading) {
          m.opacity = opacity;
          m.transparent = opacity < 1;
          m.visible = opacity > 0;
        }
        for (const mask of masks) mask.visible = opacity > 0 && opacity < 1;
      };

      // Steel plates: hidden under the rubber, they slide out along the head's normal at their tour stop.
      const platesStop = tour.findIndex((s) => s.plates) + 1; // section index; 0 = none
      const steel = new THREE.MeshStandardMaterial({
        // roughness scales the map (mean ~0.33) down to ~0.12: the real sheet reflects almost like a mirror. Extra
        // env reflection keeps a polished metal from going dark on this dim stage.
        metalness: 1, roughness: 0.35, envMapIntensity: 2.5,
        // Always on: toggling transparent swaps shader programs, and the first swap compiled mid-animation.
        transparent: true,
      });
      const plates = platesStop ? buildPlates(steel) : null;
      if (plates) {
        // ExtrudeGeometry's UVs are in mm, so the repeat sets the texture's physical size.
        const loader = new THREE.TextureLoader();
        const tex = (name: string, srgb = false) => loader.load(`textures/galvanized-${name}.webp`, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.setScalar(1 / STEEL_TILE_MM);
          t.anisotropy = renderer.capabilities.getMaxAnisotropy();
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          steel.needsUpdate = true;
          renderer.initTexture(t); // upload now, not on the first frame the plates show
          dirty = true;
        });
        steel.map = tex("color", true);
        steel.roughnessMap = tex("roughness"); // the set's normal map is flat and its metalness map solid white
      }
      if (plates) {
        plates.scale.setScalar(PLATE_SCALE);
        plates.rotation.x = -HEAD_TILT;
        plates.visible = false;
        plates.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, -0.4); // parked under the rubber
        gltf.scene.add(plates);
      }

      const floorY = box.min.y - sphere.center.y;
      const rig = stage(radius, floorY);
      mirror = rig.find((o): o is Reflector => o instanceof Reflector) ?? null;
      scene.add(...rig);

      // Aim slightly below the drum so it sits high in frame, leaving room for the reflection.
      controls.target.y = -radius * 0.18;
      heroCamera.position.set(0, radius * 0.3, radius);
      model = gltf.scene;
      width = height = 0; // size the newly created reflection target too
      fit();
      // Shader warm-up: compile() builds programs without drawing a pixel, but skips hidden objects, so show every
      // hidden one (plates, button rings, fade masks) and put the drum in its half-faded state for the call. That
      // way nothing compiles mid-scroll when the plates come out or the camera reaches the controller.
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.visible) return;
        hidden.push(o);
        o.visible = true;
      });
      fadeOthers(0.5);
      renderer.compile(scene, camera);
      fadeOthers(1);
      for (const o of hidden) o.visible = false;
      setReady(true);
      onProgressRef.current?.(1);

      // Horizontal drags (and the auto-spin) turn the drum, not the camera, so the fixed lights
      // sweep across it. OrbitControls still owns the vertical orbit; we siphon off its azimuth
      // each frame — that keeps its damping, so the spin coasts to a stop like a real orbit.
      const drum = gltf.scene;
      let heroRotation = 0;
      let platesReveal = 0;
      let lastProgress = -1, lastReveal = -1;
      let previousTime = performance.now();
      const tick = (time: number) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
        const scroll = scrollRef?.current;
        const last = stopCount() - 1;
        const requested = scroll ? THREE.MathUtils.clamp(scroll.scrollTop / scroll.clientHeight, 0, last) : 0;
        // Ease in and out of every stop, not just the first and last.
        const k = Math.min(Math.floor(requested), Math.max(last - 1, 0));
        const goal = reducedMotion.matches ? Math.round(requested) : k + THREE.MathUtils.smoothstep(requested - k, 0, 1);
        progress = reducedMotion.matches ? goal : THREE.MathUtils.damp(progress, goal, 9, dt);
        if (Math.abs(progress - goal) < 0.0001) progress = goal;
        controls.enabled = requested === 0 && progress === 0;
        if (controls.enabled) {
          const autoRotate = controls.autoRotate;
          controls.autoRotate = autoRotate && !reducedMotion.matches;
          controls.update(dt);
          controls.autoRotate = autoRotate;
          const azimuth = controls.getAzimuthalAngle();
          heroRotation = THREE.MathUtils.euclideanModulo(heroRotation - azimuth + Math.PI, Math.PI * 2) - Math.PI;
          heroCamera.position.sub(controls.target).applyAxisAngle(UP, -azimuth).add(controls.target);
          heroCamera.lookAt(controls.target);
        }
        // The close-ups are framed on the drum facing front, so unwind the hero spin on the way to the first.
        drum.rotation.y = heroRotation * (1 - Math.min(progress, 1));
        if (plates) {
          const want = Math.abs(progress - platesStop) < 0.5 ? 1 : 0;
          platesReveal = reducedMotion.matches ? want
            : want > platesReveal ? Math.min(platesReveal + dt / PLATES_REVEAL_S, 1) : Math.max(platesReveal - dt / PLATES_REVEAL_S, 0);
          const t = THREE.MathUtils.smootherstep(platesReveal, 0, 1);
          // Starts just under the rubber, so it reads as coming out of the drum. It crosses the surface at t ≈ 0.1,
          // still invisible, then fades in as it rises, so the clipping through the rubber never shows.
          plates.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, -0.4 + (PLATES_LIFT + 0.4) * t);
          steel.opacity = THREE.MathUtils.smoothstep(t, 0.12, 0.6);
          plates.visible = steel.opacity > 0;
        }
        drum.updateMatrixWorld();
        // Gone by mid-flight so the camera never looks through a half-faded drum up close.
        const toController = hasController ? THREE.MathUtils.clamp(progress - (last - 1), 0, 1) : 0;
        fadeOthers(1 - THREE.MathUtils.smoothstep(toController, 0.1, 0.6));
        onigiri?.update(time, toController);
        fit();
        // Only draw when the picture can change: the hero spins, the controller animates, the camera or plates are
        // moving. Parked on a tour stop, or faded out past the controller, the GPU idles.
        const moving = controls.enabled || toController > 0 || progress !== lastProgress || platesReveal !== lastReveal;
        if ((moving || dirty) && host.style.opacity !== "0") {
          renderer.render(scene, camera);
          dirty = false;
        }
        lastProgress = progress;
        lastReveal = platesReveal;
      };
      frame = requestAnimationFrame(tick);
    }, (e) => onProgressRef.current?.(Math.min((e.loaded / (e.total || MODEL_BYTES)) * 0.95, 0.95)));

    const ro = new ResizeObserver(() => { dirty = true; fit(); });
    ro.observe(host);
    if (focusRef?.current) ro.observe(focusRef.current);
    if (controllerRef?.current) ro.observe(controllerRef.current);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      onigiri?.dispose();
      disposeModel(scene);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      hintEls.line.remove();
      hintEls.label.remove();
    };
  }, [focusRef, controllerRef, scrollRef, tour]);

  // Separate from the scene so a language switch doesn't reload the model.
  useEffect(() => {
    if (hintLabelRef.current) hintLabelRef.current.textContent = hint ?? "";
  }, [hint]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ ...style, opacity: ready ? 1 : 0, transition: "opacity 500ms ease" }}
    />
  );
}

// Controls on the onigiri, in Controller_Low's local space (read off the mesh's raised caps): x, z, cap radius.
// "dpad" resolves to a direction from where it was hit. The remaining caps do nothing in the firmware's menu.
type Key = Button | "dpad" | "reset";
const KEYS: Record<"start" | "select" | "reset" | "east" | "south" | "dpad", [number, number, number]> = {
  start: [-1.348, 11.234, 0.15],  // +
  select: [1.289, 11.225, 0.15],  // −
  reset: [0.211, 10.259, 0.14],   // the Pico's RUN pin
  east: [2.094, 12.453, 0.2],     // confirm
  south: [1.617, 12.922, 0.2],    // back
  dpad: [-1.659, 12.446, 0.58],
};
// Square caps get outlines that follow them: half-extents of the reset cap, and the D-pad's reach and arm half-width.
const RESET_HALF = [0.107, 0.131];
const DPAD_REACH = 0.556, DPAD_ARM = 0.194;
const OUTLINE_GAP = 0.022, OUTLINE_WIDTH = 0.03;
const CAP_BASE_Y = 0.848;         // housing surface around the caps; rings sit here
const ACCENT = 0x2f6bff;          // matches the page's blue buttons
const RIPPLE_PERIOD = 1.6;        // s, the "press me" pulse on + and −

/** Which controls do something on the current screen. */
function enabledKeys(screen: Onigiri["screen"]): (keyof typeof KEYS)[] {
  if (screen === "idle") return ["start", "select", "reset"];
  if (screen === "menu") return ["dpad", "east", "south", "reset"];
  return ["reset"];
}

function keyAt(x: number, z: number, enabled: (keyof typeof KEYS)[]): Key | null {
  for (const key of enabled) {
    const [kx, kz, r] = KEYS[key];
    const dx = x - kx, dz = z - kz;
    if (Math.hypot(dx, dz) > r * 1.15) continue;
    if (key !== "dpad") return key;
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 0.1) return null; // dead centre of the cross
    return Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? "left" : "right") : (dz < 0 ? "up" : "down");
  }
  return null;
}

// The housing's opening over the screen quad (Controller_Low local space), measured from the mesh. The quad itself
// runs ~0.03 further on each side, under the bezel.
const SCREEN_WINDOW = { x0: -0.674, x1: 0.631, z0: 12.33, z1: 13.023 };
const SCREEN_PAD = 0.035;     // black border between the bezel and the first pixel column
const PIXEL_FILL = 0.84;      // lit share of each pixel cell; the rest is the screen-door gap
const OLED_LIT = [0.86, 0.93, 1.0]; // linear RGB; SSD1306 white has a faint cool cast
const OLED_OFF = [0.004, 0.0045, 0.006]; // unlit pixels, barely visible against the black glass

/**
 * Runs the firmware menu on the onigiri's OLED and lets its 3D buttons drive it.
 * `target` receives the pointer events (the canvas itself ignores them); `canvas` is only measured.
 */
function wireOnigiri(
  controller: THREE.Object3D, camera: THREE.Camera, canvas: HTMLCanvasElement, target: HTMLElement,
  hint?: { line: HTMLElement; label: HTMLElement },
) {
  let screen: THREE.Mesh | undefined;
  controller.traverse((o) => {
    if (o instanceof THREE.Mesh && [o.material].flat().some((m) => m.name === "Schermo_MAT")) screen = o;
  });

  const oled = new Onigiri(performance.now());
  // One texel per OLED pixel, nearest-sampled; the shader draws each one as a lit cell with a dark gap.
  const texels = new Uint8Array(OLED_W * OLED_H);
  const texture = new THREE.DataTexture(texels, OLED_W, OLED_H, THREE.RedFormat);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  const upload = () => {
    for (let i = 0; i < texels.length; i++) texels[i] = oled.pixels[i] * 255;
    texture.needsUpdate = true;
  };
  upload();

  if (screen) {
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
      uniforms: { panel: { value: texture } },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D panel;
        varying vec2 vUv;
        void main() {
          vec2 grid = vec2(${OLED_W}.0, ${OLED_H}.0);
          vec2 p = vUv * grid;
          float inside = step(0.0, vUv.x) * step(vUv.x, 1.0) * step(0.0, vUv.y) * step(vUv.y, 1.0);
          float on = texture2D(panel, (floor(p) + 0.5) / grid).r * inside;
          // Screen door: each pixel is a square of side ${PIXEL_FILL} with a dark gap around it. fwidth keeps the
          // edge one screen pixel soft, so it fades to the average instead of shimmering when the screen is small.
          vec2 d = abs(fract(p) - 0.5), w = fwidth(p);
          vec2 cell = 1.0 - smoothstep(${PIXEL_FILL / 2} - w, ${PIXEL_FILL / 2} + w, d);
          float mask = cell.x * cell.y;
          vec3 lit = vec3(${OLED_LIT.join(", ")}), off = vec3(${OLED_OFF.join(", ")});
          gl_FragColor = vec4(mix(off * inside, lit, on) * mask, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  // Rings around the controls that currently do something; + and − also pulse, and fill up while held.
  const ringMaterial = (opacity: number) => new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const ringGeometry = (r: number, arc = Math.PI * 2): THREE.BufferGeometry =>
    new THREE.RingGeometry(r * 1.12, r * 1.3, 48, 1, Math.PI / 2, -arc).rotateX(-Math.PI / 2);
  /** A flat band around a square or cross cap: the cap's outline grown by the gap, minus itself grown by gap + width. */
  const outlineGeometry = (key: keyof typeof KEYS, r: number): THREE.BufferGeometry => {
    const polygon = (grow: number) => {
      if (key === "reset") {
        const [hx, hz] = [RESET_HALF[0] + grow, RESET_HALF[1] + grow];
        return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      }
      const [l, a] = [DPAD_REACH + grow, DPAD_ARM + grow];
      return [[-a, -l], [a, -l], [a, -a], [l, -a], [l, a], [a, a], [a, l], [-a, l], [-a, a], [-l, a], [-l, -a], [-a, -a]];
    };
    if (key !== "reset" && key !== "dpad") return ringGeometry(r);
    const shape = new THREE.Shape(polygon(OUTLINE_GAP + OUTLINE_WIDTH).map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(new THREE.Path(polygon(OUTLINE_GAP).map(([x, y]) => new THREE.Vector2(x, y))));
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  };
  const rings = Object.fromEntries(Object.entries(KEYS).map(([key, [x, z, r]]) => {
    const ring = new THREE.Mesh(outlineGeometry(key as keyof typeof KEYS, r), ringMaterial(0.55));
    ring.position.set(x, CAP_BASE_Y, z);
    controller.add(ring);
    return [key, ring];
  }));
  const hints = (["start", "select"] as const).map((key) => {
    const [x, z, r] = KEYS[key];
    const ripple = new THREE.Mesh(ringGeometry(r), ringMaterial(0));
    const fill = new THREE.Mesh(new THREE.BufferGeometry(), ringMaterial(1));
    ripple.position.set(x, CAP_BASE_Y, z);
    fill.position.set(x, CAP_BASE_Y + 0.001, z);
    controller.add(ripple, fill);
    return { key, r, ripple, fill, arc: -1 };
  });
  const overlays = [...Object.values(rings), ...hints.flatMap((h) => [h.ripple, h.fill])];

  let active = false;
  let tried = false; // the hint goes away for good after the first press
  let held: Key | null = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const local = new THREE.Vector3();
  const pick = (e: PointerEvent): Key | null => {
    if (!active) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(controller, true)[0];
    if (!hit) return null;
    controller.worldToLocal(local.copy(hit.point));
    return keyAt(local.x, local.z, enabledKeys(oled.screen));
  };
  const release = () => {
    if (held && held !== "reset" && held !== "dpad") oled.press(held, false);
    held = null;
  };
  const onDown = (e: PointerEvent) => {
    const key = pick(e);
    if (!key) return;
    e.preventDefault();
    tried = true;
    release();
    if (key === "reset") return oled.reset();
    held = key;
    if (key !== "dpad") oled.press(key, true);
    target.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!held) target.style.cursor = pick(e) ? "pointer" : "";
  };
  const noMenu = (e: Event) => { if (held) e.preventDefault(); }; // long-press on touch would open one
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", release);
  target.addEventListener("pointercancel", release);
  target.addEventListener("contextmenu", noMenu);
  target.style.userSelect = "none";

  // Arrow from beside the housing (left of it, or above when there's no room) to the + key.
  const bounds = new THREE.Box3();
  const p = new THREE.Vector3();
  const toScreen = (v: THREE.Vector3) => {
    v.project(camera);
    return [(v.x + 1) / 2 * canvas.clientWidth, (1 - v.y) / 2 * canvas.clientHeight];
  };
  const placeHint = ({ line, label }: { line: HTMLElement; label: HTMLElement }) => {
    const [kx, ky] = toScreen(controller.localToWorld(p.set(KEYS.start[0], CAP_BASE_Y, KEYS.start[1])));
    bounds.setFromObject(controller);
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const [x, y] = toScreen(p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x);
    }
    // Grow with the controller on screen: 1 at ~480px wide (where 20px text reads right), capped for huge screens.
    const k = THREE.MathUtils.clamp((maxX - minX) / 480, 1, 2.4);
    line.style.setProperty("--hint-scale", String(k));
    label.style.setProperty("--hint-scale", String(k));
    const lw = label.offsetWidth, lh = label.offsetHeight, GAP = 12 * k, PAD = 8 * k, KEY_CLEAR = 20 * k;
    const left = minX - GAP - PAD - lw >= 16;
    const [sx, sy] = left ? [minX - GAP, ky - 40 * k] : [kx - 32 * k, Math.max(minY - GAP, lh + 16)];
    label.style.transform = left
      ? `translate(${sx - PAD - lw}px, ${sy - lh / 2}px)`
      : `translate(${sx - lw / 2}px, ${sy - PAD - lh}px)`;
    const len = Math.max(Math.hypot(kx - sx, ky - sy) - KEY_CLEAR, 0);
    line.style.width = `${len}px`;
    line.style.transform = `translate(${sx}px, ${sy}px) rotate(${Math.atan2(ky - sy, kx - sx)}rad)`;
  };

  return {
    /** `progress` is the camera's flight to the controller; the onigiri only takes input once it has landed. */
    update(now: number, progress: number) {
      active = progress === 1;
      if (!active) release();
      if (oled.update(now)) upload();

      const show = THREE.MathUtils.smoothstep(progress, 0.85, 1);
      const enabled = enabledKeys(oled.screen);
      for (const [key, ring] of Object.entries(rings)) {
        ring.visible = show > 0 && enabled.includes(key as keyof typeof KEYS);
        ring.material.opacity = 0.55 * show;
      }
      const holding = oled.hotkeyProgress;
      for (const h of hints) {
        const idle = show > 0 && oled.screen === "idle";
        const t = (now / 1000 / RIPPLE_PERIOD) % 1;
        h.ripple.visible = idle && holding === 0;
        h.ripple.scale.setScalar(1 + t * 0.9);
        h.ripple.material.opacity = 0.7 * (1 - t) * show;
        // ponytail: rebuilt only when the arc changes, i.e. while + or − is held
        const arc = idle && held === h.key ? holding : 0;
        h.fill.visible = arc > 0;
        if (arc !== h.arc && arc > 0) {
          h.fill.geometry.dispose();
          h.fill.geometry = ringGeometry(h.r, arc * Math.PI * 2);
        }
        h.arc = arc;
      }
      if (hint) {
        const on = active && oled.screen === "idle" && !tried;
        hint.line.style.opacity = hint.label.style.opacity = on ? "1" : "0";
        if (on) placeHint(hint);
      }
    },
    dispose() {
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", release);
      target.removeEventListener("pointercancel", release);
      target.removeEventListener("contextmenu", noMenu);
      texture.dispose();
      for (const o of overlays) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
  };
}

function disposeModel(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof Reflector) return o.dispose();
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of [o.material].flat()) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

// ponytail: no cast shadow — on a near-black page it only flattened the background texture;
// the reflection does the grounding.
/** Three-point studio rig and a blurred mirror floor. */
function stage(radius: number, floorY: number): THREE.Object3D[] {
  // Key: warm, high, and 3/4 off to the right — an overhead light gave the drum head no gradient.
  const key = new THREE.SpotLight(0xffffff, KEY_INTENSITY, 0, 0.85, 1);
  key.position.set(radius * 1.6, radius * 2.2, radius * 1.8);
  key.decay = 0; // ponytail: distance-independent, so intensity stays put if the model is rescaled
  key.target.position.set(0, 0, 0);

  // Fill: cool and weak, opposite the key, so the shadow side reads as shape rather than a hole.
  const fill = new THREE.DirectionalLight(0xc8daff, FILL_INTENSITY);
  fill.position.set(-radius * 2.2, radius * 0.8, radius * 1.2);

  // Back: behind and above, catching the rope and the rim of the head.
  const rim = new THREE.DirectionalLight(0xffffff, BACK_INTENSITY);
  rim.position.set(-radius * 0.8, radius * 1.8, -radius * 2.4);

  // ponytail: a disc that ends inside the fade radius, so the mirror has no edge left to show.
  const floor = new Reflector(new THREE.CircleGeometry(radius * FLOOR_RADIUS, 64), {
    textureWidth: 1024, // resized to the canvas in fit()
    textureHeight: 1024,
    color: 0x999999,
  });
  floor.rotateX(-Math.PI / 2);
  floor.position.y = floorY;

  // Mipmaps are the blur: sampling at a LOD bias costs one tap and gets softer with distance.
  const texture = floor.getRenderTarget().texture;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  fadeAndBlur(floor.material as THREE.ShaderMaterial, radius);

  return [key, key.target, fill, rim, floor];
}

/** Patches the Reflector shader: blur the mirror with distance and fade it into the page. */
function fadeAndBlur(material: THREE.ShaderMaterial, radius: number) {
  material.transparent = true;
  material.depthWrite = false;
  material.defines = { ...material.defines, DITHERING: "" };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("varying vec4 vUv;", "varying vec4 vUv;\nvarying vec2 vLocal;")
      .replace("vUv = textureMatrix", "vLocal = position.xy;\n\t\t\tvUv = textureMatrix");
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec4 vUv;", "varying vec4 vUv;\nvarying vec2 vLocal;")
      // Reflector's fragment shader pulls in no <common>, which is where rand() lives.
      .replace(
        "#include <logdepthbuf_pars_fragment>",
        "#include <common>\n#include <logdepthbuf_pars_fragment>\n#include <dithering_pars_fragment>",
      )
      .replace("#include <colorspace_fragment>", "#include <colorspace_fragment>\n#include <dithering_fragment>")
      .replace(
        `vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );`,
        `vec2 uv = vUv.xy / vUv.w;
			float d = length( vLocal ) / ${radius.toFixed(4)};
			// Near the reflection texture's border a blurred tap averages in clamped edge texels, which
			// shows up as a hard line across the floor — so sharpen and fade out as uv approaches it.
			vec2 edge = min( uv, 1.0 - uv );
			float border = smoothstep( 0.0, 0.05, min( edge.x, edge.y ) );
			vec4 base = texture2D( tDiffuse, uv, ( ${MIRROR_BLUR.toFixed(2)} + ${MIRROR_SPREAD.toFixed(2)} * d ) * border );
			// Preserve the scene's lighting and transparent background. The reflection receives
			// the same tone mapping as the drum, without an overlay tint or added page colour.
			vec3 reflected = base.rgb / max( base.a, 0.0001 );
			float a = ${FLOOR_STRENGTH} * ( 1.0 - smoothstep( 0.05, 0.85, d ) );
			a *= border * base.a;
			// Normal material blending expects straight alpha; premultiplying before tone mapping
			// changes highlight brightness and makes the reflected lighting look inconsistent.
			gl_FragColor = vec4( reflected, a );`,
      );
  };
}
