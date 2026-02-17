import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useWebSerial } from "@/hooks/useWebSerial";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";
import { useDeviceStreaming, type TriggerState, type StreamingMode } from "@/hooks/useDeviceStreaming";
import { useKeyboardInput } from "@/hooks/useKeyboardInput";
import { useFirmwareUpdate, type FirmwareInfo, type UpdateStatus } from "@/hooks/useFirmwareUpdate";
import { useGameIntegration, type GameIntegrationState } from "@/hooks/useGameIntegration";
import {
  DeviceCommand,
  type ConnectionStatus,
  type DeviceConfig,
  type PadName,
  type PadThresholds,
  type TimingConfig,
  type PadBuffers,
  type KeyMappings,
  type ADCChannels,
} from "@/types";

interface DeviceContextValue {
  // Connection
  status: ConnectionStatus;
  error: string | null;
  isSupported: boolean;
  isConnected: boolean;
  isReady: boolean;  // True after initial config read completes
  hasAuthorizedDevice: boolean;
  requestPort: () => Promise<SerialPort | null>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;

  // Configuration
  config: DeviceConfig;
  configLoading: boolean;
  configDirty: boolean;
  readFromDevice: () => Promise<boolean>;
  writeToDevice: () => Promise<boolean>;
  saveToFlash: () => Promise<boolean>;
  resetToDefaults: () => void;
  resetPadThresholds: () => void;
  resetTiming: () => void;
  resetKeyMappings: () => void;
  resetADCChannels: () => void;
  updatePadThreshold: (pad: PadName, field: keyof PadThresholds, value: number, commit?: boolean) => void;
  updateTiming: (field: keyof TimingConfig, value: number) => void;
  setDoubleInputMode: (enabled: boolean) => void;
  updateKeyMapping: (category: keyof KeyMappings, key: string, value: number) => void;
  updateADCChannel: (pad: keyof ADCChannels, channel: number) => void;
  exportConfig: () => void;
  importConfig: (file: File) => Promise<boolean>;
  rebootToBootsel: () => Promise<void>;
  uploadBootScreen: (data: Uint8Array) => Promise<boolean>;
  clearBootScreen: () => Promise<boolean>;

  // Streaming
  isStreaming: boolean;
  streamingMode: StreamingMode;
  triggers: TriggerState;
  buffers: RefObject<PadBuffers>;
  startStreaming: (mode?: StreamingMode) => Promise<void>;
  stopStreaming: () => Promise<void>;
  clearData: () => void;
  maxBufferSize: number;
  setMaxBufferSize: (size: number) => void;

  // Firmware Update
  firmwareUpdate: {
    status: UpdateStatus;
    latestFirmware: FirmwareInfo | null;
    error: string | null;
    progress: number;
    checkUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    modalOpen: boolean;
    setModalOpen: (open: boolean) => void;
  };

  // Game Integration
  gameIntegration: GameIntegrationState;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

interface DeviceProviderProps {
  children: ReactNode;
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const serial = useWebSerial();
  const [isReady, setIsReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isConnected = serial.status === "connected";

  const deviceConfig = useDeviceConfig({
    sendCommand: serial.sendCommand,
    readUntilTimeout: serial.readUntilTimeout,
    clearBuffer: serial.clearBuffer,
    isConnected,
  });

  const streaming = useDeviceStreaming({
    sendCommand: serial.sendCommand,
    startReading: serial.startReading,
    stopReading: serial.stopReading,
    isConnected,
  });

  const keyboardTriggers = useKeyboardInput(deviceConfig.config);

  const triggers = useMemo(() => ({
    kaLeft: streaming.triggers.kaLeft || keyboardTriggers.kaLeft,
    donLeft: streaming.triggers.donLeft || keyboardTriggers.donLeft,
    donRight: streaming.triggers.donRight || keyboardTriggers.donRight,
    kaRight: streaming.triggers.kaRight || keyboardTriggers.kaRight,
  }), [streaming.triggers, keyboardTriggers]);

  const firmwareUpdate = useFirmwareUpdate(deviceConfig.config.firmwareVersion);

  const gameIntegration = useGameIntegration({
    sendCommand: serial.sendCommand,
    isConnected,
  });

  // Track previous connection state to detect new connections
  const wasConnectedRef = useRef(false);

  // Auto-read config when device connects
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // New connection - read config first
      setIsReady(false);

      // Safety: Force stop streaming in case it was left running from a previous session
      // We don't await this because we want to start reading config ASAP, and the stop command
      // will be processed by the device before the read command in the serial queue.
      serial.sendCommand(DeviceCommand.STOP_STREAMING).catch(console.warn);
      
      deviceConfig.readFromDevice().then(() => {
        setIsReady(true);
      });
    } else if (!isConnected) {
      // Disconnected
      setIsReady(false);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, deviceConfig.readFromDevice]);

  const rebootToBootsel = async () => {
    if (isConnected) {
      try {
        await serial.sendCommand(DeviceCommand.REBOOT_TO_BOOTSEL);
        // Give the command a moment to be sent
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Force disconnect since the device is rebooting and will disappear
        await serial.disconnect();
      } catch (err) {
        console.error("Failed to reboot device:", err);
      }
    }
  };

  const uploadBootScreen = async (data: Uint8Array): Promise<boolean> => {
    if (!isConnected) return false;
    let previousMode: StreamingMode = 'none';
    try {
      // 0. Ensure streaming is stopped to prevent buffer pollution
      if (streaming.isStreaming) {
         previousMode = streaming.streamingMode;
         await streaming.stopStreaming();
         // Wait for streaming to actually stop and buffer to clear
         await new Promise(r => setTimeout(r, 200));
      }

      // 1. Start upload
      serial.clearBuffer();
      await serial.sendCommand(DeviceCommand.BOOT_SCREEN_START);
      
      // Give device a moment to enter upload mode
      await new Promise(r => setTimeout(r, 200));

      // 2. Send binary data in chunks of 64 bytes (USB CDC packet size)
      const CHUNK_SIZE = 64;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await serial.sendBinary(chunk);
        // Small delay between chunks to prevent buffer overflow on device
        await new Promise(r => setTimeout(r, 10));
      }
      
      // 3. Wait for save confirmation (Flash write takes time)
      const fullResponse = await serial.readUntilTimeout(5000); // Increased timeout to 5s
      const lines = fullResponse.split('\n');
      const savedSuccessfully = lines.some(line => line.includes("BITMAP_SAVED"));

      if (savedSuccessfully) {
        return true;
      }
      
      console.error("Bitmap save failed or timed out. Full response:", fullResponse);
      return false;

    } catch (e) {
      console.error("Error uploading boot screen:", e);
      return false;
    } finally {
        // Always restart streaming after the operation finishes
        if (previousMode !== 'none') {
            streaming.startStreaming(previousMode);
        }
    }
  };

  const clearBootScreen = async (): Promise<boolean> => {
    if (!isConnected) return false;
    try {
      serial.clearBuffer();
      await serial.sendCommand(DeviceCommand.BOOT_SCREEN_CLEAR);
      const response = await serial.readUntilTimeout(1000);
      return response.includes("BITMAP_CLEARED");
    } catch (e) {
      console.error("Error clearing boot screen:", e);
      return false;
    }
  };
  
  const handleInstallUpdate = async () => {
    await firmwareUpdate.installUpdate(rebootToBootsel);
    
    // Auto-reconnect logic
    console.log("Update process finished. Waiting for device reboot...");
    
    // Poll for the device for up to 20 seconds
    const pollInterval = 1000;
    const maxAttempts = 20;
    let attempts = 0;

    const pollForDevice = async () => {
      attempts++;
      console.log(`Searching for device (Attempt ${attempts}/${maxAttempts})...`);
      
      const port = await serial.findAuthorizedPort();
      if (port) {
        console.log("Device found! Connecting...");
        await serial.connect();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(pollForDevice, pollInterval);
      } else {
        console.log("Device not found after reboot.");
      }
    };

    // Start polling after a short delay to allow reboot to start
    setTimeout(pollForDevice, 2000);
  };

  const handleDisconnect = async () => {
    if (streaming.isStreaming) {
      await streaming.stopStreaming().catch(e => console.warn("Failed to stop streaming on disconnect", e));
    }
    await serial.disconnect();
  };

  const value = useMemo<DeviceContextValue>(
    () => ({
      // Connection
      status: serial.status,
      error: serial.error,
      isSupported: serial.isSupported,
      isConnected,
      isReady,
      hasAuthorizedDevice: serial.hasAuthorizedDevice,
      requestPort: serial.requestPort,
      connect: serial.connect,
      disconnect: handleDisconnect,

      // Configuration
      config: deviceConfig.config,
      configLoading: deviceConfig.isLoading,
      configDirty: deviceConfig.isDirty,
      readFromDevice: deviceConfig.readFromDevice,
      writeToDevice: deviceConfig.writeToDevice,
      saveToFlash: deviceConfig.saveToFlash,
      resetToDefaults: deviceConfig.resetToDefaults,
      resetPadThresholds: deviceConfig.resetPadThresholds,
      resetTiming: deviceConfig.resetTiming,
      resetKeyMappings: deviceConfig.resetKeyMappings,
      resetADCChannels: deviceConfig.resetADCChannels,
      updatePadThreshold: deviceConfig.updatePadThreshold,
      updateTiming: deviceConfig.updateTiming,
      setDoubleInputMode: deviceConfig.setDoubleInputMode,
      updateKeyMapping: deviceConfig.updateKeyMapping,
      updateADCChannel: deviceConfig.updateADCChannel,
      exportConfig: deviceConfig.exportConfig,
      importConfig: deviceConfig.importConfig,
      rebootToBootsel,
      uploadBootScreen,
      clearBootScreen,

      // Streaming
      isStreaming: streaming.isStreaming,
      streamingMode: streaming.streamingMode,
      triggers,
      buffers: streaming.buffers,
      startStreaming: streaming.startStreaming,
      stopStreaming: streaming.stopStreaming,
      clearData: streaming.clearData,
      maxBufferSize: streaming.maxBufferSize,
      setMaxBufferSize: streaming.setMaxBufferSize,

      // Firmware Update
      firmwareUpdate: {
        status: firmwareUpdate.status,
        latestFirmware: firmwareUpdate.latestFirmware,
        error: firmwareUpdate.error,
        progress: firmwareUpdate.progress,
        checkUpdate: firmwareUpdate.checkUpdate,
        installUpdate: handleInstallUpdate,
        modalOpen,
        setModalOpen,
      },

      // Game Integration
      gameIntegration,
    }),
    [serial, deviceConfig, streaming, isConnected, isReady, firmwareUpdate, modalOpen, gameIntegration]
  );

  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
