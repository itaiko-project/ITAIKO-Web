import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const DrumViewer = lazy(() => import("@/components/DrumViewer"));

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

function ChevronDownIcon({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function WrenchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function CartIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
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
  const product2HeadingRef = useScaleToFit([logo.h, logo.heroH]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isLastSection, setIsLastSection] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const SECTION_COUNT = 3; // hero + 2 onigiri; footer rides at the bottom of the last slide

  const onigiriRatio = logo.heroH / logo.h;

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
        />
      </Suspense>

      {/* ── Navbar (transparent, floating over the hero) ── */}
      <div className="relative flex-shrink-0 h-0 z-40">
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 md:px-8 pt-3 pb-3">
          <Link to="/">
            <img
              src="itaiko.png"
              className="pixelated drag-none"
              alt="ITAIKO"
              style={{ width: `${logo.w}px`, height: `${logo.h}px` }}
            />
          </Link>
          <div className="flex items-center gap-3 md:gap-8">
            <a href="#" className="flex items-center gap-1 text-sm md:text-base text-foreground/70 hover:text-foreground transition-colors whitespace-nowrap">
              <CartIcon size={13} />
              {t("landing.nav.buy")}
            </a>
            <a
              href="https://github.com/itaiko-project"
              className="text-sm md:text-base text-foreground/70 hover:text-foreground transition-colors whitespace-nowrap"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("landing.nav.github")}
            </a>
            <Link
              to="/configure"
              className="flex items-center gap-1 text-sm md:text-base text-foreground/70 hover:text-foreground transition-colors whitespace-nowrap"
            >
              <WrenchIcon size={13} />
              {t("landing.nav.configurator")}
            </Link>
            <LanguageSwitcher />
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
              <h1 className="garamond font-light leading-none whitespace-nowrap shrink-0" style={{ fontSize: '1em' }}>
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
          <div ref={drumSlotRef} aria-hidden className="pointer-events-auto flex-shrink-0 h-[54vh] w-full md:h-[80vh] md:w-[33vw]" style={{ touchAction: 'pan-y', cursor: 'grab' }} />

          {/* NARROW: tagline + button */}
          <div className="reveal reveal-stagger md:hidden flex flex-col items-center px-10 pt-0 pb-3 gap-3 flex-shrink-0 pointer-events-auto">
            <p className="serif-body text-2xl text-center text-muted-foreground leading-snug">
              {t("landing.hero.tagline1a")}<em>{t("landing.hero.tagline1b")}</em><br />
              {t("landing.hero.tagline2")}
            </p>
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
              <a href="#">{t("landing.cta.buy")}</a>
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
                className="garamond font-light leading-none whitespace-nowrap shrink-0"
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
              {t("landing.hero.tagline1a")}<em>{t("landing.hero.tagline1b")}</em><br />
              {t("landing.hero.tagline2")}
            </p>
            <p className="serif-body text-xl text-muted-foreground leading-relaxed mt-3" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.hero.subtitle")}
            </p>
            <div className="mt-5 flex gap-3">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                <a href="#">{t("landing.cta.buy")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/configure">{t("landing.cta.configure")}</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground text-xs">
                <Link to="/configure?demo=true">{t("landing.cta.demo")}</Link>
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
                  <div className="garamond text-3xl md:text-4xl leading-none text-foreground">{value}</div>
                  <div className="mt-1.5 text-xs md:text-sm uppercase tracking-wider text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 2: Onigiri-con ── */}
        <div
          data-section={1}
          className="flex flex-col justify-center md:flex-row-reverse md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* NARROW: heading above image */}
          <div className="reveal md:hidden flex justify-center items-end px-6 pt-1 pb-0 flex-shrink-0">
            <div className="flex items-baseline gap-2 flex-nowrap" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
              <h2 className="garamond font-light leading-none whitespace-nowrap shrink-0" style={{ fontSize: '1em' }}>
                {t("landing.onigiri1.article")}
              </h2>
              <em className="garamond font-light leading-none whitespace-nowrap shrink-0" style={{ fontSize: `${onigiriRatio}em` }}>
                {t("landing.onigiri1.name")}
              </em>
            </div>
          </div>

          {/* The shared scene flies into the controller already beside the drum. */}
          <div ref={controllerSlotRef} aria-hidden className="flex-shrink-0 h-[54vh] w-full md:h-[80vh] md:w-[33vw]" />

          {/* NARROW: tagline + button */}
          <div className="reveal reveal-stagger md:hidden flex flex-col items-center px-10 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="serif-body text-xl text-center text-muted-foreground leading-snug">
              {t("landing.onigiri1.tagline1")}<br />
              {t("landing.onigiri1.tagline2")}
            </p>
            <div className="flex gap-3">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                <a href="#">{t("landing.cta.buy")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#">{t("landing.cta.checkCompatibility")}</a>
              </Button>
            </div>
          </div>

          {/* WIDE: text column */}
          <div className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
            <div
              ref={productHeadingRef}
              className="flex items-baseline gap-2 flex-nowrap w-max"
              style={{ fontSize: `${logo.h}px`, transformOrigin: 'left center' }}
            >
              <h2
                className="garamond font-light leading-none whitespace-nowrap shrink-0"
                style={{ fontSize: '1em' }}
              >
                The
              </h2>
              <em
                className="garamond font-light leading-none whitespace-nowrap shrink-0"
                style={{ fontSize: `${onigiriRatio}em` }}
              >
                Onigiri-con
              </em>
            </div>
            <p className="serif-body text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.onigiri1.tagline1")}
            </p>
            <p className="serif-body text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri1.tagline2")}
            </p>
            <div className="mt-5 flex gap-3">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
                <a href="#">{t("landing.cta.buy")}</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#">{t("landing.cta.checkCompatibility")}</a>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Section 3: Onigiri-con (features) + footer ── */}
        <div
          data-section={2}
          className="flex flex-col overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* main row */}
          <div className="flex flex-col justify-center md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 flex-1 min-h-0 w-full">
          {/* NARROW: heading above image */}
          <div className="reveal md:hidden flex justify-center items-end px-10 pt-1 pb-0 flex-shrink-0 relative z-10">
            <h2 className="garamond font-light leading-none overflow-visible" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
              <em>{t("landing.onigiri2.heading")}</em>
            </h2>
          </div>

          {/* ONIGIRI WIREFRAME — desktop */}
          <div className="reveal reveal-left hidden md:block flex-shrink-0 pointer-events-none">
            <img
              src="onigiri_wireframe.png"
              alt=""
              className="drag-none select-none block float-soft"
              style={{ maxHeight: '80vh', maxWidth: '33vw', height: 'auto', width: 'auto', animationDelay: '-3s' }}
            />
          </div>

          {/* ONIGIRI WIREFRAME — mobile (smaller: this slide also carries the footer) */}
          <div className="reveal md:hidden flex-shrink-0 pointer-events-none flex justify-center">
            <img
              src="onigiri_wireframe.png"
              alt=""
              className="drag-none select-none float-soft"
              style={{ maxHeight: '44vh', maxWidth: '100%', animationDelay: '-3s' }}
            />
          </div>

          {/* NARROW: tagline + button */}
          <div className="reveal reveal-stagger md:hidden flex flex-col items-center px-10 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="serif-body text-xl text-center text-muted-foreground leading-snug">
              {t("landing.onigiri2.tagline1")}<br />
              {t("landing.onigiri2.tagline2")}
            </p>
            <div className="flex gap-3">
              <Button asChild size="lg" variant="outline">
                <a href="https://github.com/itaiko-project" target="_blank" rel="noopener noreferrer">{t("landing.cta.buildYourOwn")}</a>
              </Button>
            </div>
          </div>

          {/* WIDE: text column */}
          <div className="reveal reveal-stagger hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
            <div
              ref={product2HeadingRef}
              className="flex items-baseline gap-2 flex-nowrap w-max"
              style={{ fontSize: `${logo.heroH}px`, transformOrigin: 'left center' }}
            >
              <h2
                className="garamond font-light leading-none whitespace-nowrap shrink-0"
                style={{ fontSize: '1em' }}
              >
                <em>{t("landing.onigiri2.heading")}</em>
              </h2>
            </div>
            <p className="serif-body text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.onigiri2.tagline1")}
            </p>
            <p className="serif-body text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri2.tagline2")}
            </p>
            <div className="mt-5">
              <Button asChild size="lg" variant="outline">
                <a href="https://github.com/itaiko-project" target="_blank" rel="noopener noreferrer">{t("landing.cta.buildYourOwn")}</a>
              </Button>
            </div>
          </div>
          </div>{/* /main row */}

          {/* Footer pinned to the bottom of the last slide */}
          <footer className="seigaiha-footer border-t flex-shrink-0 py-4">
            <div className="px-4 md:px-16 grid grid-cols-3 items-center text-sm text-foreground">
              <span className="hidden md:inline">{t("landing.footer.browserRequirement")}</span>
              <span className="md:hidden" />
              <div className="flex justify-center">
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
              <span />
            </div>
          </footer>
        </div>

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
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-white/70 hover:text-white transition-all duration-500 animate-bounce ${
            isLastSection ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
          }`}
          aria-label="Sezione successiva"
        >
          <ChevronDownIcon size={32} />
        </button>
      </div>

      {/* ── Scroll dots ── */}
      <div className="fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-3">
        {Array.from({ length: SECTION_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' });
            }}
            aria-label={`Section ${i + 1}`}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              activeSection === i ? 'bg-foreground scale-125' : 'bg-foreground/30 hover:bg-foreground/60'
            }`}
          />
        ))}
      </div>

    </div>
  );
}
