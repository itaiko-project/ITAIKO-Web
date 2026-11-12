import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { Onigiri, type Button } from "./oled";
import { oledScreen } from "./onigiriScreen";
import { buildPlates } from "./plates";
import { birchMaterial, galvanizedSteel, loadPlywood, PLY, whenIdle } from "./materials";
import { dimension, type Dimension, type Point } from "./dimension";

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
const PLATES_EXIT_S = 0.2;    // and clears quickly on leaving, before the plywood comes in
const WOOD_LIFT = 0.3;      // the plywood sits just proud of the rubber, so it crossfades over the drum, not inside it
// The plywood is shown head-on and flat: squashed to a sliver so no edge or hole wall reads as depth.
const WOOD_FLAT = 0.02;
// Where the Ka-width dimension sits on the plywood (plate frame, degrees from +x): along a radius clear of the screw
// holes, on the right.
const WOOD_KA_DEG = 18;
const WOOD_DIM_IN_S = 0.35, WOOD_DIM_OUT_S = 0.12; // its fade, once the camera has stopped on the plywood / on leaving
const DRUM_EXIT_TURN = Math.PI * 0.75; // stand → onigiri: the drum turns this far clockwise as it fades...
const DRUM_EXIT_END = 0.45;            // ...and is gone by this share of the flight, well before the onigiri lands
const FLOOR_GLOW = 0.22;       // the light pool's strength at the stand stop, so the black stand stands off the floor
const FLOOR_GLOW_RADIUS = 0.75; // its size, in bounding-sphere radii
const HEAD_RADIUS = 10.62;  // rubber head, model units (0.05/mm): the 43 cm diameter the measure arrow spans
const MEASURE_LIFT = 0.25;  // the arrow floats this far off the rubber, along its normal
const MEASURE_REVEAL_S = 0.6; // the arrow draws out from the centre on its own clock, like the plates
const MEASURE_EXIT_S = 0.15;  // and snaps away on leaving, so it is gone before the camera is far into the next flight
// The stand is baked into iTaiko_Low, so its pieces are picked out of the mesh by shape: the two side boards and
// their hand screws are the only loose parts centred this far off the middle (|x|, model units) and this narrow.
const STAND_X = [4.6, 6.2] as const;
const STAND_MAX_WIDTH = 2;
const STAND_BLINK_S = 1;    // two flashes over this long, once each time the stand stop is reached

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
  measure?: boolean;                         // draw the head's diameter across the rubber at this stop
  stand?: boolean;                           // flash the stand when the camera lands here
  wood?: boolean;                            // the drum gives way to the bare plywood Don and Ka plates here
};

type Pose = { box: { left: number; top: number; width: number; height: number }; target: THREE.Vector3; yaw: number; elevation: number; dist: number };

/**
 * Interactive 3D drum on a reflective stage. Drag to spin.
 * The canvas is meant to be full-bleed so the reflection never gets clipped; `focusRef` points at
 * the (empty) element holding the drum's place in the layout, and the camera frames that box.
 * Scrolling flies the camera through `tour` (one section each, right after the hero) and then onto the
 * controller in the section after those.
 */
export default function DrumViewer({ className, style, focusRef, controllerRef, scrollRef, tour = [], hint, measureLabel, woodLabel, onProgress }: {
  className?: string;
  /** Text on the diameter arrow at the `measure` stop. */
  measureLabel?: string;
  /** Label of the plywood's Ka-width arrow at the `wood` stop. */
  woodLabel?: string;
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
  const measureLabelRef = useRef(measureLabel);
  const dimsRef = useRef<ReturnType<typeof dimensionOverlay> | null>(null);
  const woodLabelRef = useRef(woodLabel);
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

    // "Try me" label over the onigiri's + key; wireOnigiri places and hides it.
    const hintEls = { label: document.createElement("span") };
    hintEls.label.className = "onigiri-hint";
    host.append(hintEls.label);
    hintLabelRef.current = hintEls.label;
    // Diameter label on the head; positioned per frame over the arrow's midpoint.
    // Dimension overlay: 0 = the head's Ø, 1 = the plywood's Ka width.
    const dims = dimensionOverlay(host, 2);
    dims.label(0, measureLabelRef.current ?? "");
    dims.label(1, woodLabelRef.current ?? "");
    dimsRef.current = dims;

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
      // The drum (and cable) fade out on the controller slide and for the bare plywood, and go see-through at the
      // stand; the onigiri fades for the plywood too.
      const drumFade = fader([gltf.scene.getObjectByName('iTaiko_Low'), gltf.scene.getObjectByName('Cavo_Low')]);
      const controllerFade = controller ? fader([controller]) : null;

      // Steel plates: hidden under the rubber, they slide out along the head's normal at their tour stop.
      const platesStop = tour.findIndex((s) => s.plates) + 1; // section index; 0 = none
      // Always transparent: toggling it swaps shader programs, and the first swap compiled mid-animation.
      const steel = platesStop ? galvanizedSteel(renderer, { transparent: true }, () => { dirty = true; }).material : null;
      const plates = steel ? buildPlates(steel) : null;
      if (plates) {
        plates.scale.setScalar(PLATE_SCALE);
        plates.rotation.x = -HEAD_TILT;
        plates.visible = false;
        plates.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, -0.4); // parked under the rubber
        gltf.scene.add(plates);
      }

      // The head's diameter: drawn as a 2D dimension over the canvas (same style as every other measure, and no
      // thin-geometry shimmer), between two rim points of this anchor in the head's plane (x across the drum).
      const measureStop = tour.findIndex((s) => s.measure) + 1;
      const measureAnchor = new THREE.Object3D();
      measureAnchor.rotation.x = -HEAD_TILT;
      measureAnchor.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, MEASURE_LIFT);
      gltf.scene.add(measureAnchor);

      // Stand flash: the stand's triangles, redrawn additively in the accent colour over the drum.
      const standStop = tour.findIndex((s) => s.stand) + 1;
      const drumMesh = gltf.scene.getObjectByName("iTaiko_Low");
      const standGeometry = standStop && drumMesh instanceof THREE.Mesh ? standOf(drumMesh.geometry) : null;
      const standGlow = new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      const standFlash = standGeometry ? new THREE.Mesh(standGeometry, standGlow) : null;
      if (standFlash) {
        standFlash.userData.overlay = true;
        standFlash.visible = false;
        drumMesh!.add(standFlash);
      }

      // Bare plywood plates: loaded after the drum (37 KB), placed on the head like the steel plates.
      const woodStop = tour.findIndex((s) => s.wood) + 1;
      // Always transparent, like the steel, so no program swap mid-scroll.
      const woodMaterial = woodStop ? birchMaterial(renderer.capabilities.getMaxAnisotropy(), { transparent: true, opacity: 0 }) : null;
      let wood: THREE.Mesh | null = null;
      if (woodMaterial) loadPlywood().then((geometry) => {
        if (disposed) return;
        wood = new THREE.Mesh(geometry, woodMaterial);
        wood.scale.set(PLATE_SCALE, PLATE_SCALE, PLATE_SCALE * WOOD_FLAT);
        wood.rotation.x = -HEAD_TILT;
        wood.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, WOOD_LIFT);
        gltf.scene.add(wood);
        renderer.compile(wood, camera, scene); // build the program (with the scene's lights) before it is ever shown
        wood.visible = false;
        dirty = true;
      });

      const floorY = box.min.y - sphere.center.y;
      const rig = stage(radius, floorY);
      mirror = rig.find((o): o is Reflector => o instanceof Reflector) ?? null;
      const floorGlow = rig.find((o) => o.name === "floorGlow") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
      scene.add(...rig);

      // Aim slightly below the drum so it sits high in frame, leaving room for the reflection.
      controls.target.y = -radius * 0.18;
      heroCamera.position.set(0, radius * 0.3, radius);
      model = gltf.scene;
      width = height = 0; // size the newly created reflection target too
      fit();
      // Shader warm-up: compile() builds programs without drawing a pixel, but skips hidden objects, so show every
      // hidden one (plates, button glows, fade masks) and put the drum in its half-faded state for the call. That
      // way nothing compiles mid-scroll when the plates come out or the camera reaches the controller.
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.visible) return;
        hidden.push(o);
        o.visible = true;
      });
      drumFade(0.5);
      controllerFade?.(0.5);
      renderer.compile(scene, camera);
      drumFade(1);
      controllerFade?.(1);
      for (const o of hidden) o.visible = false;
      setReady(true);
      onProgressRef.current?.(1);

      // Horizontal drags (and the auto-spin) turn the drum, not the camera, so the fixed lights
      // sweep across it. OrbitControls still owns the vertical orbit; we siphon off its azimuth
      // each frame — that keeps its damping, so the spin coasts to a stop like a real orbit.
      const drum = gltf.scene;
      let heroRotation = 0;
      let platesReveal = 0;
      let measureReveal = 0;
      let standBlink = -1, standArmed = true; // seconds into the flash, -1 when idle; re-armed once you leave the stop
      let lastProgress = -1, lastReveal = -1, lastMeasure = -1;
      let woodDimReveal = 0, lastWoodDim = -1;
      let woodDim: Dimension | null = null;
      const labelPoint = new THREE.Vector3();
      let previousTime = performance.now();
      // Dimensions over the canvas, from points of the model projected to the screen. Only ever updated in a frame
      // that is also drawn: computed from a camera the canvas is not showing, they drifted against a still drum.
      const placeDimensions = () => {
        const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
        const screen = (o: THREE.Object3D, x: number, y: number, z: number): Point => {
          o.localToWorld(labelPoint.set(x, y, z)).project(camera);
          return [(labelPoint.x + 1) / 2 * w, (1 - labelPoint.y) / 2 * h];
        };
        // The head's Ø: draws out from the centre, label fading in once it is nearly full.
        const reveal = THREE.MathUtils.smootherstep(measureReveal, 0, 1);
        if (reveal > 0) {
          const a = screen(measureAnchor, -HEAD_RADIUS, 0, 0), b = screen(measureAnchor, HEAD_RADIUS, 0, 0);
          const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const out = (p: Point): Point => [mid[0] + (p[0] - mid[0]) * reveal, mid[1] + (p[1] - mid[1]) * reveal];
          dims.set(0, dimension(out(a), out(b), [0, -1], { labelOnLine: true }),
            THREE.MathUtils.smoothstep(reveal, 0, 0.25), THREE.MathUtils.smoothstep(reveal, 0.6, 1));
        } else dims.hide(0);
        // Ka width on the plywood: no motion of its own. Placed once the camera has stopped there, then only faded;
        // on the way out it keeps that place while it fades, instead of following the camera.
        if (wood && progress === woodStop) {
          const at = (r: number) => {
            const a = THREE.MathUtils.degToRad(WOOD_KA_DEG);
            return screen(wood!, r * Math.cos(a), r * Math.sin(a), 0);
          };
          woodDim = dimension(at(PLY.kaIn), at(PLY.kaOut), [0, -1]);
        }
        const fade = THREE.MathUtils.smoothstep(woodDimReveal, 0, 1);
        if (woodDim && fade > 0) dims.set(1, woodDim, fade, fade);
        else dims.hide(1);
      };

      const tick = (time: number) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
        const scroll = scrollRef?.current;
        const last = stopCount() - 1;
        const raw = scroll ? THREE.MathUtils.clamp(scroll.scrollTop / scroll.clientHeight, 0, last) : 0;
        // Snapped onto a section, the scroll position can still wobble by a fraction of a pixel (Firefox); read that
        // as parked, or the camera, and everything drawn from it, creeps back and forth.
        const requested = Math.abs(raw - Math.round(raw)) < 0.004 ? Math.round(raw) : raw;
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
        // How far the drum has given way to a stop's own scene (1 parked there, 0 by 0.6 of a section away).
        const near = (stop: number) => stop ? 1 - THREE.MathUtils.smoothstep(Math.abs(progress - stop), 0.1, 0.6) : 0;
        const woodAmount = near(woodStop), standAmount = near(standStop);
        if (plates) {
          // Out as soon as you scroll on (fast), so the steel is gone before the plywood starts to show.
          const want = Math.abs(progress - platesStop) < 0.2 ? 1 : 0;
          platesReveal = reducedMotion.matches ? want : approach(platesReveal, want, dt / PLATES_REVEAL_S, dt / PLATES_EXIT_S);
          const t = THREE.MathUtils.smootherstep(platesReveal, 0, 1);
          // Starts just under the rubber, so it reads as coming out of the drum. It crosses the surface at t ≈ 0.1,
          // still invisible, then fades in as it rises, so the clipping through the rubber never shows.
          plates.position.copy(HEAD_CENTER).addScaledVector(HEAD_NORMAL, -0.4 + (PLATES_LIFT + 0.4) * t);
          // And never alongside the wood, however fast the scroll: any plywood showing means no steel.
          steel!.opacity = THREE.MathUtils.smoothstep(t, 0.12, 0.6) * (1 - THREE.MathUtils.smoothstep(woodAmount, 0, 0.05));
          plates.visible = steel!.opacity > 0;
        }
        if (measureStop) {
          // Only while parked at the stop: it should not trail the camera into the next flight.
          const want = Math.abs(progress - measureStop) < 0.15 ? 1 : 0;
          measureReveal = reducedMotion.matches ? want : approach(measureReveal, want, dt / MEASURE_REVEAL_S, dt / MEASURE_EXIT_S);
        }
        if (woodStop) {
          // In only once the camera has come to rest on the plywood; out quickly as soon as it moves on.
          const want = progress === woodStop && woodAmount === 1 ? 1 : 0;
          woodDimReveal = reducedMotion.matches ? want : approach(woodDimReveal, want, dt / WOOD_DIM_IN_S, dt / WOOD_DIM_OUT_S);
        }
        if (standFlash) {
          const away = Math.abs(progress - standStop);
          if (away > 0.5) standArmed = true;
          if (away > 0.05) standBlink = -1; // scrolled on: stop flashing right away, don't finish the second blink
          if (standArmed && away < 0.02 && !reducedMotion.matches) {
            standArmed = false;
            standBlink = 0;
          }
          if (standBlink >= 0) {
            standBlink += dt;
            if (standBlink > STAND_BLINK_S) standBlink = -1;
          }
          // sin² over two half-periods: two soft flashes that start and end dark.
          standGlow.opacity = standBlink < 0 ? 0 : 0.85 * Math.sin((2 * Math.PI * standBlink) / STAND_BLINK_S) ** 2;
          standFlash.visible = standGlow.opacity > 0;
        }
        drum.updateMatrixWorld();
        // Gone by mid-flight so the camera never looks through a half-faded drum up close.
        const toController = hasController ? THREE.MathUtils.clamp(progress - (last - 1), 0, 1) : 0;
        // At the plywood stop the drum and onigiri dissolve into the bare plates, tied to the camera so it reverses
        // with it. At the stand stop a pool of light comes up on the floor, so the black stand reads against it.
        if (woodMaterial) woodMaterial.opacity = woodAmount;
        if (wood) wood.visible = woodAmount > 0;
        if (floorGlow) {
          floorGlow.material.opacity = FLOOR_GLOW * standAmount;
          floorGlow.visible = standAmount > 0;
        }
        // Leaving the stand for the onigiri: the drum spins away clockwise (seen from above) and is gone by mid-flight.
        if (drumMesh) drumMesh.rotation.y = -DRUM_EXIT_TURN * THREE.MathUtils.smootherstep(toController, 0, DRUM_EXIT_END);
        drumFade(Math.min(1 - THREE.MathUtils.smoothstep(toController, 0.05, DRUM_EXIT_END), 1 - woodAmount));
        controllerFade?.(1 - woodAmount);
        onigiri?.update(time, toController);
        fit();

        // Only draw when the picture can change: the hero spins, the controller animates, the camera or plates are
        // moving. Parked on a tour stop, or faded out past the controller, the GPU idles.
        const moving = controls.enabled || toController > 0 || progress !== lastProgress || platesReveal !== lastReveal
          || measureReveal !== lastMeasure || woodDimReveal !== lastWoodDim || standBlink >= 0 || standGlow.opacity > 0;
        if ((moving || dirty) && host.style.opacity !== "0") {
          placeDimensions();
          renderer.render(scene, camera);
          dirty = false;
        }
        lastProgress = progress;
        lastReveal = platesReveal;
        lastMeasure = measureReveal;
        lastWoodDim = woodDimReveal;
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
      hintEls.label.remove();
      dims.remove();
    };
  }, [focusRef, controllerRef, scrollRef, tour]);

  // Separate from the scene so a language switch doesn't reload the model.
  useEffect(() => {
    if (hintLabelRef.current) hintLabelRef.current.textContent = hint ?? "";
  }, [hint]);
  useEffect(() => {
    measureLabelRef.current = measureLabel;
    dimsRef.current?.label(0, measureLabel ?? "");
  }, [measureLabel]);
  useEffect(() => {
    woodLabelRef.current = woodLabel;
    dimsRef.current?.label(1, woodLabel ?? "");
  }, [woodLabel]);

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
const CAP_BASE_Y = 0.848;         // housing surface around the caps
// Two caps at the ends of the diagonal row of small keys the + sits in (x, z): the "Try me!" label follows its slant.
const LEFT_KEY_ROW: [number, number][] = [[-1.73, 11.0], [-0.97, 11.455]];
const CAP_MIN_Y = 0.7;            // caps are the loose parts standing above this; the housing starts at 0
const ACCENT = 0x2f6bff;          // matches the page's blue buttons
const PULSE_PERIOD = 1.6;         // s, the "press me" pulse on + and −

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

/**
 * Runs the firmware menu on the onigiri's OLED and lets its 3D buttons drive it.
 * `target` receives the pointer events (the canvas itself ignores them); `canvas` is only measured.
 */
function wireOnigiri(
  controller: THREE.Object3D, camera: THREE.Camera, canvas: HTMLCanvasElement, target: HTMLElement,
  hint?: { label: HTMLElement },
) {
  const oled = new Onigiri(performance.now());
  const screen = oledScreen(controller, oled);

  // The controls that currently do something light up: their own caps, picked out of the housing mesh and redrawn
  // in the accent colour over themselves. + and − pulse on the idle screen; a held key lights up fully.
  let body: THREE.Mesh | undefined;
  controller.traverse((o) => {
    if (o instanceof THREE.Mesh && [o.material].flat().some((m) => m.name === "Controller_MAT")) body = o;
  });
  const caps = body ? looseParts(body.geometry).filter((p) => p.min.y > CAP_MIN_Y) : [];
  const glows = Object.fromEntries(Object.entries(KEYS).flatMap(([key, [x, z, r]]) => {
    const mine = caps.filter((p) => Math.hypot((p.min.x + p.max.x) / 2 - x, (p.min.z + p.max.z) / 2 - z) < r);
    const geometry = body && geometryOf(body.geometry, mine);
    if (!geometry) return [];
    const glow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    glow.visible = false;
    glow.userData.overlay = true; // not part of the housing when the onigiri fades
    body!.add(glow);
    return [[key, glow]];
  })) as Partial<Record<keyof typeof KEYS, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>>;
  const overlays = Object.values(glows);

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

  // "Try me!" written in blue just above the + key, tilted along the diagonal row of small keys it sits in, like a
  // label printed on the shell. No arrow.
  const bounds = new THREE.Box3();
  const p = new THREE.Vector3();
  const toScreen = (v: THREE.Vector3) => {
    v.project(camera);
    return [(v.x + 1) / 2 * canvas.clientWidth, (1 - v.y) / 2 * canvas.clientHeight];
  };
  const at = (x: number, z: number) => toScreen(controller.localToWorld(p.set(x, CAP_BASE_Y, z)));
  const placeHint = ({ label }: { label: HTMLElement }) => {
    bounds.setFromObject(controller);
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const [x] = toScreen(p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z));
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    // Grow with the controller on screen: 1 at ~480px wide (where 20px text reads right), capped for huge screens.
    const k = THREE.MathUtils.clamp((maxX - minX) / 480, 1, 2.4);
    label.style.setProperty("--hint-scale", String(k));
    const [kx, ky] = at(KEYS.start[0], KEYS.start[1]);
    const [[ax, ay], [bx, by]] = LEFT_KEY_ROW.map(([x, z]) => at(x, z));
    const angle = Math.atan2(by - ay, bx - ax);
    // Off the key along the row's normal, on the side that is up on screen, clear of the cap.
    let nx = Math.sin(angle), ny = -Math.cos(angle);
    if (ny > 0) { nx = -nx; ny = -ny; }
    const capRadius = Math.abs(at(KEYS.start[0] + KEYS.start[2], KEYS.start[1])[0] - kx);
    const d = capRadius + label.offsetHeight / 2 + 4 * k;
    label.style.transform = `translate(${kx + nx * d}px, ${ky + ny * d}px) translate(-50%, -50%) rotate(${angle}rad)`;
  };

  return {
    /** `progress` is the camera's flight to the controller; the onigiri only takes input once it has landed. */
    update(now: number, progress: number) {
      // Live as soon as the camera has all but landed: the last few % of the damped flight are invisible anyway.
      active = progress >= 0.97;
      if (!active) release();
      if (oled.update(now)) screen?.upload();

      const show = THREE.MathUtils.smoothstep(progress, 0.85, 1);
      const enabled = enabledKeys(oled.screen);
      const pulse = 0.5 - 0.5 * Math.cos((2 * Math.PI * now) / 1000 / PULSE_PERIOD);
      for (const [key, glow] of Object.entries(glows) as [keyof typeof KEYS, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>][]) {
        const pressed = held === key || (key === "dpad" && held !== null && ["up", "down", "left", "right"].includes(held));
        const level = !enabled.includes(key) ? 0
          : pressed ? 0.95
          : oled.screen === "idle" && (key === "start" || key === "select") ? 0.35 + 0.5 * pulse
          : 0.55;
        glow.material.opacity = level * show;
        glow.visible = glow.material.opacity > 0;
      }
      if (hint) {
        const on = active && oled.screen === "idle" && !tried;
        hint.label.style.opacity = on ? "1" : "0";
        if (on) placeHint(hint);
      }
    },
    dispose() {
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", release);
      target.removeEventListener("pointercancel", release);
      target.removeEventListener("contextmenu", noMenu);
      screen?.dispose();
      for (const o of overlays) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
  };
}

/**
 * Steps `value` toward `target` by at most `up` (rising) or `down` (falling), and holds once there. The old
 * `target > value ? rise : fall` fell whenever value had already reached target, so a finished reveal kept dipping
 * and recovering: the Ø arrow visibly breathed in and out while parked.
 */
function approach(value: number, target: number, up: number, down: number) {
  return value < target ? Math.min(value + up, target) : Math.max(value - down, target);
}

/**
 * Dimensions laid over the canvas: lines and arrowheads in one SVG, each label an HTML pill (.dim-pill, the site's
 * measuring style). `set` repositions one per frame; the DOM is only touched when something actually changed, so a
 * parked camera leaves the overlay alone (rewriting identical values every frame made Firefox shimmer).
 */
function dimensionOverlay(host: HTMLElement, count: number) {
  const NS = "http://www.w3.org/2000/svg";
  const root = document.createElement("div");
  root.className = "drum-dims";
  const svg = document.createElementNS(NS, "svg");
  root.append(svg);
  const items = Array.from({ length: count }, () => {
    const g = document.createElementNS(NS, "g");
    const [ext, line, heads] = ["dim-ext", "dim-line", "dim-heads"].map((cls) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("class", cls);
      g.append(p);
      return p;
    });
    const pill = document.createElement("span");
    pill.className = "dim-pill";
    g.style.opacity = pill.style.opacity = "0";
    svg.append(g);
    root.append(pill);
    return { g, ext, line, heads, pill, last: "" };
  });
  host.append(root);
  return {
    set(i: number, d: Dimension, lineOpacity: number, labelOpacity: number) {
      const it = items[i];
      const key = `${d.ext}|${d.line}|${d.heads}|${d.label.x.toFixed(1)},${d.label.y.toFixed(1)}|${lineOpacity.toFixed(3)}|${labelOpacity.toFixed(3)}`;
      if (key === it.last) return;
      it.last = key;
      it.ext.setAttribute("d", d.ext);
      it.line.setAttribute("d", d.line);
      it.heads.setAttribute("d", d.heads);
      it.g.style.opacity = lineOpacity.toFixed(3);
      it.pill.style.opacity = labelOpacity.toFixed(3);
      it.pill.style.transform = `translate(${d.label.x.toFixed(1)}px, ${d.label.y.toFixed(1)}px) ${d.label.anchor}`;
    },
    hide(i: number) {
      const it = items[i];
      if (it.last === "hidden") return;
      it.last = "hidden";
      it.g.style.opacity = it.pill.style.opacity = "0";
    },
    label(i: number, text: string) { if (items[i]) items[i].pill.textContent = text; },
    remove() { root.remove(); },
  };
}

/**
 * Turns `roots` see-through together. A transparent mesh blends its own back and inner faces in draw order, which
 * flickers as the drum turns; a depth-only twin drawn in the opaque pass leaves just the front surface. Pass
 * `masks = false` when what is behind those faces (the solid stand inside the ghost drum) has to show through.
 * Meshes tagged `userData.overlay` (glows, the solid stand) are left alone.
 */
function fader(roots: (THREE.Object3D | undefined)[]) {
  const materials = new Set<THREE.Material>();
  const masks: THREE.Mesh[] = [];
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  for (const root of roots) root?.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.mask || o.userData.overlay) return;
    for (const m of [o.material].flat()) materials.add(m);
    const mask = new THREE.Mesh(o.geometry, depthOnly);
    mask.userData.mask = true;
    mask.visible = false;
    o.add(mask);
    masks.push(mask);
  });
  let last = -1, lastMasks = true;
  return (opacity: number, useMasks = true) => {
    if (opacity === last && useMasks === lastMasks) return;
    last = opacity;
    lastMasks = useMasks;
    for (const m of materials) {
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.visible = opacity > 0;
      if (m instanceof THREE.ShaderMaterial && m.uniforms.opacity) m.uniforms.opacity.value = opacity;
    }
    for (const mask of masks) mask.visible = useMasks && opacity > 0 && opacity < 1;
  };
}

/** The stand's triangles out of the drum mesh, as a geometry sharing its vertex buffer; null if none match. */
function standOf(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  return geometryOf(geometry, looseParts(geometry).filter((p) => {
    const mid = Math.abs((p.min.x + p.max.x) / 2);
    return p.max.x - p.min.x < STAND_MAX_WIDTH && mid > STAND_X[0] && mid < STAND_X[1];
  }));
}

type Part = { tris: number[]; min: THREE.Vector3; max: THREE.Vector3 };

/** A geometry drawing just `parts` of `source`, sharing its vertex buffer; null when there is nothing to draw. */
function geometryOf(source: THREE.BufferGeometry, parts: Part[]): THREE.BufferGeometry | null {
  const index = parts.flatMap((p) => p.tris);
  if (!index.length) return null;
  const geometry = new THREE.BufferGeometry();
  // Every attribute, not just position: the solid stand is drawn with the drum's own textured material.
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(index);
  return geometry;
}

/** The mesh's loose parts (connected components), each as its triangles' vertex indices and its bounding box. */
function looseParts(geometry: THREE.BufferGeometry): Part[] {
  const pos = geometry.getAttribute("position");
  const index = geometry.index;
  if (!index) return [];
  // Loose parts = connected components, after welding vertices that split only for UV/normal seams.
  const parent = new Int32Array(pos.count);
  const welded = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const first = welded.get(key);
    parent[i] = first ?? i;
    if (first === undefined) welded.set(key, i);
  }
  const find = (x: number) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = find(index.getX(t));
    for (let c = 1; c < 3; c++) {
      const b = find(index.getX(t + c));
      if (b !== a) parent[b] = a;
    }
  }
  const parts = new Map<number, Part>();
  const v = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const root = find(index.getX(t));
    let part = parts.get(root);
    if (!part) parts.set(root, part = { tris: [], min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) });
    for (let c = 0; c < 3; c++) {
      const i = index.getX(t + c);
      part.tris.push(i);
      v.fromBufferAttribute(pos, i);
      part.min.min(v);
      part.max.max(v);
    }
  }
  return [...parts.values()];
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

  // A soft pool of light on the floor, under the mirror: off by default, raised at the stand stop so the black
  // stand reads against something lighter than the near-black page.
  const pool = document.createElement("canvas");
  pool.width = pool.height = 256;
  const ctx = pool.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * FLOOR_GLOW_RADIUS, 64),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pool), color: 0xb4bfd0, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
  glow.name = "floorGlow";
  glow.rotateX(-Math.PI / 2);
  glow.position.y = floorY - radius * 0.001;
  glow.renderOrder = -1; // before the mirror, which blends its reflection over it
  glow.visible = false;

  return [...lights(radius), floor, glow];
}

/** The key, fill and back lights, placed around a subject of `radius` at the origin. */
function lights(radius: number): THREE.Object3D[] {
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

  return [key, key.target, fill, rim];
}

/**
 * A small, slowly turning drum (no controller or cable) under the same lights as the hero, for the closing CTA.
 * Its own little renderer: loads and compiles the model at page load when the browser is idle, and draws (turns)
 * only while it is on screen.
 */
export function MiniDrum({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = ENV_INTENSITY;
    const camera = new THREE.PerspectiveCamera(30, 1);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let drum: THREE.Object3D | null = null;
    let radius = 1;
    let onScreen = false, loading = false, disposed = false, frame = 0;
    let previousTime = performance.now();

    const draw = () => { if (drum) renderer.render(scene, camera); };
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Fit the bounding sphere in the narrower of the two fields of view.
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect));
      const dist = radius / Math.sin(fov / 2);
      camera.position.set(0, 0.3, 1).normalize().multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      camera.near = dist * 0.01;
      camera.far = dist * 3;
      camera.updateProjectionMatrix();
      draw();
    };
    const load = () => {
      loading = true;
      new GLTFLoader().load(MODEL_URL, (gltf) => {
        if (disposed) return disposeModel(gltf.scene);
        for (const name of ["Controller_Low", "Cavo_Low"]) {
          const part = gltf.scene.getObjectByName(name);
          if (!part) continue;
          part.removeFromParent();
          disposeModel(part);
        }
        const sphere = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere());
        gltf.scene.position.sub(sphere.center);
        radius = sphere.radius * 0.9; // the sphere is loose around a drum this shape; a little crop fills the box
        drum = new THREE.Group().add(gltf.scene);
        drum.rotation.y = -0.5; // three-quarter view, the rope and stand both read
        scene.add(drum, ...lights(radius));
        resize();
        renderer.compile(scene, camera);
        draw();
        setReady(true);
      });
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      if (!onScreen || !drum || reducedMotion.matches) return;
      drum.rotation.y += dt * 0.5;
      draw();
    };
    frame = requestAnimationFrame(tick);

    // Loaded and compiled at page load, in an idle moment: doing it when the footer scrolls in would stutter.
    whenIdle(4000).then(() => { if (!disposed && !loading) load(); });
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) draw();
    }, { rootMargin: "300px" });
    io.observe(host);
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      disposeModel(scene);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className={className} style={{ opacity: ready ? 1 : 0, transition: "opacity 500ms ease" }} />;
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
