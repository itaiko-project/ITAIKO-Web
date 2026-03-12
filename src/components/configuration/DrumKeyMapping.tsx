import { useState, useEffect, useRef, useCallback } from "react";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HelpButton } from "@/components/ui/help-modal";
import { PAD_NAMES, PAD_LABELS, PAD_COLORS } from "@/types";
import type { PadName, KeyMappings } from "@/types";
import { hidToKeyName, browserKeyToHid } from "@/lib/hid-keycodes";
import { RotateCcw } from "lucide-react";

const PLAYERS: { key: "drumP1" | "drumP2"; label: string }[] = [
  { key: "drumP1", label: "Player 1" },
  { key: "drumP2", label: "Player 2" },
];

export function DrumKeyMapping() {
  const { config, updateKeyMapping, isConnected, resetKeyMappings } = useDevice();
  const keyMappings = config.keyMappings;
  const [selectedSlot, setSelectedSlot] = useState<{ player: keyof KeyMappings; pad: PadName } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
              Drum Key Bindings
              <HelpButton helpKey="drum-key-bindings" />
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetKeyMappings}
              disabled={!isConnected}
              title="Reset key mappings to defaults"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isListening && selectedSlot && (
            <div className="bg-blue-950/50 border border-blue-500/30 p-3 rounded-md mb-4">
              <p className="text-sm text-blue-300 text-center font-medium animate-pulse">
                Press any key to assign to {PAD_LABELS[selectedSlot.pad]}...
              </p>
            </div>
          )}

          <Tabs defaultValue="drumP1" onValueChange={handleTabChange}>
            <TabsList className="w-full">
              {PLAYERS.map((p) => (
                <TabsTrigger key={p.key} value={p.key}>
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {PLAYERS.map((player) => (
              <TabsContent key={player.key} value={player.key}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                  {PAD_NAMES.map((pad) => {
                    const value = keyMappings[player.key][pad];
                    const keyName = hidToKeyName(value);
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
                          ${isActive ? "ring-2 ring-blue-500 border-blue-500" : ""}
                        `}
                        style={{ borderLeftColor: PAD_COLORS[pad] }}
                      >
                        <span className="text-xs text-muted-foreground">{PAD_LABELS[pad]}</span>
                        <span className={`text-lg font-bold ${isActive ? "text-blue-400 animate-pulse" : ""}`}>
                          {isActive ? "..." : (keyName || "---")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
