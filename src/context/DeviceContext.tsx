import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useWebSerial } from "@/hooks/useWebSerial";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";
import { useDeviceStreaming, type TriggerState, type StreamingMode } from "@/hooks/useDeviceStreaming";
import { useKeyboardInput } from "@/hooks/useKeyboardInput";
import { useFirmwareUpdate, type FirmwareInfo, type UpdateStatus } from "@/hooks/useFirmwareUpdate";
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
  type PS4AuthBackupData,
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
  exportConfig: () => Promise<void>;
  importConfig: (file: File) => Promise<boolean>;
  uploadPs4Auth: (authData: PS4AuthBackupData) => Promise<boolean>;
  clearPs4Auth: () => Promise<boolean>;
  readPs4AuthStatus: () => Promise<boolean>;
  rebootToBootsel: () => Promise<void>;

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
    sendBinary: serial.sendBinary,
    readUntilTimeout: serial.readUntilTimeout,
    clearBuffer: serial.clearBuffer,
    disconnect: serial.disconnect,
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
      uploadPs4Auth: deviceConfig.uploadPs4Auth,
      clearPs4Auth: deviceConfig.clearPs4Auth,
      readPs4AuthStatus: deviceConfig.readPs4AuthStatus,
      rebootToBootsel,

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
    }),
    [serial, deviceConfig, streaming, isConnected, isReady, firmwareUpdate, modalOpen]
  );

  return (
    <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
