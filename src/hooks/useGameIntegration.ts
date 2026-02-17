import { useState, useRef, useCallback, useEffect } from "react";
import { DeviceCommand, type DeviceCommand as DeviceCommandType } from "@/types";

export type Judgment = "great" | "ok" | "miss";
export type MapState = "playing" | "idle";

interface HitCounts {
  great: number;
  ok: number;
  miss: number;
}

interface TosuMessage {
  state?: {
    number?: number;
    name?: string;
  };
  play?: {
    hits?: {
      "300"?: number;
      "100"?: number;
      "0"?: number;
      geki?: number;
      katu?: number;
    };
  };
}

interface UseGameIntegrationProps {
  sendCommand: (cmd: DeviceCommandType, data?: string) => Promise<void>;
  isConnected: boolean;
}

export interface TosuDebugInfo {
  messageCount: number;
  lastStateName: string;
  lastStateNumber: number;
  lastHits: {
    raw300: number;
    raw100: number;
    raw0: number;
    geki: number;
    katu: number;
    computedGreat: number;
    computedOk: number;
    computedMiss: number;
  } | null;
}

export interface GameIntegrationState {
  isWsConnected: boolean;
  isTosuModeActive: boolean;
  isAutoMode: boolean;
  lastJudgment: Judgment | null;
  mapState: MapState;
  debug: TosuDebugInfo;
  connect: () => void;
  disconnect: () => void;
  setAutoMode: (enabled: boolean) => void;
  enterTosuMode: () => Promise<void>;
  exitTosuMode: () => Promise<void>;
  sendJudgment: (type: Judgment) => Promise<void>;
}

const TOSU_WS_URL = "ws://localhost:24050/websocket/v2";
const RECONNECT_DELAY_MS = 3000;

export function useGameIntegration({
  sendCommand,
  isConnected,
}: UseGameIntegrationProps): GameIntegrationState {
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isTosuModeActive, setIsTosuModeActive] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [lastJudgment, setLastJudgment] = useState<Judgment | null>(null);
  const [mapState, setMapState] = useState<MapState>("idle");
  const [debug, setDebug] = useState<TosuDebugInfo>({
    messageCount: 0,
    lastStateName: "",
    lastStateNumber: 0,
    lastHits: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether disconnect() was called explicitly (suppresses auto-reconnect)
  const explicitDisconnectRef = useRef(false);
  // Track previous hit counts to detect new judgments
  const prevHitsRef = useRef<HitCounts>({ great: 0, ok: 0, miss: 0 });
  // Track previous map state to detect transitions
  const prevMapStateRef = useRef<MapState>("idle");
  // Refs for callbacks that need latest state without re-creating the WS handler
  const isConnectedRef = useRef(isConnected);
  const isAutoModeRef = useRef(isAutoMode);
  const isTosuModeActiveRef = useRef(isTosuModeActive);
  // Debug: accumulate in a ref, flush to state at most every 250ms to avoid
  // flooding the React render pipeline (tosu sends at 30-60Hz)
  const debugRef = useRef<TosuDebugInfo>({
    messageCount: 0,
    lastStateName: "",
    lastStateNumber: 0,
    lastHits: null,
  });
  const lastDebugFlushRef = useRef(0);

  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { isAutoModeRef.current = isAutoMode; }, [isAutoMode]);
  useEffect(() => { isTosuModeActiveRef.current = isTosuModeActive; }, [isTosuModeActive]);

  const enterTosuMode = useCallback(async () => {
    if (!isConnectedRef.current || isTosuModeActiveRef.current) return;
    try {
      await sendCommand(DeviceCommand.TOSU_MODE_ON);
      setIsTosuModeActive(true);
    } catch (err) {
      console.error("[tosu] Failed to enter tosu mode:", err);
    }
  }, [sendCommand]);

  const exitTosuMode = useCallback(async () => {
    if (!isConnectedRef.current || !isTosuModeActiveRef.current) return;
    try {
      await sendCommand(DeviceCommand.TOSU_MODE_OFF);
      setIsTosuModeActive(false);
    } catch (err) {
      console.error("[tosu] Failed to exit tosu mode:", err);
    }
  }, [sendCommand]);

  const sendJudgment = useCallback(async (type: Judgment) => {
    if (!isConnectedRef.current) return;
    const cmd =
      type === "great"
        ? DeviceCommand.TOSU_GREAT
        : type === "ok"
          ? DeviceCommand.TOSU_OK
          : DeviceCommand.TOSU_MISS;
    try {
      await sendCommand(cmd);
      setLastJudgment(type);
    } catch (err) {
      console.error("[tosu] Failed to send judgment:", err);
    }
  }, [sendCommand]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let data: TosuMessage;
      try {
        data = JSON.parse(event.data as string) as TosuMessage;
      } catch {
        return;
      }

      // --- Map state detection ---
      const stateName = data.state?.name ?? "";
      const stateNumber = data.state?.number ?? 0;
      const isPlaying = stateName !== "Menu" && stateNumber !== 0;
      const currentMapState: MapState = isPlaying ? "playing" : "idle";

      // --- Debug: parse hit counts for display even before playing check ---
      const hitsRaw = data.play?.hits;
      const raw300 = hitsRaw?.["300"] ?? 0;
      const raw100 = hitsRaw?.["100"] ?? 0;
      const raw0 = hitsRaw?.["0"] ?? 0;
      const rawGeki = hitsRaw?.geki ?? 0;
      const rawKatu = hitsRaw?.katu ?? 0;

      // Accumulate into ref (no render), flush to state at most every 250ms
      debugRef.current = {
        messageCount: debugRef.current.messageCount + 1,
        lastStateName: stateName,
        lastStateNumber: stateNumber,
        lastHits: hitsRaw
          ? {
              raw300,
              raw100,
              raw0,
              geki: rawGeki,
              katu: rawKatu,
              computedGreat: raw300 + rawGeki,
              computedOk: raw100 + rawKatu,
              computedMiss: raw0,
            }
          : debugRef.current.lastHits,
      };
      const nowMs = Date.now();
      if (nowMs - lastDebugFlushRef.current >= 250) {
        lastDebugFlushRef.current = nowMs;
        setDebug({ ...debugRef.current });
      }

      if (currentMapState !== prevMapStateRef.current) {
        prevMapStateRef.current = currentMapState;
        setMapState(currentMapState);

        if (isPlaying) {
          // New map started: reset hit counters
          prevHitsRef.current = { great: 0, ok: 0, miss: 0 };
          setLastJudgment(null);
          if (isAutoModeRef.current) {
            enterTosuMode();
          }
        } else {
          // Map ended
          if (isAutoModeRef.current && isTosuModeActiveRef.current) {
            exitTosuMode();
          }
        }
      }

      // --- Judgment detection (only while playing) ---
      if (!isPlaying || !hitsRaw) return;

      const greatCount = raw300 + rawGeki;
      const okCount = raw100 + rawKatu;
      const missCount = raw0;

      const prev = prevHitsRef.current;
      const greatDelta = greatCount - prev.great;
      const okDelta = okCount - prev.ok;
      const missDelta = missCount - prev.miss;

      prevHitsRef.current = { great: greatCount, ok: okCount, miss: missCount };

      // Determine the most recent judgment (highest-value wins ties)
      if (greatDelta > 0 || okDelta > 0 || missDelta > 0) {
        let judgment: Judgment;
        if (greatDelta >= okDelta && greatDelta >= missDelta) {
          judgment = "great";
        } else if (okDelta >= missDelta) {
          judgment = "ok";
        } else {
          judgment = "miss";
        }
        sendJudgment(judgment);
      }
    },
    [enterTosuMode, exitTosuMode, sendJudgment],
  );

  const openWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(TOSU_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsWsConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setIsWsConnected(false);
      wsRef.current = null;
      // Auto-reconnect unless explicitly disconnected
      if (!explicitDisconnectRef.current) {
        reconnectTimerRef.current = setTimeout(openWebSocket, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror, so reconnect is handled there
      ws.close();
    };
  }, [handleMessage]);

  const connect = useCallback(() => {
    explicitDisconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    openWebSocket();
  }, [openWebSocket]);

  const disconnect = useCallback(() => {
    explicitDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsWsConnected(false);
    setMapState("idle");
    prevMapStateRef.current = "idle";
    // Exit tosu mode on the drum if active
    if (isTosuModeActiveRef.current) {
      exitTosuMode();
    }
  }, [exitTosuMode]);

  // Exit tosu mode if serial disconnects while active
  useEffect(() => {
    if (!isConnected && isTosuModeActive) {
      setIsTosuModeActive(false);
    }
  }, [isConnected, isTosuModeActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      explicitDisconnectRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return {
    isWsConnected,
    isTosuModeActive,
    isAutoMode,
    lastJudgment,
    mapState,
    debug,
    connect,
    disconnect,
    setAutoMode: setIsAutoMode,
    enterTosuMode,
    exitTosuMode,
    sendJudgment,
  };
}
