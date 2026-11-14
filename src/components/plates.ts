import * as THREE from "three";

// The steel plates under the head, from plates_bucate.dxf (one half, mm). Every arc in the file shares one
// centre, which is the origin here; each half's straight edge sits SPLIT mm off it, so the two mirrored halves
// leave a 2 × SPLIT gap. Holes are [x, y, radius], already relative to that centre.
const SPLIT = 2.5;
const DISC_R = 166.5;
const RING_R = [171.5, 211.5] as const;
const THICKNESS = 3;
const HOLES: [number, number, number][] = [
  [20.17, 129.96, 3.2], [132.17, 0, 3.2], [20.17, -129.96, 3.2],
  [108.17, -100, 10], [108.17, 100, 10], [82.17, 0, 37.5],
  [200.0, 22, 3.5], [200.0, -22, 3.5],
  [36.17, -195.96, 3.2], [171.47, -99.59, 3.2], [36.17, 195.96, 3.2], [171.47, 99.59, 3.2],
];

/** Angle where the straight edge x = SPLIT meets a circle of radius r. */
const edgeAngle = (r: number) => Math.atan2(Math.sqrt(r * r - SPLIT * SPLIT), SPLIT);

function halfShapes(): THREE.Shape[] {
  const disc = new THREE.Shape();
  const a = edgeAngle(DISC_R);
  disc.moveTo(SPLIT, -DISC_R * Math.sin(a));
  disc.absarc(0, 0, DISC_R, -a, a, false);
  disc.lineTo(SPLIT, -DISC_R * Math.sin(a));

  const [ri, ro] = RING_R;
  const ai = edgeAngle(ri), ao = edgeAngle(ro);
  const ring = new THREE.Shape();
  ring.moveTo(SPLIT, ri * Math.sin(ai));
  ring.lineTo(SPLIT, ro * Math.sin(ao));
  ring.absarc(0, 0, ro, ao, -ao, true);
  ring.lineTo(SPLIT, -ri * Math.sin(ai));
  ring.absarc(0, 0, ri, -ai, ai, false);

  for (const [x, y, r] of HOLES) {
    const hole = new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, true);
    (Math.hypot(x, y) < DISC_R ? disc : ring).holes.push(hole);
  }
  return [disc, ring];
}

/**
 * All four plates (centre and rim, left and right), lying in the XY plane with their back face at z = 0,
 * in mm; scale the group to the model.
 */
export function buildPlates(material: THREE.Material, thickness = THICKNESS): THREE.Group {
  const geometry = new THREE.ExtrudeGeometry(halfShapes(), { depth: thickness, bevelEnabled: false, curveSegments: 48 });
  const right = new THREE.Mesh(geometry, material);
  const left = new THREE.Mesh(geometry, material);
  left.scale.x = -1; // three flips the winding for negative scale, so the mirror renders right side out
  return new THREE.Group().add(right, left);
}
