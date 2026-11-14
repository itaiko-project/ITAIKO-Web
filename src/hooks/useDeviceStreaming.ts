import { useState, useCallback, useRef, useEffect } from "react";
import type { DeviceCommand, PadName, PadBuffer, PadBuffers } from "@/types";
import { DeviceCommand as DeviceCommandValues, PAD_NAMES } from "@/types";
import { parseRawStreamLine, parseInputStreamLine } from "@/lib/serial-protocol";

interface UseDeviceStreamingProps {
  sendCommand: (command: DeviceCommand, data?: string) => Promise<void>;
  startReading: (onData: (line: string) => void) => void;
  stopReading: () => void;
  isConnected: boolean;
  onHit: (pads: PadName[]) => void;
}

// Simple trigger state - just 4 booleans
export type TriggerState = Record<PadName, boolean>;

export type StreamingMode = 'none' | 'raw' | 'input' | 'both';

interface UseDeviceStreamingReturn {
  isStreaming: boolean;
  streamingMode: StreamingMode;
  triggers: TriggerState;  // Simple: just which pads are active

  // Zero-allocation buffer access for graphs
  buffers: React.RefObject<PadBuffers>;

  startStreaming: (mode?: StreamingMode) => Promise<void>;
  stopStreaming: () => Promise<void>;
  clearData: () => void;

  maxBufferSize: number;
  setMaxBufferSize: (size: number) => void;
}

function createPadBuffer(capacity: number): PadBuffer {
  return {
    raw: new Float32Array(capacity),
    delta: new Float32Array(capacity),
    head: 0,
    count: capacity,
    capacity,
  };
}

function createPadBuffers(capacity: number): PadBuffers {
  return {
    kaLeft: createPadBuffer(capacity),
    donLeft: createPadBuffer(capacity),
    donRight: createPadBuffer(capacity),
    kaRight: createPadBuffer(capacity),
  };
}

function resizePadBuffer(buffer: PadBuffer, newCapacity: number): PadBuffer {
  const newBuffer = createPadBuffer(newCapacity);
  const copyCount = Math.min(buffer.capacity, newCapacity);
  const startRead = buffer.head;

  for (let i = 0; i < copyCount; i++) {
    const readIdx = (startRead + buffer.capacity - copyCount + i) % buffer.capacity;
    newBuffer.raw[i] = buffer.raw[readIdx];
    newBuffer.delta[i] = buffer.delta[readIdx];
  }

  newBuffer.head = copyCount % newCapacity;
  newBuffer.count = newCapacity;
  return newBuffer;
}

const DEFAULT_BUFFER_SIZE = 5000;
const INITIAL_TRIGGERS: TriggerState = { kaLeft: false, donLeft: false, donRight: false, kaRight: false };

export function useDeviceStreaming({
  sendCommand,
  startReading,
  stopReading,
  isConnected,
  onHit,
}: UseDeviceStreamingProps): UseDeviceStreamingReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMode, setStreamingMode] = useState<StreamingMode>('none');
  const [triggers, setTriggers] = useState<TriggerState>(INITIAL_TRIGGERS);
  const [maxBufferSize, setMaxBufferSizeState] = useState(DEFAULT_BUFFER_SIZE);

  const buffersRef = useRef<PadBuffers>(createPadBuffers(DEFAULT_BUFFER_SIZE));
  const previousRawRef = useRef<Record<PadName, number>>({ kaLeft: 0, donLeft: 0, donRight: 0, kaRight: 0 });

  const previousInputsRef = useRef<TriggerState>(INITIAL_TRIGGERS);

  // Accumulate triggers between UI frames
  const accumulatedTriggersRef = useRef<TriggerState>({ kaLeft: false, donLeft: false, donRight: false, kaRight: false });

  // Throttling
  const lastFrameUpdateRef = useRef(0);
  const FRAME_THROTTLE_MS = 8; // ~120fps for smoother visuals

  const setMaxBufferSize = useCallback((size: number) => {
    setMaxBufferSizeState(size);
    PAD_NAMES.forEach((pad) => {
      buffersRef.current[pad] = resizePadBuffer(buffersRef.current[pad], size);
    });
  }, []);

  const handleStreamData = useCallback((line: string) => {
    let inputs: Record<PadName, boolean> | null = null;
    let raws: Record<PadName, number> | null = null;

    // 1. Try Input Hex (1-2 chars)
    if (line.length <= 2) {
       inputs = parseInputStreamLine(line);
    }
    // 2. Try Raw Hex (16 chars)
    else if (line.length === 16) {
       raws = parseRawStreamLine(line);
    }

    const now = performance.now();
    const buffers = buffersRef.current;
    const accumulated = accumulatedTriggersRef.current;

    // Process Inputs
    if (inputs) {
        const hits = PAD_NAMES.filter(pad => inputs[pad] && !previousInputsRef.current[pad]);
        previousInputsRef.current = inputs;
        if (hits.length > 0) onHit(hits);
        PAD_NAMES.forEach(pad => {
            if (inputs![pad]) accumulated[pad] = true;
        });
    }

    // Process Raws
    if (raws) {
        PAD_NAMES.forEach(pad => {
            const buffer = buffers[pad];
            const rawVal = raws![pad];
            const previousRaw = previousRawRef.current[pad];
            const delta = Math.max(0, rawVal - previousRaw);

            buffer.raw[buffer.head] = rawVal;
            buffer.delta[buffer.head] = delta;
            buffer.head = (buffer.head + 1) % buffer.capacity;

            previousRawRef.current[pad] = rawVal;
        });
    }

    // Throttled UI update - only update if triggers changed
    if (now - lastFrameUpdateRef.current >= FRAME_THROTTLE_MS) {
      lastFrameUpdateRef.current = now;

      // Only call setTriggers if something actually triggered
      const { kaLeft, donLeft, donRight, kaRight } = accumulated;

      setTriggers(prev => {
        // Skip update if nothing changed
        if (prev.kaLeft === kaLeft && prev.donLeft === donLeft &&
            prev.donRight === donRight && prev.kaRight === kaRight) {
          return prev;
        }
        return { kaLeft, donLeft, donRight, kaRight };
      });

      // Reset accumulators
      accumulated.kaLeft = false;
      accumulated.donLeft = false;
      accumulated.donRight = false;
      accumulated.kaRight = false;
    }
  }, [onHit]);

  const startStreamingFn = useCallback(async (mode: StreamingMode = 'raw'): Promise<void> => {
    if (!isConnected || streamingMode === mode) return;
    try {
      // Stop current if any
      if (isStreaming) {
          stopReading();
          await sendCommand(DeviceCommandValues.STOP_STREAMING);
          await new Promise(r => setTimeout(r, 50));
      }

      if (mode === 'raw' || mode === 'both') await sendCommand(DeviceCommandValues.START_STREAMING);
      if (mode === 'input' || mode === 'both') await sendCommand(DeviceCommandValues.START_INPUT_STREAMING);
      
      previousInputsRef.current = INITIAL_TRIGGERS;
      setStreamingMode(mode);
      setIsStreaming(true);
      startReading(handleStreamData);
    } catch (err) {
      console.error("Failed to start streaming:", err);
    }
  }, [isConnected, isStreaming, streamingMode, sendCommand, startReading, handleStreamData]);

  const stopStreamingFn = useCallback(async (): Promise<void> => {
    if (!isStreaming) return;
    try {
      stopReading();
      await sendCommand(DeviceCommandValues.STOP_STREAMING);
    } catch (err) {
      console.error("Failed to stop streaming:", err);
    } finally {
      setIsStreaming(false);
      setStreamingMode('none');
    }
  }, [isStreaming, sendCommand, stopReading]);

  const clearData = useCallback((): void => {
    PAD_NAMES.forEach((pad) => {
      const buffer = buffersRef.current[pad];
      buffer.head = 0;
      buffer.count = buffer.capacity;
      buffer.raw.fill(0);
      buffer.delta.fill(0);
      accumulatedTriggersRef.current[pad] = false;
    });
    previousInputsRef.current = INITIAL_TRIGGERS;
    setTriggers(INITIAL_TRIGGERS);
    previousRawRef.current = { kaLeft: 0, donLeft: 0, donRight: 0, kaRight: 0 };
    lastFrameUpdateRef.current = 0;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isStreaming) {
        // Best-effort attempt to stop streaming before tab closes
        sendCommand(DeviceCommandValues.STOP_STREAMING).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    if (!isConnected && isStreaming) {
      setIsStreaming(false);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isConnected, isStreaming, sendCommand]);

  return {
    isStreaming,
    streamingMode,
    triggers,
    buffers: buffersRef,
    startStreaming: startStreamingFn,
    stopStreaming: stopStreamingFn,
    clearData,
    maxBufferSize,
    setMaxBufferSize,
  };
}
