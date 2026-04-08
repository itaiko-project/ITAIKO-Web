import { useRef } from "react";
import type { DeviceCommand } from "@/types";

/**
 * Mock serial interface for demo mode (?demo=true).
 * Provides the same shape as useWebSerial but with no-op functions
 * and a permanently "connected" status.
 */
export function useDemoSerial() {
  const port = useRef<SerialPort | null>(null);

  return {
    status: "connected" as const,
    error: null,
    isSupported: true,
    port,
    hasAuthorizedDevice: true,
    requestPort: async () => null,
    findAuthorizedPort: async () => null,
    connect: async () => true,
    disconnect: async () => {},
    sendCommand: async (_command: DeviceCommand, _data?: string) => {},
    sendBinary: async (_data: Uint8Array) => {},
    readLine: async () => null,
    readUntilTimeout: async (_timeoutMs?: number) => "",
    clearBuffer: () => {},
    startReading: (_onData: (line: string) => void) => {},
    stopReading: () => {},
    isReading: false,
  };
}
