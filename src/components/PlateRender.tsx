import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildPlates } from "./plates";
import { birchMaterial, galvanizedSteel, loadPlywood, PLY, reproportionPlywood } from "./materials";
import { enqueueShot, offscreenRenderer, SHOT_H as H, SHOT_W as W, shotCamera, studioScene } from "./offscreen";
import { DIM_SMALL, dimension, type Point } from "./dimension";

// Close-up product renders of the plates for the ours-vs-original comparisons, made at page load by the shared
// offscreen renderer (offscreen.ts) and shown as images. The dimension arrows go on top as SVG in real pixels, so
// they stay crisp at any size.

type Material = "steel" | "birch";
type Spec = { material: Material; thickness: number; ka?: number; ours: boolean };
type Dim = { a: Point; b: Point; side: Point }; // image-normalized (0..1)
type Result = { url: string; thickness: Dim; ka?: Dim };

// Plates lie face up (front face at y = 0), seen from above the rim. Angles are around the plate from +z toward +x,
// in degrees; `frame` is the radius (mm) kept in view around the target. Each view is shared by ours and the
// original, so a pair compares at the same scale. Spots avoid the screw holes.
const VIEW: Record<Material, { r: number; deg: number; y: number; frame: number; camDeg: number; elevation: number; thickDeg: number; kaDeg?: number }> = {
  // Tight on the rim: at 40 mm of frame the 3 mm edge came out ~6 px on screen.
  steel: { r: 200, deg: 46, y: -1.5, frame: 24, camDeg: 92, elevation: 28, thickDeg: 46 },
  birch: { r: 178, deg: 40, y: -6, frame: 70, camDeg: 95, elevation: 30, thickDeg: 52, kaDeg: 30 },
};

async function renderPlate({ material, thickness, ka, ours }: Spec): Promise<Result> {
  const r = offscreenRenderer();
  const view = VIEW[material];
  const studio = studioScene(r);
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
  const url = r.domElement.toDataURL("image/png");

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

export default function PlateRender({ material, ours, thickness, ka, thicknessLabel, kaLabel }: Spec & {
  thicknessLabel: string;
  kaLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);

  // Rendered at load, in the background (see the queue), so it is ready long before it scrolls into view.
  useEffect(() => {
    let cancelled = false;
    enqueueShot(() => (cancelled ? Promise.reject(new Error("unmounted")) : renderPlate({ material, thickness, ka, ours })))
      .then((r) => { if (!cancelled) setResult(r); })
      .catch(() => undefined); // no WebGL: the caption still says it
    return () => { cancelled = true; };
  }, [material, thickness, ka, ours]);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [w, h] = size;
  const px = (p: Point): Point => [p[0] * w, p[1] * h];
  const dims = result && w > 0
    ? [
        { dim: result.thickness, label: thicknessLabel },
        ...(result.ka && kaLabel ? [{ dim: result.ka, label: kaLabel }] : []),
      ].map(({ dim, label }) => ({
        ...dimension(px(dim.a), px(dim.b), [dim.side[0] * w, dim.side[1] * h], { offset: 18, size: DIM_SMALL }),
        text: label,
      }))
    : [];

  // Same measuring style as the drum head's Ø arrow (index.css: .drum-dims, .dim-pill), in its small size.
  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ aspectRatio: `${W} / ${H}` }}>
      {result
        ? <img src={result.url} alt="" draggable={false} className="absolute inset-0 w-full h-full" />
        : <div className="absolute inset-[15%] rounded-full bg-foreground/5 animate-pulse" />}
      <div className="drum-dims dims-small" aria-hidden>
        <svg viewBox={`0 0 ${w || 1} ${h || 1}`}>
          {dims.map((d, i) => (
            <g key={i}>
              <path className="dim-ext" d={d.ext} />
              <path className="dim-line" d={d.line} />
              <path className="dim-heads" d={d.heads} />
            </g>
          ))}
        </svg>
        {dims.map((d, i) => (
          <span key={i} className="dim-pill" style={{ transform: `translate(${d.label.x}px, ${d.label.y}px) ${d.label.anchor}` }}>{d.text}</span>
        ))}
      </div>
    </div>
  );
}
