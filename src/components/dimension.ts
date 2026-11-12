// A dimension between two points already on screen, in the site's one measuring style (the drum head's Ø arrow):
// a solid line with filled arrowheads and end ticks, and a label in a blue pill (.dim-pill). When the dimension is
// set out from the part, thin extension lines connect them. Short dimensions get their arrowheads outside, pointing
// in, and the label beside instead of on the line. Used over the 3D drum and over the plate renders.

export type Point = [number, number];
export type Dimension = {
  ext: string;    // thin extension lines (stroke)
  line: string;   // dimension line and end ticks (stroke)
  heads: string;  // arrowheads (fill)
  /** Where the label's pill goes: a point, and the CSS translate that anchors the pill to it. */
  label: { x: number; y: number; anchor: string };
};
export type DimensionSize = { head: number; headHalf: number; tick: number };

export const DIM_LARGE: DimensionSize = { head: 20, headHalf: 8, tick: 26 }; // over the drum, matches the Ø arrow
export const DIM_SMALL: DimensionSize = { head: 11, headHalf: 4.5, tick: 14 }; // over the plate renders

/**
 * `side` is a rough screen direction the dimension sits towards (snapped perpendicular to a→b); `offset` sets it
 * out from the part by that many px. `labelOnLine` forces the pill onto the line's middle (the Ø arrow does, even
 * while it is still drawing out and short).
 */
export function dimension(a: Point, b: Point, side: Point, { offset = 0, size = DIM_LARGE, labelOnLine = false }: {
  offset?: number; size?: DimensionSize; labelOnLine?: boolean;
} = {}): Dimension {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const u: Point = [dx / length, dy / length];
  let n: Point = [-u[1], u[0]];
  if (n[0] * side[0] + n[1] * side[1] < 0) n = [-n[0], -n[1]];
  const at = (p: Point, k: number, v: Point = n): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
  const f = (p: Point) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const A = at(a, offset), B = at(b, offset);
  const { head, headHalf, tick } = size;
  const arrow = (tip: Point, dir: Point) => {
    const base = at(tip, -head, dir);
    return `M ${f(tip)} L ${f(at(base, headHalf))} L ${f(at(base, -headHalf))} Z`;
  };
  const ticks = `M ${f(at(A, tick / 2))} L ${f(at(A, -tick / 2))} M ${f(at(B, tick / 2))} L ${f(at(B, -tick / 2))}`;
  const ext = offset > 0 ? `M ${f(at(a, 3))} L ${f(at(A, 4))} M ${f(at(b, 3))} L ${f(at(B, 4))}` : "";
  const inside = length >= 2 * head + 6;
  const line = inside
    ? `M ${f(at(A, head - 1, u))} L ${f(at(B, -(head - 1), u))} ${ticks}`
    : `M ${f(at(A, -(head + 12), u))} L ${f(at(B, head + 12, u))} ${ticks}`;
  const heads = inside
    ? arrow(A, [-u[0], -u[1]]) + arrow(B, u)
    : arrow(A, u) + arrow(B, [-u[0], -u[1]]);

  const mid: Point = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (labelOnLine || (inside && length > 170)) return { ext, line, heads, label: { x: mid[0], y: mid[1], anchor: "translate(-50%, -50%)" } };
  const beside = at(mid, tick / 2 + 6);
  const anchor = Math.abs(n[0]) >= Math.abs(n[1])
    ? (n[0] > 0 ? "translate(0, -50%)" : "translate(-100%, -50%)")
    : (n[1] < 0 ? "translate(-50%, -100%)" : "translate(-50%, 0)");
  return { ext, line, heads, label: { x: beside[0], y: beside[1], anchor } };
}
