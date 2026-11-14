import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { KeyMappings } from "@/types";
import { browserKeyToHid } from "@/lib/hid-keycodes";
import { HelpButton } from "@/components/ui/help-modal";
import { RotateCcw } from "lucide-react";
import { KeyGlyph } from "./KeyGlyph";

// Map SVG button IDs to KeyMappings structure
const BUTTON_MAPPINGS: Record<string, { category: keyof KeyMappings; key: string }> = {
  // Action buttons (NESW)
  "North": { category: "controller", key: "north" },
  "East": { category: "controller", key: "east" },
  "South": { category: "controller", key: "south" },
  "West": { category: "controller", key: "west" },

  // D-Pad
  "Up": { category: "controller", key: "up" },
  "Down": { category: "controller", key: "down" },
  "Left": { category: "controller", key: "left" },
  "Right": { category: "controller", key: "right" },

  // Shoulders
  "L--Left-Shoulder-": { category: "controller", key: "l" },
  "R--Right-Shoulder-": { category: "controller", key: "r" },

  // Special buttons
  "Escape": { category: "controller", key: "home" },
  "Tab": { category: "controller", key: "select" },
};

// Center and size (smaller side) of each mappable button, in % of the SVG's viewBox.
// The overlay is as wide as the SVG, so these % double as cqw. Geometry is static, measure once.
function measureButtons(svg: SVGSVGElement) {
  const vb = svg.viewBox.baseVal;
  const svgCTM = svg.getScreenCTM();
  const out: Record<string, { x: number; y: number; size: number }> = {};
  for (const id of Object.keys(BUTTON_MAPPINGS)) {
    const el = svg.querySelector(`[id="${id}"]`);
    const elCTM = el instanceof SVGGraphicsElement ? el.getScreenCTM() : null;
    if (!el || !elCTM || !svgCTM) continue;
    const b = (el as SVGGraphicsElement).getBBox();
    const pt = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2)
      .matrixTransform(elCTM).matrixTransform(svgCTM.inverse());
    const scale = elCTM.a / svgCTM.a; // buttons are only translated/uniformly scaled
    out[id] = {
      x: ((pt.x - vb.x) / vb.width) * 100,
      y: ((pt.y - vb.y) / vb.height) * 100,
      size: (Math.min(b.width, b.height) * scale / vb.width) * 100,
    };
  }
  return out;
}

export function InteractiveKeyMapping() {
  const { t } = useTranslation("config");
  const { config, updateKeyMapping, isConnected, resetKeyMappings } = useDevice();
  const keyMappings = config.keyMappings;
  // We use this state only to signal that SVG is injected and ready for manipulation
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [selectedButton, setSelectedButton] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  // Button centers as % of the board, for the keycap overlay
  const [labelPos, setLabelPos] = useState<Record<string, { x: number; y: number; size: number }>>({});
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Fetch and insert SVG manually to avoid React reconciliation issues
  useEffect(() => {
    if (!svgContainerRef.current) return;

    // If we already have content, don't re-fetch
    if (svgContainerRef.current.querySelector("svg")) {
      setSvgLoaded(true);
      return;
    }

    fetch("/onigiri.svg")
      .then((res) => res.text())
      .then((content) => {
        if (svgContainerRef.current) {
          // Manually inject HTML. React will leave this alone as long as we don't
          // render children in JSX.
          svgContainerRef.current.innerHTML = content;

          // Make SVG responsive
          const svg = svgContainerRef.current.querySelector("svg");
          if (svg) {
            svg.setAttribute("width", "100%");
            svg.setAttribute("height", "100%");
            svg.style.width = "100%";
            svg.style.height = "auto";
            svg.style.display = "block";
            setLabelPos(measureButtons(svg));
          }

          setSvgLoaded(true);
        }
      })
      .catch(console.error);
  }, []);

  // Handle button click
  const handleButtonClick = useCallback((buttonId: string) => {
    if (!isConnected || !BUTTON_MAPPINGS[buttonId]) return;
    setSelectedButton(buttonId);
    setIsListening(true);
  }, [isConnected]);

  // Attach event listeners to SVG elements
  useEffect(() => {
    if (!svgLoaded || !svgContainerRef.current) return;

    const svg = svgContainerRef.current.querySelector("svg");
    if (!svg) return;

    // Clean up previous listeners if they exist
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    const clickHandlers: Array<{ element: Element; handler: () => void }> = [];

    Object.keys(BUTTON_MAPPINGS).forEach((buttonId) => {
      const element = svg.querySelector(`[id="${buttonId}"]`);
      if (element) {
        const handler = () => handleButtonClick(buttonId);

        element.addEventListener("click", handler);
        element.setAttribute("style", "cursor: pointer; transition: opacity 0.2s;");

        // Hover effects
        const mouseEnter = () => { (element as SVGElement).style.opacity = "0.8"; };
        const mouseLeave = () => { (element as SVGElement).style.opacity = "1"; };

        element.addEventListener("mouseenter", mouseEnter);
        element.addEventListener("mouseleave", mouseLeave);

        clickHandlers.push({ element, handler });
      }
    });

    // Save cleanup function
    cleanupRef.current = () => {
      clickHandlers.forEach(({ element, handler }) => {
        element.removeEventListener("click", handler);
        // Note: We're not explicitly cleaning up mouseenter/leave here as they are anonymous functions
        // created in the loop. In a perfect world we would, but the DOM node removal handles it mostly.
        // For the 'click' handler we saved the reference.
      });
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [svgLoaded, handleButtonClick]);

  // Handle key press when listening
  useEffect(() => {
    if (!isListening || !selectedButton) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const hidCode = browserKeyToHid(e);
      if (hidCode !== null) {
        const mapping = BUTTON_MAPPINGS[selectedButton];
        if (mapping) {
          updateKeyMapping(mapping.category, mapping.key, hidCode);
        }
        setIsListening(false);
        setSelectedButton(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (svgContainerRef.current && !svgContainerRef.current.contains(e.target as Node)) {
        setIsListening(false);
        setSelectedButton(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isListening, selectedButton, updateKeyMapping]);

  // Helper to get button value
  const getButtonValue = useCallback((buttonId: string): number | null => {
    if (!keyMappings) return null;
    const mapping = BUTTON_MAPPINGS[buttonId];
    if (!mapping) return null;

    const categoryMappings = keyMappings[mapping.category];
    if (!categoryMappings) return null;

    return (categoryMappings as Record<string, number>)[mapping.key] ?? null;
  }, [keyMappings]);

  // Update SVG button colors and LABELS based on state
  useEffect(() => {
    if (!svgLoaded || !svgContainerRef.current) return;

    const svg = svgContainerRef.current.querySelector("svg");
    if (!svg) return;

    Object.keys(BUTTON_MAPPINGS).forEach((buttonId) => {
      const element = svg.querySelector(`[id="${buttonId}"]`);
      if (!element) return;

      const tagName = element.tagName.toLowerCase();
      const shapeElement = tagName === "g"
        ? element.querySelector("circle, rect, path")
        : element;

      if (shapeElement) {
        (shapeElement as SVGElement).style.fill = "var(--brand-fill)";
        shapeElement.classList.toggle("key-listening", isListening && selectedButton === buttonId);
      }

    });
  }, [svgLoaded, selectedButton, isListening]);

  if (!keyMappings) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          {t("interactiveKeyMapping.title")}
          <HelpButton helpKey="key-mappings" />
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={resetKeyMappings}
          disabled={!isConnected}
          title={t("interactiveKeyMapping.resetTitle")}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("interactiveKeyMapping.controllerBoard")}</CardTitle>
          <CardDescription>{t("interactiveKeyMapping.controllerBoardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative w-full max-w-[600px] mx-auto @container">
            {/* Manually managed SVG container */}
            <div ref={svgContainerRef} />
            {/* Glyphs printed on the SVG buttons; clicks pass through to them */}
            {Object.entries(labelPos).map(([id, { x, y, size }]) => {
              const value = getButtonValue(id);
              if (!value || (isListening && selectedButton === id)) return null;
              return (
                <span
                  key={id}
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-white font-semibold leading-none whitespace-nowrap"
                  style={{ left: `${x}%`, top: `${y}%`, fontSize: `${size * 0.5}cqw` }}
                >
                  <KeyGlyph code={value} className="size-[1.1em]" fit />
                </span>
              );
            })}
          </div>

          {/* Listening prompt takes the legend's place, so nothing below moves */}
          {/* Both share one grid cell: the row keeps the taller height either way */}
          <div className="mt-4 grid [&>*]:col-start-1 [&>*]:row-start-1">
          <p className={`self-center text-sm text-brand-ink text-center font-medium ${isListening && selectedButton ? "" : "invisible"}`}>
            {selectedButton && t("interactiveKeyMapping.listeningPrompt", { buttonLabel: selectedButton.replace(/--/g, " (").replace(/-/g, " ").replace(/ {2}/g, " ") })}
          </p>
          <div className={`flex flex-wrap gap-4 justify-center text-sm ${isListening && selectedButton ? "invisible" : ""}`}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-brand-fill" />
              <span>{t("interactiveKeyMapping.legendMappable")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-white border border-gray-300" />
              <span>{t("interactiveKeyMapping.legendReserved")}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" aria-hidden><rect width="16" height="16" rx="4" fill="var(--brand-fill)" className="key-listening" /></svg>
              <span>{t("interactiveKeyMapping.legendListening")}</span>
            </div>
          </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}