import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HelpButton } from "@/components/ui/help-modal";
import { PAD_NAMES, PAD_COLORS } from "@/types";
import { usePadLabels } from "@/i18n/pad-labels";
import type { PadName, KeyMappings } from "@/types";
import { browserKeyToHid } from "@/lib/hid-keycodes";
import { RotateCcw } from "lucide-react";
import { KeyGlyph } from "./KeyGlyph";


export function DrumKeyMapping() {
  const { t } = useTranslation("config");
  const padLabels = usePadLabels();
  const { config, updateKeyMapping, isConnected, resetKeyMappings } = useDevice();
  const keyMappings = config.keyMappings;
  const [selectedSlot, setSelectedSlot] = useState<{ player: keyof KeyMappings; pad: PadName } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const players: { key: "drumP1" | "drumP2"; label: string }[] = [
    { key: "drumP1", label: t("drumKeyMapping.player1") },
    { key: "drumP2", label: t("drumKeyMapping.player2") },
  ];

  const cancelListening = useCallback(() => {
    setIsListening(false);
    setSelectedSlot(null);
  }, []);

  // Cancel listening when switching tabs
  const handleTabChange = useCallback(() => {
    cancelListening();
  }, [cancelListening]);

  const handleSlotClick = useCallback((player: "drumP1" | "drumP2", pad: PadName) => {
    if (!isConnected) return;
    setSelectedSlot({ player, pad });
    setIsListening(true);
  }, [isConnected]);

  // Handle key press when listening
  useEffect(() => {
    if (!isListening || !selectedSlot) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const hidCode = browserKeyToHid(e);
      if (hidCode !== null) {
        updateKeyMapping(selectedSlot.player, selectedSlot.pad, hidCode);
        setIsListening(false);
        setSelectedSlot(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isListening, selectedSlot, updateKeyMapping, cancelListening]);

  if (!keyMappings) return null;

  return (
    <div ref={containerRef}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {t("drumKeyMapping.title")}
              <HelpButton helpKey="drum-key-bindings" />
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetKeyMappings}
              disabled={!isConnected}
              title={t("drumKeyMapping.resetTitle")}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="drumP1" onValueChange={handleTabChange}>
            <TabsList className="w-full">
              {players.map((p) => (
                <TabsTrigger key={p.key} value={p.key}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {players.map((player) => (
              <TabsContent key={player.key} value={player.key}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                  {PAD_NAMES.map((pad) => {
                    const value = keyMappings[player.key][pad];
                    const isActive = isListening && selectedSlot?.player === player.key && selectedSlot?.pad === pad;

                    return (
                      <button
                        key={pad}
                        onClick={() => handleSlotClick(player.key, pad)}
                        disabled={!isConnected}
                        className={`
                          relative flex flex-col items-center justify-center gap-1 p-4 rounded-lg
                          border-l-4 border border-border bg-card
                          transition-all duration-150
                          hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed
                          ${isActive ? "ring-2 ring-brand border-brand" : ""}
                        `}
                        style={{ borderLeftColor: PAD_COLORS[pad] }}
                      >
                        <span className="text-xs text-muted-foreground">{padLabels[pad]}</span>
                        <span className={`flex items-center justify-center h-9 min-w-9 px-2 rounded-lg border border-b-4 bg-background text-base font-semibold ${isActive ? "text-brand-ink border-brand animate-pulse" : ""}`}>
                          {isActive ? "…" : value ? <KeyGlyph code={value} className="size-5" /> : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
          {/* Fixed-height line so the prompt appearing doesn't shift the page */}
          <p className="mt-3 h-5 text-sm text-brand-ink text-center font-medium">
            {isListening && selectedSlot && t("drumKeyMapping.listeningPrompt", { padLabel: padLabels[selectedSlot.pad] })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
