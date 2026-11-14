import { useEffect, useRef, useState } from "react";
import { DIM_SMALL, dimension, type Point } from "./dimension";
import shots from "./shots.json";

// The ours-vs-original plate close-ups: pre-rendered stills (public/shots/*.webp) with the dimension arrows drawn
// on top as SVG in real pixels, so they stay crisp at any size. No 3D at runtime. The stills and the arrows' anchor
// points (shots.json) come from scripts/capture-static.mjs, which opens the page with ?shots=live to render them.

type Material = "steel" | "birch";
type Dim = { a: Point; b: Point; side: Point }; // image-normalized (0..1)
type Shot = { url: string; thickness: Dim; ka?: Dim };
const W = 480, H = 360;
const LIVE = import.meta.env.DEV && new URLSearchParams(location.search).get("shots") === "live";

export default function PlateRender({ material, ours, thickness, ka, thicknessLabel, kaLabel }: {
  material: Material; thickness: number; ka?: number; ours: boolean;
  thicknessLabel: string;
  kaLabel?: string;
}) {
  const key = `${material}-${ours ? "ours" : "original"}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const stored = (shots as unknown as Record<string, Omit<Shot, "url"> | undefined>)[key];
  const [result, setResult] = useState<Shot | null>(!LIVE && stored ? { ...stored, url: `shots/${key}.webp` } : null);
  const [size, setSize] = useState<[number, number]>([0, 0]);

  // Dev only: render the still live and publish it for the capture script.
  useEffect(() => {
    if (!LIVE) return;
    let cancelled = false;
    import("./shotsLive").then(({ enqueueShot, renderPlate }) => enqueueShot(() => renderPlate({ material, thickness, ka, ours })))
      .then((r) => {
        if (cancelled) return;
        ((window as unknown as { __shots: Record<string, unknown> }).__shots ??= {})[key] = r;
        setResult(r);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [key, material, thickness, ka, ours]);

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
      {result && <img src={result.url} alt="" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full" />}
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
