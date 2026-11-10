import { useState, useEffect, useMemo } from "react";
import type { DeviceConfig } from "@/types";
import type { TriggerState } from "@/hooks/useDeviceStreaming";
import { browserKeyToHid } from "@/lib/hid-keycodes";

const INITIAL_TRIGGERS: TriggerState = { kaLeft: false, donLeft: false, donRight: false, kaRight: false };
// A quick tap can go down and up between two repaints and never light anything. Hold every press at least this long.
const MIN_PRESS_MS = 80;

export function useKeyboardInput(config: DeviceConfig) {
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  useEffect(() => {
    const pressedAt = new Map<number, number>();
    const pendingRelease = new Map<number, number>();
    const release = (hid: number) => {
      pendingRelease.delete(hid);
      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(hid);
        return next;
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const hid = browserKeyToHid(event);
      if (hid !== null) {
        window.clearTimeout(pendingRelease.get(hid)); // pressed again before a short tap's release fired
        pendingRelease.delete(hid);
        pressedAt.set(hid, performance.now());
        setActiveKeys(prev => {
          const next = new Set(prev);
          next.add(hid);
          return next;
        });
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const hid = browserKeyToHid(event);
      if (hid === null) return;
      const remaining = MIN_PRESS_MS - (performance.now() - (pressedAt.get(hid) ?? 0));
      if (remaining > 0) pendingRelease.set(hid, window.setTimeout(() => release(hid), remaining));
      else release(hid);
    };

    // We listen on window to catch all inputs
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      pendingRelease.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const triggers = useMemo<TriggerState>(() => {
    // If no config or key mappings, return empty triggers
    if (!config.keyMappings) return INITIAL_TRIGGERS;

    const km = config.keyMappings;
    const isPressed = (hid: number) => activeKeys.has(hid);
    
    return {
      kaLeft: isPressed(km.drumP1.kaLeft) || isPressed(km.drumP2.kaLeft),
      donLeft: isPressed(km.drumP1.donLeft) || isPressed(km.drumP2.donLeft),
      donRight: isPressed(km.drumP1.donRight) || isPressed(km.drumP2.donRight),
      kaRight: isPressed(km.drumP1.kaRight) || isPressed(km.drumP2.kaRight),
    };
  }, [activeKeys, config]);

  return triggers;
}
