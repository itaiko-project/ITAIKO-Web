import { createRef, lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import type { TourStop } from "@/components/DrumViewer";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ChevronDown, ShoppingCart, Wrench } from "lucide-react";

const DrumViewer = lazy(() => import("@/components/DrumViewer"));
const MiniDrum = lazy(() => import("@/components/DrumViewer").then((m) => ({ default: m.MiniDrum })));
const PlateRender = lazy(() => import("@/components/PlateRender"));
const OnigiriRender = lazy(() => import("@/components/OnigiriRender"));

// Close-ups between the hero and the controller, one slide each. Coordinates are in the GLB's space
// (head faces +z, leans back ~35°, floor at y = 0); see TourStop.
// `compare` puts the ours-vs-original plate renders under that stop's text.
type Material = "steel" | "birch";
const TOUR: (Omit<TourStop, "slot"> & { compare?: Material })[] = [
  { target: [1.1, 13.5, 0.5], size: 11.5, yaw: 28, elevation: 16, measure: true }, // head / arcade rubber, Ø arrow
  // Plates float PLATES_LIFT out along the head normal; aim between them and the head, from the other side.
  { target: [0, 15.55, 2.04], size: 12.5, yaw: -32, elevation: 20, plates: true, compare: "steel" }, // steel plates
  // Bare plywood plates (drum and onigiri faded away), head-on: straight down the head's normal, which leans back
  // 34.8°. The plywood is drawn flat, so no depth shows; its thickness is in the comparison renders.
  { target: [0, 14.86, 1.06], size: 12.4, yaw: 0, elevation: 34.8, wood: true, compare: "birch" },
  // Stand from behind; it flashes on arrival.
  { target: [0, 9.5, -1.5], size: 14.5, yaw: 150, elevation: 20, stand: true },
];

// ponytail: the reveal observer grabs .reveal nodes once on mount, so an HMR swap leaves the new
// nodes unobserved and stuck at opacity 0. Full reload in dev instead of debugging a phantom.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

function useScaleToFit(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    const update = () => {
      el.style.zoom = '';
      const natural = el.scrollWidth;
      const available = el.parentElement!.clientWidth;
      el.style.zoom = natural > available ? String(available / natural) : '';
    };
    const ro = new ResizeObserver(update);
    ro.observe(el.parentElement!);
    update();
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function useLogoSizes() {
  const calc = () => {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.ceil(dpr);
    const scale = k / dpr;
    const heroScale = (k + 1) / dpr;
    const w = 128 * scale;
    const h = 64 * scale;
    return { w, h, heroW: 128 * heroScale, heroH: 64 * heroScale };
  };
  const [sizes, setSizes] = useState(calc);
  useEffect(() => {
    const update = () => setSizes(calc());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return sizes;
}

/**
 * FAQ accordion: one answer open at a time, sliding open and shut. The list keeps a fixed minimum height (its
 * questions plus the longest answer), and with one answer open its content can never outgrow that, not even while
 * one closes and another opens, so opening or switching questions never changes the page's length.
 */
function FaqList({ items }: { items: Record<string, string>[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [heights, setHeights] = useState<number[]>([]);
  const [minHeight, setMinHeight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const answers = useRef<(HTMLDivElement | null)[]>([]);
  const baseId = useId();

  // Each answer's natural height (scrollHeight works while collapsed) and each row's height without its answer,
  // remeasured when the list's width, an answer's text, or the web fonts change them.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      const natural = items.map((_, i) => answers.current[i]?.scrollHeight ?? 0);
      const questions = items.reduce((sum, _, i) => sum + (rows.current[i]?.offsetHeight ?? 0) - (answers.current[i]?.offsetHeight ?? 0), 0);
      setHeights(natural);
      setMinHeight(questions + Math.max(0, ...natural));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    for (const a of answers.current) if (a?.firstElementChild) ro.observe(a.firstElementChild);
    document.fonts?.ready.then(measure);
    measure();
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [items]);

  return (
    <div ref={listRef} className="reveal mt-8" style={{ minHeight }}>
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} ref={(el) => { rows.current[i] = el; }} className="border-t">
            <button
              type="button"
              className="w-full py-3 flex justify-between gap-4 text-left font-medium cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`${baseId}-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              {f.q}
              <span aria-hidden className={`text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>+</span>
            </button>
            <div
              id={`${baseId}-${i}`}
              ref={(el) => { answers.current[i] = el; }}
              role="region"
              className="overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
              style={{ height: isOpen ? heights[i] : 0 }}
              aria-hidden={!isOpen}
            >
              <p className={`pb-3 text-muted-foreground leading-relaxed transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>{f.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ?3d=off shows the static fallback, ?3d=force keeps the live scene whatever its speed (for testing and captures).
const PREF_3D = new URLSearchParams(location.search).get("3d");
const JUMP_FADE_MS = 200; // dots: fade out, jump, fade in (duration-200 on the faded layers matches)
const LOAD_TIMEOUT_MS = 12000; // no drum ready by then: stop waiting and stay on the stills
const STATIC_LAYOUT = window.matchMedia("(max-width: 767px)").matches ? "m" : "d"; // the stills come in both layouts

/**
 * A slide's 3D content as a still (public/static/<layout>-<name>.webp, made by scripts/capture-static.mjs), filling
 * its slot. Only fetched once it is first needed; after that it stays mounted so it can fade out under the live scene.
 */
function StaticShot({ name, show, eager }: { name: string; show: boolean; eager?: boolean }) {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true); // adjusting state during render: no extra effect pass
  if (!mounted) return null;
  return (
    <img
      src={`static/${STATIC_LAYOUT}-${name}.webp`}
      alt=""
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-500"
      style={{ opacity: show ? 1 : 0 }}
    />
  );
}

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export function LandingPage() {
  const { t } = useTranslation("pages");
  const logo = useLogoSizes();
  const drumSlotRef = useRef<HTMLDivElement>(null);
  const controllerSlotRef = useRef<HTMLDivElement>(null);
  const headingRef = useScaleToFit([logo.h, logo.heroW, logo.heroH]);
  const productHeadingRef = useScaleToFit([logo.h, logo.heroH]);
  const closingHeadingRef = useScaleToFit([logo.h, logo.heroW, logo.heroH]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const [isLastSection, setIsLastSection] = useState(false);
  const [drumProgress, setDrumProgress] = useState(0);
  // "3d": the live scene. "static": WebGL is missing, broke, is too slow, or took too long to come up; every slide
  // then shows a still of its final state (public/static) and nothing 3D runs.
  const [mode, setMode] = useState<"3d" | "static">(PREF_3D === "off" ? "static" : "3d");
  const fallBack = useCallback(() => setMode("static"), []);
  // Stills → 3D: while the 3D loads (and warms up, hidden) each slot shows its still. Once ready, the 3D fades in
  // over it, already in the final state of the slide you are on, as the still fades out: a crossfade between two
  // matching pictures, no half-played animation on screen.
  const showStatic = mode === "static" || drumProgress < 1;
  useEffect(() => {
    if (mode !== "3d" || drumProgress >= 1 || PREF_3D === "force") return;
    const timer = setTimeout(fallBack, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [mode, drumProgress, fallBack]);
  const [activeSection, setActiveSection] = useState(0);
  const [freeScroll, setFreeScroll] = useState(false); // phones, on the last slide: no snapping, no dots
  const [jumping, setJumping] = useState(false); // a dot jump of more than one slide is fading (see goTo)
  const jumpRef = useRef(false);
  const [navSolid, setNavSolid] = useState(false);     // scrolled into the last slide: text passes under the navbar
  const SECTION_COUNT = TOUR.length + 3; // hero, tour, onigiri, specs+faq (+footer)
  type Item = Record<string, string>;
  const [tour] = useState(() => TOUR.map((s) => ({ ...s, slot: createRef<HTMLDivElement>() })));
  const tourText = t("landing.tour.items", { returnObjects: true }) as Item[];
  const specRows = t("landing.specSheet.rows", { returnObjects: true }) as Item[];
  const faq = t("landing.faq.items", { returnObjects: true }) as Item[];

  const features = (t("landing.specs.ticker", { returnObjects: true }) as Item[]).map((f) => [f.value, f.label]);
  const tagline = (
    <>
      {t("landing.hero.tagline1a")}<span className="text-foreground">{t("landing.hero.tagline1b")}</span>{t("landing.hero.tagline1c")}<br />
      {t("landing.hero.tagline2")}
    </>
  );

  // The ticker runs from over the drum to the window's right edge; tell its mask where that edge is,
  // so it fades out there too instead of being cut.
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    const update = () => el.style.setProperty("--ticker-end", `${Math.max(window.innerWidth - el.getBoundingClientRect().left, 0)}px`);
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    if (el.parentElement) ro.observe(el.parentElement); // the column moves when fonts land or the heading rescales
    update();
    return () => ro.disconnect();
  }, []);

  const onigiriRatio = logo.heroH / logo.h;
  // Two pre-rendered close-ups under the onigiri: the JTAG-8 socket on its back, and the OLED menu.
  const onigiriShots = (
    <div className="grid grid-cols-2 gap-3 md:gap-5 w-full max-w-md">
      {(["port", "screen"] as const).map((shot) => (
        <Suspense key={shot} fallback={<div className="w-full aspect-[4/3]" />}>
          <OnigiriRender shot={shot} caption={t(`landing.onigiri1.${shot}`)} />
        </Suspense>
      ))}
    </div>
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const { scrollTop, clientHeight, scrollHeight } = el;
      // Only consider "last section" if there's actually content below to scroll to
      setIsLastSection(scrollHeight <= clientHeight + 4 || scrollTop + clientHeight >= scrollHeight - 4);
    };
    check(); // set correct initial state
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Active dot: track the most-visible section/footer (ratio is relative to each
  // target, so a fully-shown short footer reads 1.0 — robust to differing heights)
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.section), e.intersectionRatio);
        let best = -1, bestIdx = 0;
        ratios.forEach((r, i) => { if (r > best) { best = r; bestIdx = i; } });
        setActiveSection(bestIdx);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    root.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Entrance reveals: toggle .is-visible as each snap section enters the scroll container
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.classList.toggle('is-visible', e.isIntersecting);
      },
      { root, threshold: 0.2 }
    );
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Phones: the last slide (specs, FAQ, footer) is taller than the screen, and snapping through it fights the
  // finger. Landing on it turns snapping off and hides the dots, so it scrolls like a normal page; scrolling back up
  // past its top turns them back on and glides to the slide before, where the slides and animations resume.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const phone = window.matchMedia('(max-width: 767px)');
    let free = false, previous = el.scrollTop, settle = 0;
    let floor = 0, floorUntil = 0; // just left the last slide: for a moment, the scroll may not rise past the slide before
    const setFree = (on: boolean) => {
      free = on;
      el.style.scrollSnapType = on ? 'none' : 'y mandatory'; // now, not on the next render: the glide below needs it
      setFreeScroll(on);
    };
    const update = () => {
      if (jumpRef.current) {
        previous = el.scrollTop;
        return;
      }
      if (performance.now() < floorUntil && el.scrollTop < floor - 1) {
        // Whatever momentum survived (Firefox keeps flinging) stops here, at the slide before.
        el.scrollTo({ top: floor, behavior: 'instant' });
        previous = floor;
        return;
      }
      const top = el.scrollTop, up = top < previous;
      previous = top;
      const lastSlide = el.querySelector<HTMLElement>(`[data-section="${SECTION_COUNT - 1}"]`);
      if (!lastSlide) return;
      clearTimeout(settle);
      setNavSolid(top > lastSlide.offsetTop + 8);
      if (!phone.matches) {
        if (free) setFree(false);
        return;
      }
      // Free scroll starts only once the snap has settled on the last slide: switching snapping off mid-fling let
      // the momentum carry on to the bottom of the page.
      if (!free && top >= lastSlide.offsetTop - 1) {
        clearTimeout(settle);
        settle = window.setTimeout(() => { if (!free && phone.matches && el.scrollTop >= lastSlide.offsetTop - 1) setFree(true); }, 180);
      }
      else if (free && up && top < lastSlide.offsetTop - 4) {
        setFree(false);
        // A hard upward fling carries momentum that would sail past the slide before. Freezing the scroller for a
        // frame kills it; then glide to exactly the slide before this one.
        const target = Math.max(lastSlide.offsetTop - el.clientHeight, 0);
        floor = target;
        floorUntil = performance.now() + 900;
        el.style.overflowY = 'hidden';
        requestAnimationFrame(() => {
          el.style.overflowY = '';
          el.scrollTo({ top: target, behavior: 'smooth' });
        });
      }
    };
    el.addEventListener('scroll', update, { passive: true });
    phone.addEventListener('change', update);
    return () => {
      el.removeEventListener('scroll', update);
      phone.removeEventListener('change', update);
    };
  }, [SECTION_COUNT]);

  // Text fades with the scroll: each slide's text blocks ([data-scroll-fade]) are fully there when the slide is
  // snapped in and gone 40% of the way to the next, tracking the finger both ways. Inline opacity, so it overrides
  // the entrance reveal's resting opacity; cleared again once the slide is fully in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const top = el.scrollTop, height = el.clientHeight || 1;
      el.querySelectorAll<HTMLElement>('[data-section]').forEach((section) => {
        const blocks = section.querySelectorAll<HTMLElement>('[data-scroll-fade]');
        if (!blocks.length) return;
        const v = Math.min(1, Math.max(0, 1 - (Math.abs(section.offsetTop - top) / height) * 2.5));
        const opacity = v > 0.999 ? '' : v.toFixed(3);
        blocks.forEach((b) => { b.style.opacity = opacity; });
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    el.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    apply();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  // Jumping more than one slide (the dots): fade the scene and the slides out, scroll there instantly, fade back in.
  // A smooth scroll would replay every slide in between, sped up. One slide away still glides as usual.
  const goTo = (i: number) => {
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-section="${i}"]`);
    if (!el || !target || jumpRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (Math.abs(i - activeSection) <= 1) {
      el.scrollTo({ top: target.offsetTop, behavior: reduced ? 'instant' : 'smooth' });
      return;
    }
    jumpRef.current = true;
    setJumping(true);
    setTimeout(() => {
      el.scrollTo({ top: target.offsetTop, behavior: 'instant' });
      // Two frames: the scene lands on the new slide before it is shown again.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        jumpRef.current = false;
        setJumping(false);
      }));
    }, reduced ? 0 : JUMP_FADE_MS);
  };

  const goToNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
  };

  // Root height 100dvh: the viewport actually visible. h-screen (100vh) is the large one, which on Android runs on under
  // the browser's toolbar and put the bottom of every slide behind it; it stays as the fallback for older browsers.
  return (
    <div className="relative h-screen flex flex-col overflow-hidden" style={{ height: '100dvh' }}>

      {/* Wrapper for the jump fade: the viewer sets its own opacity inline, so the fade goes on its parent. */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-200 ${jumping ? 'opacity-0' : ''}`}>
      {mode === "3d" && <Suspense fallback={null}>
        <DrumViewer
          className="absolute inset-0 z-0 pointer-events-none"
          onFail={fallBack}
          force={PREF_3D === "force"}
          reveal={drumProgress >= 1}
          focusRef={drumSlotRef}
          controllerRef={controllerSlotRef}
          scrollRef={scrollRef}
          tour={tour}
          hint={t("landing.onigiri1.tryMe")}
          measureLabel={t("landing.tour.measure")}
          woodLabel={t("landing.tour.compare.ka.ours")}
          onProgress={setDrumProgress}
        />
      </Suspense>}
      </div>

      {/* ── Navbar (transparent, floating over the hero) ── */}
      <div className="relative flex-shrink-0 h-0 z-40">
        {/* Transparent over the slides; once the last slide's text scrolls up under it, it gets a backdrop. */}
        <nav className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 md:px-8 py-3 transition-colors duration-300 ${
          navSolid ? 'bg-background/95 border-b' : 'border-b border-transparent'
        }`}>
          <Link to="/">
            <img
              src="itaiko.png"
              className="pixelated drag-none"
              alt="ITAIKO"
              style={{ width: `${logo.w}px`, height: `${logo.h}px` }}
            />
          </Link>
          <div className="flex items-center gap-3 md:gap-8">
            <LanguageSwitcher />
            {/* Configure stays a clear button, but outlined: Shop is the one filled, blue action up here. Not on phones:
                the configurator talks to the drum over WebSerial, which mobile browsers don't have. */}
            <Button asChild size="sm" variant="outline" className="hidden md:inline-flex md:h-9 md:px-4">
              <Link to="/configure" aria-label={t("landing.cta.configure")}>
                <Wrench size={16} strokeWidth={1.5} aria-hidden />
                <span className="hidden md:inline">{t("landing.cta.configure")}</span>
              </Link>
            </Button>
            <Button asChild size="sm" className="md:h-9 md:px-4 bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
              <a href="https://shop.itaiko.com">
                <ShoppingCart size={16} strokeWidth={1.5} aria-hidden />
                {t("landing.nav.buy")}
              </a>
            </Button>
          </div>
        </nav>
      </div>

      {/* ── Snap scroll container ── */}
      <div
        ref={scrollRef}
        className={`relative z-10 flex-1 min-h-0 overflow-y-scroll snap-scroll flex flex-col transition-opacity duration-200 ${jumping ? 'opacity-0' : ''}`}
        style={{ scrollSnapType: freeScroll ? 'none' : 'y mandatory' }}
      >

        {/* ── Section 1: Hero ── */}
        <div
          data-section={0}
          className="relative flex flex-col overflow-hidden"
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* main row — pointer-events off so drags land on the canvas; text opts back in */}
          {/* Phones: the drum fills the screen from under the navbar, "Meet ITAIKO" centred just under it, then the
              tagline (its first line leading, the second quieter) and the Buy button, all centred. */}
          <div className="relative z-10 pointer-events-none flex flex-col justify-start md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 flex-1 min-h-0 w-full pt-24 md:pt-0">
          {/* DRUM slot — empty; the canvas behind frames itself on this box */}
          <div ref={drumSlotRef} aria-hidden className="relative pointer-events-auto flex-1 min-h-[34vh] w-full md:flex-none md:h-[80vh] md:w-[33vw]" style={{ touchAction: 'pan-y', cursor: 'grab' }}>
            {/* The still is there from the first paint; the live drum fades in over it once it is ready. */}
            <StaticShot name="0" show={showStatic} eager />
          </div>

          {/* NARROW: heading, tagline, button (the bottom padding keeps it clear of the next-section chevron and the screen edge) */}
          {/* -mt-6: up into the drum box's bottom margin (the faint floor reflection), so the title sits just under it */}
          {/* Phones: the slide starts lower under the navbar and keeps less empty room under the button. */}
          <div data-scroll-fade className="reveal reveal-stagger md:hidden relative flex-none flex flex-col items-center text-center px-6 -mt-14 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pointer-events-auto">
            <div className="flex items-center justify-center gap-1 flex-nowrap" style={{ fontSize: 'clamp(34px, 9vw, 56px)' }}>
              <h1 className="display-font leading-none whitespace-nowrap shrink-0" style={{ fontSize: '1em' }}>
                {t("landing.hero.welcome")}
              </h1>
              <img
                src="itaiko.png"
                className="pixelated drag-none shrink-0"
                alt="ITAIKO"
                style={{ width: `${logo.w}px`, height: `${logo.h}px` }}
              />
            </div>
            <p className="serif-body text-xl text-muted-foreground leading-snug mt-4">
              {t("landing.hero.tagline1a")}<span className="text-foreground">{t("landing.hero.tagline1b")}</span>{t("landing.hero.tagline1c")}
            </p>
            <p className="serif-body text-sm text-muted-foreground/80 leading-relaxed mt-1 max-w-[30ch]">{t("landing.hero.tagline2")}</p>
            <Button asChild size="lg" className="mt-5 bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
              <a href="https://shop.itaiko.com"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
            </Button>
          </div>

          {/* WIDE: text column */}
          <div data-scroll-fade className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0 pointer-events-auto" style={{ maxWidth: 'min(720px, 60vw)' }}>
            {/* Feature ticker: from the text column to the window edge, fading in at its left end before it can
                reach the drum; appears with the drum. Three identical copies slide by exactly one, so the loop never
                shows a gap or a jump, however wide the window. */}
            {/* w-0 min-w-full: takes the column's width without its 100vw track widening the column */}
            <div className="pointer-events-none select-none mb-10 w-0 min-w-full" aria-label={features.map((f) => f.join(" ")).join(", ")}>
              <div
                ref={tickerRef}
                className="feature-ticker transition-opacity duration-700"
                style={{ opacity: drumProgress >= 1 || mode === "static" ? 1 : 0 }}
                aria-hidden
              >
                <div className="feature-ticker-track" style={{ animationDuration: `${features.length * 4.5}s` }}>
                  {[0, 1, 2].map((copy) => features.map(([value, label]) => (
                    <div key={`${copy}-${label}`} className="flex-shrink-0 px-10 text-center">
                      <div className="display-font text-3xl md:text-4xl leading-none text-foreground tabular-nums">{value}</div>
                      <div className="mt-2 font-mono text-xs md:text-sm text-muted-foreground whitespace-nowrap">{label}</div>
                    </div>
                  )))}
                </div>
              </div>
            </div>
            <div
              ref={headingRef}
              className="flex items-center gap-1 flex-nowrap w-max"
              style={{ fontSize: `${logo.h}px`, transformOrigin: 'left center' }}
            >
              <h1
                className="display-font leading-none whitespace-nowrap shrink-0"
                style={{ fontSize: '1em' }}
              >
                {t("landing.hero.welcome")}
              </h1>
              <img
                src="itaiko.png"
                className="pixelated drag-none shrink-0"
                alt="ITAIKO"
                style={{ width: `${logo.heroW}px`, height: `${logo.heroH}px` }}
              />
            </div>
            <p className="serif-body text-2xl text-muted-foreground leading-snug mt-3">{tagline}</p>
            <div className="mt-5 flex gap-3">
              <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                <a href="https://shop.itaiko.com"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
              </Button>
            </div>
          </div>
          </div>{/* /main row */}
        </div>

        {/* ── Sections 2–4: drum tour — the shared scene flies to each slot and points at the part ── */}
        {tour.map((stop, k) => {
          const item = tourText[k];
          return (
            <section
              key={k}
              data-section={k + 1}
              // Phones: model at the top under the navbar, text below. Centred, a short text (the rubber stop) left the
              // model sitting low.
              className={`flex flex-col justify-start pt-20 md:pt-0 md:items-center md:justify-center md:gap-12 md:px-16 overflow-hidden ${k % 2 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0, flexBasis: '100%' }}
            >
              {/* Phones: the model takes whatever height the text leaves, and the text panel sits at the bottom at its
                  own height, down to the screen's edge. Nothing in it gets cut off, and none of the rest of the scene
                  (onigiri, stand) peeks out below it. */}
              <div ref={stop.slot} aria-hidden className="relative flex-1 min-h-[26vh] w-full md:flex-none md:h-[78vh] md:w-[44vw]">
                <StaticShot name={String(k + 1)} show={showStatic} />
                {/* Static mode: the stand blinks in 2D, its lit twin fading over the plain still twice on arrival. */}
                {stop.stand && mode === "static" && (
                  <img
                    src={`static/${STATIC_LAYOUT}-${k + 1}-flash.webp`}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className={`static-flash absolute inset-0 w-full h-full object-contain pointer-events-none select-none ${activeSection === k + 1 ? "is-on" : ""}`}
                  />
                )}
              </div>
              <div data-scroll-fade className="reveal reveal-stagger relative z-10 flex-none pl-6 pr-10 pt-5 pb-mobile-safe bg-background/90 md:bg-transparent md:p-0 md:max-w-[30vw]">
                <p className="font-mono text-xs md:text-sm text-brand-ink">{item.eyebrow}</p>
                {/* The big figure; on phones the comparison below already says it, and the room goes to the model. */}
                {item.stat && <div className={`display-font leading-none mt-3 tabular-nums ${stop.compare ? 'hidden md:block' : ''}`} style={{ fontSize: 'clamp(48px, 7vw, 96px)' }}>{item.stat}</div>}
                <h2 className="display-font leading-tight mt-2" style={{ fontSize: 'clamp(24px, 3vw, 40px)' }}>{item.title}</h2>
                <p className="serif-body text-base md:text-lg text-muted-foreground leading-relaxed mt-2 md:mt-3">{item.body}</p>
                {item.extra && <p className="serif-body text-base md:text-lg text-foreground leading-relaxed mt-2 md:mt-3">{item.extra}</p>}
                {stop.compare && (
                  // Ours vs the arcade original, side by side, rendered at the same scale.
                  <div className="mt-4 md:mt-6 grid grid-cols-2 gap-3 md:gap-5 max-w-lg">
                    {[true, false].map((ours) => {
                      const side = ours ? "ours" : "original";
                      const wood = stop.compare === "birch";
                      return (
                        <figure key={side}>
                          <Suspense fallback={<div className="w-full aspect-[4/3]" />}><PlateRender
                            material={stop.compare!}
                            ours={ours}
                            thickness={wood ? (ours ? 12 : 10) : (ours ? 3 : 2)}
                            thicknessLabel={t(`landing.tour.compare.${stop.compare}.${side}`)}
                            ka={wood ? (ours ? 40 : 30) : undefined}
                            kaLabel={wood ? t(`landing.tour.compare.ka.${side}`) : undefined}
                          /></Suspense>
                          <figcaption className={`mt-2 font-mono text-xs md:text-sm ${ours ? 'text-foreground' : 'text-muted-foreground'}`}>{t(`landing.tour.compare.${side}`)}</figcaption>
                        </figure>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {/* ── Section 5: Onigiri-con ── */}
        <div
          data-section={tour.length + 1}
          // Phones, in the tour slides' style: the onigiri centred in the space under the navbar with its title just
          // above it, and the text panel at the bottom on the same blurred backdrop.
          className="flex flex-col justify-start pt-24 md:pt-0 md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* Title + onigiri, centred together. md:contents: on wide screens this wrapper drops out of the layout and
              the slot is the row's left column again. */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1 pt-2 md:contents">
            <h2 data-scroll-fade className="reveal reveal-stagger md:hidden display-font flex flex-col items-start leading-none whitespace-nowrap px-6" style={{ fontSize: 'clamp(32px, 8vw, 56px)' }}>
              <span className="text-[0.5em]">{t("landing.onigiri1.article")}</span>
              <span>{t("landing.onigiri1.name")}</span>
            </h2>
            {/* The shared scene flies into the controller already beside the drum. The slot has the onigiri's own
                proportions, so it fills the box and the title sits right on it. */}
            <div ref={controllerSlotRef} aria-hidden className="relative w-full flex-1 min-h-0 max-h-[100vw] md:flex-none md:max-h-none md:h-[80vh] md:w-[33vw]">
              <StaticShot name={String(tour.length + 1)} show={showStatic} />
            </div>
          </div>

          {/* NARROW: text panel with the two close-ups. No configurator line (phones have no WebSerial) and no Buy
              button here: it is in the navbar, the hero and the closing panel. */}
          {/* Kept compact, so the onigiri above gets as much of the screen as it can. */}
          <div data-scroll-fade className="reveal reveal-stagger md:hidden relative z-10 flex-none flex flex-col items-center text-center px-8 pt-3 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] bg-background/90">
            <p className="serif-body text-base text-muted-foreground leading-snug">{t("landing.onigiri1.tagline1")}</p>
            <p className="serif-body text-sm italic text-muted-foreground/80 leading-snug mt-1">{t("landing.onigiri1.tagline2")}</p>
            <div className="mt-3">{onigiriShots}</div>
          </div>

          {/* WIDE: text column */}
          <div data-scroll-fade className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
            <div ref={productHeadingRef} className="w-max" style={{ fontSize: `${logo.h}px` }}>
              <h2 className="display-font flex flex-col items-start leading-none whitespace-nowrap">
                <span>{t("landing.onigiri1.article")}</span>
                <span style={{ fontSize: `${onigiriRatio}em` }}>{t("landing.onigiri1.name")}</span>
              </h2>
            </div>
            <p className="serif-body text-xl text-muted-foreground leading-snug mt-3" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri1.tagline1")}
            </p>
            <p className="serif-body text-base italic text-muted-foreground/80 leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri1.tagline2")}
            </p>
            <div className="mt-5">{onigiriShots}</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                <a href="https://shop.itaiko.com"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
              </Button>
              {/* The configurator in demo mode, no drum needed. Same outlined button as "Configure your drum". */}
              <Button asChild size="lg" variant="outline">
                <Link to="/configure?demo=true"><Wrench size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.demo")}</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Section 6: Specs + FAQ side by side, closing CTA + footer ── */}
        <section data-section={tour.length + 2} className="flex flex-col" style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0, minHeight: '100%' }}>
          <div className="flex-1 flex flex-col justify-center px-6 md:px-16 pt-28 md:pt-32 pb-16">
            <div className="mx-auto max-w-6xl w-full">
              <div className="grid gap-16 md:grid-cols-2 md:gap-16">
                <div>
                  <h2 className="reveal display-font leading-none" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>{t("landing.specSheet.heading")}</h2>
                  <dl className="reveal reveal-stagger mt-8">
                    {specRows.map((r) => (
                      <div key={r.label} className="grid grid-cols-[7rem_1fr] md:grid-cols-[8rem_1fr] items-baseline gap-4 border-t py-3">
                        <dt className="font-mono text-xs md:text-sm text-muted-foreground">{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="reveal mt-3 font-mono text-xs text-muted-foreground">{t("landing.specSheet.note")}</p>
                </div>
                <div>
                  <h2 className="reveal display-font leading-none" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>{t("landing.faq.heading")}</h2>
                  <FaqList items={faq} />
                </div>
              </div>
              {/* Closing CTA, one panel: the turning drum on the left, the question, then "Get your ITAIKO" with a
                  big Buy button beside it (stacked below lg, where the two don't fit side by side). */}
              <div className="reveal reveal-stagger mt-6 md:mt-10 rounded-2xl border bg-foreground/[0.03] px-5 py-7 md:pl-6 md:pr-12 md:py-6 flex flex-col md:flex-row items-center gap-4 md:gap-8">
                <div className="flex-shrink-0 w-44 h-44 md:w-64 md:h-64">
                  {mode === "3d"
                    ? <Suspense fallback={null}><MiniDrum className="w-full h-full" /></Suspense>
                    : <img src="static/mini.webp" alt="" loading="lazy" decoding="async" draggable={false} className="w-full h-full object-contain" />}
                </div>
                <div className="flex-1 min-w-0 w-full flex flex-col items-center md:items-start text-center md:text-left">
                  <p className="serif-body text-xl md:text-3xl text-muted-foreground leading-snug">{t("landing.closing.tagline")}</p>
                  {/* Phones: the heading sized to the screen, like the hero's, and a full-width button under it. */}
                  <div className="md:hidden mt-5 flex items-center justify-center gap-1 flex-nowrap" style={{ fontSize: 'clamp(30px, 8.5vw, 56px)' }}>
                    <h2 className="display-font leading-none whitespace-nowrap shrink-0">{t("landing.closing.heading")}</h2>
                    <img src="itaiko.png" className="pixelated drag-none shrink-0" alt="ITAIKO" style={{ width: `${logo.w}px`, height: `${logo.h}px` }} />
                  </div>
                  <Button asChild size="lg" className="md:hidden mt-6 w-full max-w-xs h-14 text-lg gap-3 rounded-xl bg-brand-fill hover:bg-brand-fill-hover text-white border-0 shadow-lg shadow-brand/25">
                    <a href="https://shop.itaiko.com"><ShoppingCart className="size-5" strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
                  </Button>
                  <div className="hidden md:flex mt-6 w-full flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-10">
                    <div className="min-w-0 max-w-full">
                      <div ref={closingHeadingRef} className="w-max" style={{ fontSize: `${logo.h}px`, transformOrigin: 'left center' }}>
                        {/* Same build as the hero heading: text at logo.h, the logo one pixel-step bigger, 4px apart */}
                        <h2 className="display-font flex items-center gap-1 leading-none whitespace-nowrap">
                          {t("landing.closing.heading")}
                          <img src="itaiko.png" className="pixelated drag-none shrink-0" alt="ITAIKO" style={{ width: `${logo.heroW}px`, height: `${logo.heroH}px` }} />
                        </h2>
                      </div>
                    </div>
                    <Button asChild size="lg" className="flex-shrink-0 h-16 px-10 has-[>svg]:px-9 text-xl gap-3 rounded-xl bg-brand-fill hover:bg-brand-fill-hover text-white border-0 shadow-lg shadow-brand/25">
                      <a href="https://shop.itaiko.com"><ShoppingCart className="size-6" strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer pinned to the bottom of the last slide */}
          <footer className="seigaiha-footer border-t flex-shrink-0 py-4">
            <div className="px-4 md:px-16 flex justify-center">
              <a
                href="https://github.com/itaiko-project"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/70 hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <GitHubIcon size={20} />
              </a>
            </div>
          </footer>
        </section>

      </div>

      {/* ── Gradient fade + chevron (h-0 overlay at scroll/footer boundary) ── */}
      <div className="relative flex-shrink-0 h-0 z-40">
        <div
          className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-500 h-[64px] md:h-[120px] ${
            isLastSection || freeScroll ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--background) 85%, transparent) 100%)',
          }}
        />
        <button
          onClick={goToNext}
          className={`absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-10 text-foreground/70 hover:text-foreground transition-[color,opacity] duration-300 ${
            isLastSection || freeScroll ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
          }`}
          aria-label={t("landing.nav.next")}
        >
          <ChevronDown size={32} strokeWidth={1.5} aria-hidden />
        </button>
      </div>


      {/* ── Scroll dots (gone while a phone scrolls freely through the last slide) ── */}
      <div
        className={`fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3 transition-opacity duration-300 ${
          freeScroll ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden={freeScroll || undefined}
      >
        {Array.from({ length: SECTION_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Section ${i + 1}`}
            className={`w-2.5 h-2.5 rounded-full transition-colors duration-150 ${
              activeSection === i ? 'bg-foreground' : 'bg-foreground/30 hover:bg-foreground/60'
            }`}
          />
        ))}
      </div>

    </div>
  );
}
