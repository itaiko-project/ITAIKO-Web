import { useState, useCallback, useEffect } from "react";
import type {
  DeviceConfig,
  PadName,
  PadThresholds,
  TimingConfig,
  DeviceCommand,
  KeyMappings,
  ADCChannels,
  PS4AuthBackupData,
} from "@/types";
import { DeviceCommand as DeviceCommandValues } from "@/types";
import {
  parseSettingsResponse,
  settingsToConfig,
  configToSettingsString,
} from "@/lib/serial-protocol";
import {
  buildPs4AuthUploadBundle,
  fromBackupData,
  parsePs4AuthExportResponse,
} from "@/lib/ps4-auth-generator";
import { DEFAULT_DEVICE_CONFIG } from "@/lib/default-config";

interface UseDeviceConfigProps {
  sendCommand: (command: DeviceCommand, data?: string) => Promise<void>;
  sendBinary?: (data: Uint8Array) => Promise<void>;
  readUntilTimeout: (timeoutMs?: number) => Promise<string>;
  clearBuffer?: () => void;
  disconnect?: () => Promise<void>;
  isConnected: boolean;
}

interface ConfigBackupPayload {
  pads: DeviceConfig["pads"];
  doubleInputMode: boolean;
  timing: DeviceConfig["timing"];
  keyMappings?: DeviceConfig["keyMappings"];
  adcChannels?: DeviceConfig["adcChannels"];
  ps4Auth?: PS4AuthBackupData;
}

interface UseDeviceConfigReturn {
  config: DeviceConfig;
  isLoading: boolean;
  isDirty: boolean;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Actions
  readFromDevice: () => Promise<boolean>;
  writeToDevice: () => Promise<boolean>;
  saveToFlash: () => Promise<boolean>;
  resetToDefaults: () => void;

  // Section-specific resets
  resetPadThresholds: () => void;
  resetTiming: () => void;
  resetKeyMappings: () => void;
  resetADCChannels: () => void;

  // Import/Export
  exportConfig: () => Promise<void>;
  importConfig: (file: File) => Promise<boolean>;

  // PS4 Auth
  uploadPs4Auth: (authData: PS4AuthBackupData) => Promise<boolean>;
  clearPs4Auth: () => Promise<boolean>;
  readPs4AuthStatus: () => Promise<boolean>;

  // Update helpers
  updatePadThreshold: (
    pad: PadName,
    field: keyof PadThresholds,
    value: number,
    commit?: boolean
  ) => void;
  updateTiming: (field: keyof TimingConfig, value: number, commit?: boolean) => void;
  setDoubleInputMode: (enabled: boolean, commit?: boolean) => void;
  updateKeyMapping: (
    category: keyof KeyMappings,
    key: string,
    value: number,
    commit?: boolean
  ) => void;
  updateADCChannel: (
    pad: keyof ADCChannels,
    channel: number,
    commit?: boolean
  ) => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useDeviceConfig({
  sendCommand,
  sendBinary,
  readUntilTimeout,
  clearBuffer,
  disconnect,
  isConnected,
}: UseDeviceConfigProps): UseDeviceConfigReturn {
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_DEVICE_CONFIG);
  const [savedConfig, setSavedConfig] = useState<DeviceConfig>(DEFAULT_DEVICE_CONFIG);
  const [isLoading, setIsLoading] = useState(false);

  // History State
  const [history, setHistory] = useState<DeviceConfig[]>([]);
  const [future, setFuture] = useState<DeviceConfig[]>([]);
  const [lastCommittedConfig, setLastCommittedConfig] = useState<DeviceConfig>(DEFAULT_DEVICE_CONFIG);

  const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    setFuture((prev) => [config, ...prev]);
    setHistory(newHistory);
    setConfig(previous);
    setLastCommittedConfig(previous);
  }, [history, config]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);

    setHistory((prev) => [...prev, config]);
    setFuture(newFuture);
    setConfig(next);
    setLastCommittedConfig(next);
  }, [future, config]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key === "y") {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleCommit = (newConfig: DeviceConfig) => {
    setHistory((h) => {
      const newHistory = [...h, lastCommittedConfig];
      return newHistory.length > 50 ? newHistory.slice(newHistory.length - 50) : newHistory;
    });
    setFuture([]);
    setLastCommittedConfig(newConfig);
  };

  const readFromDevice = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;

    setIsLoading(true);
    try {
      clearBuffer?.();
      await sendCommand(DeviceCommandValues.READ_SETTINGS);
      const response = await readUntilTimeout(1000);
      const { settings, version } = parseSettingsResponse(response);

      if (settings.size > 0) {
        const newConfig = settingsToConfig(settings, version);
        setConfig(newConfig);
        setSavedConfig(newConfig);
        setLastCommittedConfig(newConfig);
        setHistory([]);
        setFuture([]);
        return true;
      }

      return false;
    } catch (err) {
      console.error("Failed to read config:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, sendCommand, readUntilTimeout, clearBuffer]);

  const writeToDevice = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;

    setIsLoading(true);
    try {
      const settingsString = configToSettingsString(config);
      clearBuffer?.();
      await sendCommand(DeviceCommandValues.WRITE_MODE, settingsString);
      setSavedConfig(config);
      return true;
    } catch (err) {
      console.error("Failed to write config:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, sendCommand, config, clearBuffer]);

  const saveToFlash = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;

    setIsLoading(true);
    try {
      const writeSuccess = await writeToDevice();
      if (!writeSuccess) return false;

      await sendCommand(DeviceCommandValues.SAVE_TO_FLASH);
      return true;
    } catch (err) {
      console.error("Failed to save to flash:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, sendCommand, writeToDevice]);

  const readPs4AuthStatus = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;

    try {
      clearBuffer?.();
      await sendCommand(DeviceCommandValues.PS4_AUTH_STATUS);
      const response = await readUntilTimeout(800);
      return response.includes("PS4_AUTH_STATUS:1");
    } catch (err) {
      console.error("Failed to read PS4 auth status:", err);
      return false;
    }
  }, [isConnected, sendCommand, readUntilTimeout, clearBuffer]);

  const uploadPs4Auth = useCallback(async (authData: PS4AuthBackupData): Promise<boolean> => {
    if (!isConnected || !sendBinary) return false;

    try {
      const generated = fromBackupData(authData);
      const bundle = buildPs4AuthUploadBundle(generated);

      clearBuffer?.();
      await sendCommand(DeviceCommandValues.PS4_AUTH_UPLOAD_START);
      await delay(120);

      const chunkSize = 64;
      for (let i = 0; i < bundle.length; i += chunkSize) {
        await sendBinary(bundle.slice(i, i + chunkSize));
        await delay(4);
      }

      const response = await readUntilTimeout(6000);
      return response.includes("PS4_AUTH_SAVED");
    } catch (err) {
      console.error("Failed to upload PS4 auth:", err);
      return false;
    }
  }, [isConnected, sendBinary, clearBuffer, sendCommand, readUntilTimeout]);

  const clearPs4Auth = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;

    try {
      clearBuffer?.();
      await sendCommand(DeviceCommandValues.PS4_AUTH_CLEAR);
      const response = await readUntilTimeout(1200);
      return response.includes("PS4_AUTH_CLEARED");
    } catch (err) {
      console.error("Failed to clear PS4 auth:", err);
      return false;
    }
  }, [isConnected, clearBuffer, sendCommand, readUntilTimeout]);

  const resetToDefaults = useCallback((): void => {
    setConfig(() => {
      const next = DEFAULT_DEVICE_CONFIG;
      handleCommit(next);
      return next;
    });
  }, [lastCommittedConfig]);

  const resetPadThresholds = useCallback((): void => {
    setConfig((prev) => {
      const next = {
        ...prev,
        pads: DEFAULT_DEVICE_CONFIG.pads,
      };
      handleCommit(next);
      return next;
    });
  }, [lastCommittedConfig]);

  const resetTiming = useCallback((): void => {
    setConfig((prev) => {
      const next = {
        ...prev,
        timing: DEFAULT_DEVICE_CONFIG.timing,
      };
      handleCommit(next);
      return next;
    });
  }, [lastCommittedConfig]);

  const resetKeyMappings = useCallback((): void => {
    setConfig((prev) => {
      const next = {
        ...prev,
        keyMappings: DEFAULT_DEVICE_CONFIG.keyMappings,
      };
      handleCommit(next);
      return next;
    });
  }, [lastCommittedConfig]);

  const resetADCChannels = useCallback((): void => {
    setConfig((prev) => {
      const next = {
        ...prev,
        adcChannels: DEFAULT_DEVICE_CONFIG.adcChannels,
      };
      handleCommit(next);
      return next;
    });
  }, [lastCommittedConfig]);

  const exportConfig = useCallback(async (): Promise<void> => {
    const exportData: ConfigBackupPayload = {
      pads: config.pads,
      doubleInputMode: config.doubleInputMode,
      timing: config.timing,
      keyMappings: config.keyMappings,
      adcChannels: config.adcChannels,
    };

    if (isConnected) {
      try {
        clearBuffer?.();
        await sendCommand(DeviceCommandValues.PS4_AUTH_EXPORT);
        const authResponse = await readUntilTimeout(3000);
        const ps4Auth = parsePs4AuthExportResponse(authResponse);
        if (ps4Auth) {
          exportData.ps4Auth = ps4Auth;
        }
      } catch (err) {
        console.warn("Failed to include PS4 auth in export:", err);
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `itaiko-config-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [config, isConnected, clearBuffer, sendCommand, readUntilTimeout]);

  const importConfig = useCallback(async (file: File): Promise<boolean> => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as Partial<ConfigBackupPayload>;

      if (!imported.pads || !imported.timing) {
        console.error("Invalid config file: missing required fields");
        return false;
      }

      const nextConfig: DeviceConfig = {
        ...config,
        pads: imported.pads ?? config.pads,
        doubleInputMode: imported.doubleInputMode ?? config.doubleInputMode,
        timing: imported.timing ?? config.timing,
        keyMappings: imported.keyMappings ?? config.keyMappings,
        adcChannels: imported.adcChannels ?? config.adcChannels,
      };

      // Persist regular settings immediately when connected.
      if (isConnected) {
        const settingsString = configToSettingsString(nextConfig);
        clearBuffer?.();
        await sendCommand(DeviceCommandValues.WRITE_MODE, settingsString);
        await sendCommand(DeviceCommandValues.SAVE_TO_FLASH);
      }

      let authOk = true;
      if (imported.ps4Auth && isConnected) {
        authOk = await uploadPs4Auth(imported.ps4Auth);
        if (authOk) {
          await disconnect?.();
        }
      }

      setConfig(nextConfig);
      setSavedConfig(nextConfig);
      setLastCommittedConfig(nextConfig);
      setHistory([]);
      setFuture([]);

      return authOk;
    } catch (err) {
      console.error("Failed to import config:", err);
      return false;
    }
  }, [config, isConnected, clearBuffer, sendCommand, uploadPs4Auth]);

  const updatePadThreshold = useCallback(
    (pad: PadName, field: keyof PadThresholds, value: number, commit = true): void => {
      setConfig((prev) => {
        const next = {
          ...prev,
          pads: {
            ...prev.pads,
            [pad]: {
              ...prev.pads[pad],
              [field]: value,
            },
          },
        };
        if (commit) {
          handleCommit(next);
        }
        return next;
      });
    },
    [lastCommittedConfig]
  );

  const updateTiming = useCallback(
    (field: keyof TimingConfig, value: number, commit = true): void => {
      setConfig((prev) => {
        const next = {
          ...prev,
          timing: {
            ...prev.timing,
            [field]: value,
          },
        };
        if (commit) {
          handleCommit(next);
        }
        return next;
      });
    },
    [lastCommittedConfig]
  );

  const setDoubleInputMode = useCallback((enabled: boolean, commit = true): void => {
    setConfig((prev) => {
      const next = {
        ...prev,
        doubleInputMode: enabled,
      };
      if (commit) {
        handleCommit(next);
      }
      return next;
    });
  }, [lastCommittedConfig]);

  const updateKeyMapping = useCallback(
    (category: keyof KeyMappings, key: string, value: number, commit = true): void => {
      setConfig((prev) => {
        if (!prev.keyMappings) return prev;

        const next = {
          ...prev,
          keyMappings: {
            ...prev.keyMappings,
            [category]: {
              ...prev.keyMappings[category],
              [key]: value,
            },
          },
        };
        if (commit) {
          handleCommit(next);
        }
        return next;
      });
    },
    [lastCommittedConfig]
  );

  const updateADCChannel = useCallback(
    (pad: keyof ADCChannels, channel: number, commit = true): void => {
      setConfig((prev) => {
        if (!prev.adcChannels) return prev;

        const next = {
          ...prev,
          adcChannels: {
            ...prev.adcChannels,
            [pad]: channel,
          },
        };
        if (commit) {
          handleCommit(next);
        }
        return next;
      });
    },
    [lastCommittedConfig]
  );

  return {
    config,
    isLoading,
    isDirty,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    readFromDevice,
    writeToDevice,
    saveToFlash,
    resetToDefaults,
    resetPadThresholds,
    resetTiming,
    resetKeyMappings,
    resetADCChannels,
    exportConfig,
    importConfig,
    uploadPs4Auth,
    clearPs4Auth,
    readPs4AuthStatus,
    updatePadThreshold,
    updateTiming,
    setDoubleInputMode,
    updateKeyMapping,
    updateADCChannel,
  };
}
