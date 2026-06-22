import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useState } from "react";
import { getRememberedEdition, isZhongTaiko, ZHONGTAIKO_BRAND } from "@/lib/edition";

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
    return { w, h, heroW: 128 * heroScale, heroH: 64 * heroScale, seigaihaH: h + 12 };
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
  const headingRef = useScaleToFit([logo.h, logo.heroW, logo.heroH]);
  const productHeadingRef = useScaleToFit([logo.h, logo.heroH]);
  const product2HeadingRef = useScaleToFit([logo.h, logo.heroH]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isLastSection, setIsLastSection] = useState(false);

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

  const goToNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* ── Navbar (always visible) ── */}
      <div
        className="seigaiha-border relative flex-shrink-0"
        style={{ height: `${logo.seigaihaH}px` }}
      >
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 md:px-8 pt-0 pb-3 z-10">
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
        className="flex-1 min-h-0 overflow-y-scroll snap-scroll flex flex-col"
        style={{ scrollSnapType: 'y mandatory' }}
      >

        {/* ── Section 1: Hero ── */}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* NARROW: heading above drum */}
          <div className="md:hidden flex justify-center items-end px-6 pt-1 pb-0 flex-shrink-0">
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

          {/* DRUM — desktop */}
          <div className="hidden md:block flex-shrink-0 pointer-events-none">
            <img
              src="drum_home.png"
              alt=""
              className="drag-none select-none block"
              style={{ maxHeight: '80vh', maxWidth: '33vw', height: 'auto', width: 'auto' }}
            />
          </div>

          {/* DRUM — mobile */}
          <div className="md:hidden flex-shrink-0 overflow-hidden pointer-events-none flex items-start justify-center pl-10" style={{ height: '54vh' }}>
            <img
              src="drum_home.png"
              alt=""
              className="drag-none select-none"
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* NARROW: tagline + button */}
          <div className="md:hidden flex flex-col items-center px-6 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="garamond text-2xl text-center text-muted-foreground leading-snug">
              {t("landing.hero.tagline1a")}<em>{t("landing.hero.tagline1b")}</em><br />
              {t("landing.hero.tagline2")}
            </p>
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
              <a href="#">{t("landing.cta.buy")}</a>
            </Button>
          </div>

          {/* WIDE: text column */}
          <div className="hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
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
            <p className="garamond text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.hero.tagline1a")}<em>{t("landing.hero.tagline1b")}</em><br />
              {t("landing.hero.tagline2")}
            </p>
            <p className="garamond text-xl text-muted-foreground leading-relaxed mt-3" style={{ maxWidth: 'min(580px, 55vw)' }}>
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
        </div>

        {/* ── Section 2: Onigiri-con ── */}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* NARROW: heading above image */}
          <div className="md:hidden flex justify-center items-end px-6 pt-1 pb-0 flex-shrink-0">
            <div className="flex items-baseline gap-2 flex-nowrap" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
              <h2 className="garamond font-light leading-none whitespace-nowrap shrink-0" style={{ fontSize: '1em' }}>
                {t("landing.onigiri1.article")}
              </h2>
              <em className="garamond font-light leading-none whitespace-nowrap shrink-0" style={{ fontSize: `${onigiriRatio}em` }}>
                {t("landing.onigiri1.name")}
              </em>
            </div>
          </div>

          {/* ONIGIRI — desktop */}
          <div className="hidden md:block flex-shrink-0 pointer-events-none">
            <img
              src="onigiri_home.png"
              alt=""
              className="drag-none select-none block"
              style={{ maxHeight: '80vh', maxWidth: '33vw', height: 'auto', width: 'auto' }}
            />
          </div>

          {/* ONIGIRI — mobile */}
          <div className="md:hidden flex-shrink-0 overflow-hidden pointer-events-none flex items-start justify-center" style={{ height: '54vh' }}>
            <img
              src="onigiri_home.png"
              alt=""
              className="drag-none select-none"
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* NARROW: tagline + button */}
          <div className="md:hidden flex flex-col items-center px-6 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="garamond text-xl text-center text-muted-foreground leading-snug">
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
          <div className="hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
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
            <p className="garamond text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.onigiri1.tagline1")}
            </p>
            <p className="garamond text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
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

        {/* ── Section 3: Onigiri-con (features) ── */}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-center md:gap-4 md:px-16 overflow-hidden"
          style={{ scrollSnapAlign: 'start', flexShrink: 0, flexBasis: '100%' }}
        >
          {/* NARROW: heading above image */}
          <div className="md:hidden flex justify-center items-end px-10 pt-1 pb-0 flex-shrink-0 relative z-10">
            <h2 className="garamond font-light leading-none overflow-visible" style={{ fontSize: 'clamp(40px, 10vw, 72px)' }}>
              <em>{t("landing.onigiri2.heading")}</em>
            </h2>
          </div>

          {/* ONIGIRI WIREFRAME — desktop */}
          <div className="hidden md:block flex-shrink-0 pointer-events-none">
            <img
              src="onigiri_wireframe.png"
              alt=""
              className="drag-none select-none block"
              style={{ maxHeight: '80vh', maxWidth: '33vw', height: 'auto', width: 'auto' }}
            />
          </div>

          {/* ONIGIRI WIREFRAME — mobile */}
          <div className="md:hidden flex-shrink-0 pointer-events-none flex justify-center">
            <img
              src="onigiri_wireframe.png"
              alt=""
              className="drag-none select-none"
              style={{ maxHeight: '54vh', maxWidth: '100%' }}
            />
          </div>

          {/* NARROW: tagline + button */}
          <div className="md:hidden flex flex-col items-center px-6 pt-0 pb-3 gap-3 flex-shrink-0">
            <p className="garamond text-xl text-center text-muted-foreground leading-snug">
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
          <div className="hidden md:flex flex-col justify-center flex-shrink-0" style={{ maxWidth: 'min(720px, 60vw)' }}>
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
            <p className="garamond text-2xl text-muted-foreground leading-snug mt-3">
              {t("landing.onigiri2.tagline1")}
            </p>
            <p className="garamond text-xl text-muted-foreground leading-relaxed mt-2" style={{ maxWidth: 'min(580px, 55vw)' }}>
              {t("landing.onigiri2.tagline2")}
            </p>
            <div className="mt-5">
              <Button asChild size="lg" variant="outline">
                <a href="https://github.com/itaiko-project" target="_blank" rel="noopener noreferrer">{t("landing.cta.buildYourOwn")}</a>
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* ── Gradient fade + chevron (h-0 overlay at scroll/footer boundary) ── */}
      <div className="relative flex-shrink-0 h-0 z-40">
        <div
          className={`absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity duration-500 ${
            isLastSection ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            height: '120px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 100%)',
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

      {/* ── Footer (always visible) ── */}
      <footer className="seigaiha-footer border-t flex-shrink-0 py-5">
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
  );
}
