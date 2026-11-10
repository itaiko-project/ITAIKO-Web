import { createRef, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { TourStop } from "@/components/DrumViewer";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ChevronDown, ShoppingCart, Wrench } from "lucide-react";

const DrumViewer = lazy(() => import("@/components/DrumViewer"));

// Close-ups between the hero and the controller, one slide each. Coordinates are in the GLB's space
// (head faces +z, leans back ~35°, floor at y = 0); see TourStop.
const TOUR: Omit<TourStop, "slot">[] = [
  { target: [0, 13.5, 0.5], size: 11, yaw: 28, elevation: 16 },        // head / arcade rubber
  // Plates float PLATES_LIFT out along the head normal; aim between them and the head, from the other side.
  { target: [0, 15.55, 2.04], size: 12.5, yaw: -32, elevation: 20, plates: true }, // steel plates
  { target: [0, 12.5, -1.5], size: 12, yaw: 205, elevation: 16 },  // birch back
  { target: [1.5, 10, 1], size: 14.5, yaw: 58, elevation: 24 },      // stand, bachi cradle
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
  const [isLastSection, setIsLastSection] = useState(false);
  const [drumProgress, setDrumProgress] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const SECTION_COUNT = TOUR.length + 3; // hero, tour, onigiri, specs+faq (+footer)
  type Item = Record<string, string>;
  const [tour] = useState(() => TOUR.map((s) => ({ ...s, slot: createRef<HTMLDivElement>() })));
  const tourText = t("landing.tour.items", { returnObjects: true }) as Item[];
  const specRows = t("landing.specSheet.rows", { returnObjects: true }) as Item[];
  const faq = t("landing.faq.items", { returnObjects: true }) as Item[];

  const onigiriRatio = logo.heroH / logo.h;
  // Browser setup + demo link, shown with the controller it configures.
  const setupLine = (
    <>
      {t("landing.hero.subtitle")}.{" "}
      <Link to="/configure?demo=true" className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground transition-colors">
        {t("landing.cta.demo")}
      </Link>
    </>
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

  const goToNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
  };

  return (
    <div className="relative h-screen flex flex-col overflow-hidden">

      <Suspense fallback={null}>
        <DrumViewer
          className="absolute inset-0 z-0 pointer-events-none"
          focusRef={drumSlotRef}
          controllerRef={controllerSlotRef}
          scrollRef={scrollRef}
          tour={tour}
          hint={t("landing.onigiri1.tryMe")}
          onProgress={setDrumProgress}
        />
      </Suspense>

      {/* ── Navbar (transparent, floating over the hero) ── */}
      <div className="relative flex-shrink-0 h-0 z-40">
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 md:px-8 py-3">
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
            {/* Configure stays a clear button, but outlined: Shop is the one filled, blue action up here. */}
            <Button asChild size="sm" variant="outline" className="md:h-9 md:px-4">
              <Link to="/configure" aria-label={t("landing.cta.configure")}>
                <Wrench size={16} strokeWidth={1.5} aria-hidden />
                <span className="hidden md:inline">{t("landing.cta.configure")}</span>
              </Link>
            </Button>
            <Button asChild size="sm" className="md:h-9 md:px-4 bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
              <a href="#">
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
        className="relative z-10 flex-1 min-h-0 overflow-y-scroll snap-scroll flex flex-col"
        style={{ scrollSnapType: 'y mandatory' }}
      >

        {/* ── Section 1: Hero ── */}
        <div
          data-section={0}
          className="relative flex flex-col overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* main row — pointer-events off so drags land on the canvas; text opts back in */}
          <div className="relative z-10 pointer-events-none flex flex-col justify-center md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 flex-1 min-h-0 w-full pt-14 md:pt-0">
          {/* NARROW: heading above drum */}
          <div className="reveal md:hidden flex justify-center items-end px-6 pt-1 pb-0 flex-shrink-0 pointer-events-auto">
            <div className="flex items-center gap-1 flex-nowrap" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
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
          </div>

          {/* DRUM slot — empty; the canvas behind frames itself on this box */}
          <div ref={drumSlotRef} aria-hidden className="relative pointer-events-auto flex-shrink-0 h-[54vh] w-full md:h-[80vh] md:w-[33vw]" style={{ touchAction: 'pan-y', cursor: 'grab' }}>
            {/* Loading bar in the drum's place until the model is on screen; the drum then fades in over it. */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${drumProgress >= 1 ? "opacity-0" : ""}`}>
              <div className="h-1 w-32 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full w-full origin-left rounded-full bg-foreground/70 transition-transform duration-200" style={{ transform: `scaleX(${drumProgress})` }} />
              </div>
            </div>
          </div>

          {/* NARROW: tagline + button */}
          <div className="reveal reveal-stagger md:hidden flex flex-col items-center px-10 pt-0 pb-3 gap-3 flex-shrink-0 pointer-events-auto">
            <p className="serif-body text-2xl text-center text-muted-foreground leading-snug">
              {t("landing.hero.tagline1a")}<span className="text-foreground">{t("landing.hero.tagline1b")}</span><br />
              {t("landing.hero.tagline2")}
            </p>
            <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
              <a href="#"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
            </Button>
          </div>

          {/* WIDE: text column */}
          <div className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0 pointer-events-auto" style={{ maxWidth: 'min(720px, 60vw)' }}>
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
            <p className="serif-body text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.hero.tagline1a")}<span className="text-foreground">{t("landing.hero.tagline1b")}</span><br />
              {t("landing.hero.tagline2")}
            </p>
            <div className="mt-5 flex gap-3">
              <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                <a href="#"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
              </Button>
            </div>
          </div>
          </div>{/* /main row */}

          {/* Spec strip (desktop only — mobile hero has no room) */}
          <div className="relative z-10 hidden md:block flex-shrink-0 w-full px-6 md:px-16 pb-5 md:pb-10">
            <div className="reveal reveal-stagger mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 text-center">
              {[
                [t("landing.specs.pollingValue"), t("landing.specs.polling")],
                [t("landing.specs.modesValue"), t("landing.specs.modes")],
                [t("landing.specs.displayValue"), t("landing.specs.display")],
                [t("landing.specs.openSourceValue"), t("landing.specs.openSource")],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="display-font text-3xl md:text-4xl leading-none text-foreground tabular-nums">{value}</div>
                  <div className="mt-2 font-mono text-xs md:text-sm text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sections 2–4: drum tour — the shared scene flies to each slot and points at the part ── */}
        {tour.map((stop, k) => {
          const item = tourText[k];
          return (
            <section
              key={k}
              data-section={k + 1}
              className={`flex flex-col justify-center pt-14 md:pt-0 md:items-center md:justify-center md:gap-12 md:px-16 overflow-hidden ${k % 2 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
              style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
            >
              <div ref={stop.slot} aria-hidden className="flex-shrink-0 h-[46vh] w-full md:h-[78vh] md:w-[44vw]" />
              <div className="reveal reveal-stagger relative z-10 flex-shrink-0 px-8 pt-5 pb-8 bg-background/85 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none md:p-0 md:max-w-[30vw]">
                <p className="font-mono text-xs md:text-sm text-brand-ink tabular-nums">
                  {String(k + 1).padStart(2, '0')} / {String(tour.length).padStart(2, '0')} · {item.eyebrow}
                </p>
                {item.stat && <div className="display-font leading-none mt-3 tabular-nums" style={{ fontSize: 'clamp(48px, 7vw, 96px)' }}>{item.stat}</div>}
                <h2 className="display-font leading-tight mt-2" style={{ fontSize: 'clamp(26px, 3vw, 40px)' }}>{item.title}</h2>
                <p className="serif-body text-lg text-muted-foreground leading-relaxed mt-3">{item.body}</p>
                {stop.plates && <p className="mt-4 font-mono text-xs md:text-sm text-muted-foreground">{t("landing.tour.made")}</p>}
              </div>
            </section>
          );
        })}

        {/* ── Section 5: Onigiri-con ── */}
        <div
          data-section={tour.length + 1}
          className="flex flex-col justify-center md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* NARROW: heading above image */}
          <div className="reveal md:hidden flex justify-center items-end px-6 pt-1 pb-0 flex-shrink-0">
            <h2 className="display-font flex flex-col items-start leading-none whitespace-nowrap" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
              <span className="text-[0.5em]">{t("landing.onigiri1.article")}</span>
              <span>{t("landing.onigiri1.name")}</span>
            </h2>
          </div>

          {/* The shared scene flies into the controller already beside the drum. */}
          <div ref={controllerSlotRef} aria-hidden className="flex-shrink-0 h-[54vh] w-full md:h-[80vh] md:w-[33vw]" />

          {/* NARROW: tagline + button */}
          <div className="reveal reveal-stagger md:hidden flex flex-col items-center px-10 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="serif-body text-xl text-center text-muted-foreground leading-snug">
              {t("landing.onigiri1.tagline1")}<br />
              {t("landing.onigiri1.tagline2")}
            </p>
            <p className="serif-body text-base text-center text-muted-foreground leading-relaxed">{setupLine}</p>
            <div className="flex gap-3">
              <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                <a href="#"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
              </Button>
            </div>
          </div>

          {/* WIDE: text column */}
          <div className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
            <div ref={productHeadingRef} className="w-max" style={{ fontSize: `${logo.h}px` }}>
              <h2 className="display-font flex flex-col items-start leading-none whitespace-nowrap">
                <span>{t("landing.onigiri1.article")}</span>
                <span style={{ fontSize: `${onigiriRatio}em` }}>{t("landing.onigiri1.name")}</span>
              </h2>
            </div>
            <p className="serif-body text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.onigiri1.tagline1")}
            </p>
            <p className="serif-body text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri1.tagline2")}
            </p>
            <p className="serif-body text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {setupLine}
            </p>
            <div className="mt-5 flex gap-3">
              <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                <a href="#"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Section 6: Specs + FAQ side by side, closing CTA + footer ── */}
        <section data-section={tour.length + 2} className="flex flex-col" style={{ scrollSnapAlign: 'start', flexShrink: 0, minHeight: '100%' }}>
          <div className="flex-1 flex flex-col justify-center px-6 md:px-16 pt-20 pb-16">
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
                </div>
                <div>
                  <h2 className="reveal display-font leading-none" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>{t("landing.faq.heading")}</h2>
                  {/* ponytail: native <details>, no accordion component */}
                  <div className="reveal reveal-stagger mt-8">
                    {faq.map((f) => (
                      <details key={f.q} className="group border-t py-3">
                        <summary className="cursor-pointer list-none flex justify-between gap-4 font-medium">
                          {f.q}
                          <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                        </summary>
                        <p className="mt-2 text-muted-foreground leading-relaxed">{f.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
              <div className="reveal reveal-stagger mt-16 text-center">
                <div ref={closingHeadingRef} className="mx-auto w-max" style={{ fontSize: `${logo.h}px` }}>
                  {/* Same build as the hero heading: text at logo.h, the logo one pixel-step bigger, 4px apart */}
                  <h2 className="display-font flex items-center gap-1 leading-none whitespace-nowrap">
                    {t("landing.closing.heading")}
                    <img src="itaiko.png" className="pixelated drag-none shrink-0" alt="ITAIKO" style={{ width: `${logo.heroW}px`, height: `${logo.heroH}px` }} />
                  </h2>
                </div>
                <p className="serif-body text-xl text-muted-foreground mt-3">{t("landing.closing.tagline")}</p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button asChild size="lg" className="bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
                    <a href="#"><ShoppingCart size={16} strokeWidth={1.5} aria-hidden />{t("landing.cta.buy")}</a>
                  </Button>
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
            isLastSection ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--background) 85%, transparent) 100%)',
          }}
        />
        <button
          onClick={goToNext}
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-foreground/70 hover:text-foreground transition-[color,opacity] duration-300 ${
            isLastSection ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
          }`}
          aria-label={t("landing.nav.next")}
        >
          <ChevronDown size={32} strokeWidth={1.5} aria-hidden />
        </button>
      </div>


      {/* ── Scroll dots ── */}
      <div className="fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
        {Array.from({ length: SECTION_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              scrollRef.current?.querySelector(`[data-section="${i}"]`)?.scrollIntoView({ behavior: 'smooth' });
            }}
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
