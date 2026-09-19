import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

const MODEL_URL = "iTaiko.opt2k.glb";

// Stage look — tune these, everything else derives from the model's size.
const FILL = 1.25;          // >1 crops the bounding sphere a little so the drum is not lost in whitespace
const ENV_INTENSITY = 0.3;  // soft ambient bounce; the three lights below do the shaping
const KEY_INTENSITY = 2.2;  // warm, high and off to one side — the light you actually see
const FILL_INTENSITY = 0.7; // cool and dim, opposite the key, just to lift the shadow side
const BACK_INTENSITY = 2.6; // behind the drum, rakes the rope so it separates from the background
const EXPOSURE = 0.95;
const FLOOR_STRENGTH = 0.24; // restrained reflection right under the drum
const MIRROR_BLUR = 0.0;    // keep bright reflections from bleeding into a broad floor halo
const MIRROR_SPREAD = 0.04; // only a trace of distance softening
const FLOOR_RADIUS = 1.6;   // mirror disc radius, in bounding-sphere radii
const MIRROR_MAX = 2048;    // longest side of the reflection render target

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Interactive 3D drum on a reflective stage. Drag to spin.
 * The canvas is meant to be full-bleed so the reflection never gets clipped; `focusRef` points at
 * the (empty) element holding the drum's place in the layout, and the camera frames that box.
 */
export default function DrumViewer({ className, style, focusRef }: {
  className?: string;
  style?: React.CSSProperties;
  focusRef?: React.RefObject<HTMLElement | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
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

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = ENV_INTENSITY;

    const camera = new THREE.PerspectiveCamera(35, 1); // near/far are set from the model in fit()
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.minPolarAngle = 0.45;
    controls.maxPolarAngle = Math.PI / 2 - 0.04; // never dip under the stage
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    let mirror: Reflector | null = null;

    // Fit the model's bounding sphere to the focus box, then widen the frustum out to the whole
    // canvas with setViewOffset — same framing, but the stage can spill past the box.
    let radius = 1;
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);

      // Match the reflection to the canvas. A fixed low-res target stretched over the whole view
      // is what makes the reflection look blocky; the blur should come from the mip bias, not from
      // magnifying texels.
      const scale = Math.min(renderer.getPixelRatio(), MIRROR_MAX / Math.max(w, h));
      mirror?.getRenderTarget().setSize(Math.round(w * scale), Math.round(h * scale));

      const hostRect = host.getBoundingClientRect();
      const focus = focusRef?.current?.getBoundingClientRect();
      const box = focus?.width && focus.height ? focus : hostRect;

      camera.aspect = box.width / box.height;
      camera.setViewOffset(box.width, box.height, hostRect.left - box.left, hostRect.top - box.top, w, h);

      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);

      // FILL crops the bounding sphere against the focus box, which can push the drum off the
      // canvas when the box hugs an edge — so also keep it clear of the canvas itself.
      const pxPerUnit = box.height / 2 / Math.tan(vFov / 2);
      const cx = box.left - hostRect.left + box.width / 2;
      const cy = box.top - hostRect.top + box.height / 2;
      const margin = Math.max(Math.min(cx, w - cx, cy, h - cy), 1);
      const dist = Math.max(radius / Math.sin(Math.min(vFov, hFov) / 2) / FILL, (radius * pxPerUnit) / margin);
      // Clip planes have to follow the model's scale, or the far plane saws through the mirror
      // floor as the fit distance grows — a straight line across it, then no reflection at all.
      camera.near = dist * 0.01;
      camera.far = dist + FLOOR_RADIUS * radius * 2;
      camera.updateProjectionMatrix();

      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      controls.minDistance = controls.maxDistance = dist;
      controls.update();
    };

    let frame = 0;
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      gltf.scene.position.sub(sphere.center);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) m.dithering = true;
      });
      radius = sphere.radius * 1.05; // margin so it never kisses the edges
      scene.add(gltf.scene);

      const floorY = box.min.y - sphere.center.y;
      const rig = stage(radius, floorY);
      mirror = rig.find((o): o is Reflector => o instanceof Reflector) ?? null;
      scene.add(...rig);

      // Aim slightly below the drum so it sits high in frame, leaving room for the reflection.
      controls.target.y = -radius * 0.18;
      camera.position.set(0, radius * 0.3, radius);
      fit();
      setReady(true);

      // Horizontal drags (and the auto-spin) turn the drum, not the camera, so the fixed lights
      // sweep across it. OrbitControls still owns the vertical orbit; we siphon off its azimuth
      // each frame — that keeps its damping, so the spin coasts to a stop like a real orbit.
      const model = gltf.scene;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        controls.update();
        const azimuth = controls.getAzimuthalAngle();
        model.rotation.y -= azimuth;
        camera.position.sub(controls.target).applyAxisAngle(UP, -azimuth).add(controls.target);
        camera.lookAt(controls.target);
        renderer.render(scene, camera);
      };
      tick();
    });

    const ro = new ResizeObserver(fit);
    ro.observe(host);
    if (focusRef?.current) ro.observe(focusRef.current);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof Reflector) return o.dispose();
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
          m.dispose();
        }
      });
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [focusRef]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ ...style, opacity: ready ? 1 : 0, transition: "opacity 500ms ease" }}
    />
  );
}

// ponytail: no cast shadow — on a near-black page it only flattened the background texture;
// the reflection does the grounding.
/** Three-point studio rig and a blurred mirror floor. */
function stage(radius: number, floorY: number): THREE.Object3D[] {
  // Key: warm, high, and 3/4 off to the right — an overhead light gave the drum head no gradient.
  const key = new THREE.SpotLight(0xfff1e0, KEY_INTENSITY, 0, 0.85, 1);
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
