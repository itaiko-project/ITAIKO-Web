// WebSerial Types
export const PICO_VENDOR_ID = 0x1209;
export const BAUD_RATE = 115200;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface SerialState {
  port: SerialPort | null;
  status: ConnectionStatus;
  error: string | null;
}

// Device Commands
export const DeviceCommand = {
  READ_SETTINGS: 1000,
  SAVE_TO_FLASH: 1001,
  WRITE_MODE: 1002,
  REBOOT_TO_BOOTSEL: 1004,
  START_STREAMING: 2000,
  STOP_STREAMING: 2001,
  START_INPUT_STREAMING: 2002,
  // Custom Boot Screen
  BOOT_SCREEN_START: 3000,
  BOOT_SCREEN_CHUNK: 3001, // Deprecated
  BOOT_SCREEN_SAVE: 3002,  // Deprecated
  BOOT_SCREEN_CLEAR: 3003,
                                                
                                                                          
  
  // Game Integration (tosu)
  TOSU_MODE_ON: 4000,
  TOSU_MODE_OFF: 4001,
  TOSU_GREAT: 4010,
  TOSU_OK: 4011,
  TOSU_MISS: 4012,
} as const;

export type DeviceCommand = (typeof DeviceCommand)[keyof typeof DeviceCommand];

// Pad Types
export type PadName = "kaLeft" | "donLeft" | "donRight" | "kaRight";

export const PAD_NAMES: PadName[] = ["kaLeft", "donLeft", "donRight", "kaRight"];

export const PAD_LABELS: Record<PadName, string> = {
  kaLeft: "Ka Left",
  donLeft: "Don Left",
  donRight: "Don Right",
  kaRight: "Ka Right",
};

export const PAD_COLORS: Record<PadName, string> = {
  kaLeft: "#6bbdc6", // Cyan (rim)
  donLeft: "#ff4221", // Red (face)
  donRight: "#ff4221", // Red (face)
  kaRight: "#6bbdc6", // Cyan (rim)
};

// Graph Data Point (legacy - kept for compatibility)
export interface PadGraphPoint {
  time: number;
  raw: number;
  delta: number;
  duration: number;
}

// Zero-allocation buffer for streaming data
export interface PadBuffer {
  raw: Float32Array;
  delta: Float32Array;
  head: number;  // Next write position (circular)
  count: number; // Number of valid entries (0 to capacity)
  capacity: number;
}

export type PadBuffers = Record<PadName, PadBuffer>;

// Configuration Types
export interface PadThresholds {
  light: number; // 0-4095
  heavy: number; // 0-4095
  cutoff: number; // 0-4095
}

export interface TimingConfig {
  donDebounce: number; // ms (setting 4)
  kaDebounce: number; // ms (setting 5)
  crosstalkDebounce: number; // ms (setting 6)
  individualDebounce: number; // ms (setting 7)
  keyHoldTime: number; // ms (setting 8)
}

export interface KeyMappings {
  drumP1: {
    kaLeft: number; // HID keycode (setting 18)
    donLeft: number; // HID keycode (setting 19)
    donRight: number; // HID keycode (setting 20)
    kaRight: number; // HID keycode (setting 21)
  };
  drumP2: {
    kaLeft: number; // HID keycode (setting 22)
    donLeft: number; // HID keycode (setting 23)
    donRight: number; // HID keycode (setting 24)
    kaRight: number; // HID keycode (setting 25)
  };
  controller: {
    up: number; // HID keycode (setting 26)
    down: number; // HID keycode (setting 27)
    left: number; // HID keycode (setting 28)
    right: number; // HID keycode (setting 29)
    north: number; // HID keycode (setting 30)
    east: number; // HID keycode (setting 31)
    south: number; // HID keycode (setting 32)
    west: number; // HID keycode (setting 33)
    l: number; // HID keycode (setting 34)
    r: number; // HID keycode (setting 35)
    start: number; // HID keycode (setting 36)
    select: number; // HID keycode (setting 37)
    home: number; // HID keycode (setting 38)
    share: number; // HID keycode (setting 39)
    l3: number; // HID keycode (setting 40)
    r3: number; // HID keycode (setting 41)
  };
}

export interface ADCChannels {
  donLeft: number; // ADC channel 0-3 (or 0-7 for MCP3204) (setting 42)
  kaLeft: number; // ADC channel 0-3 (or 0-7 for MCP3204) (setting 43)
  donRight: number; // ADC channel 0-3 (or 0-7 for MCP3204) (setting 44)
  kaRight: number; // ADC channel 0-3 (or 0-7 for MCP3204) (setting 45)
}

export interface DeviceConfig {
  pads: Record<PadName, PadThresholds>;
  doubleInputMode: boolean; // setting 9
  timing: TimingConfig;
  keyMappings?: KeyMappings;
  adcChannels?: ADCChannels;
  firmwareVersion?: string;
}

// Monitor Settings (local UI state)
export interface MonitorSettings {
  refreshRate: number; // 10-1000ms
  historyBuffer: number; // 100-10000 samples
  csvLogging: boolean;
}

// Settings index mapping (firmware protocol)
// Note: Protocol order is donLeft, kaLeft, donRight, kaRight for thresholds
// but kaLeft, donLeft, donRight, kaRight for key mappings
export const SETTING_INDICES = {
  // Light thresholds (0-3)
  lightThreshold: {
    donLeft: 0,
    kaLeft: 1,
    donRight: 2,
    kaRight: 3,
  },
  // Timing (4-8)
  donDebounce: 4,
  kaDebounce: 5,
  crosstalkDebounce: 6,
  individualDebounce: 7,
  keyHoldTime: 8,
  // Double mode (9)
  doubleInputMode: 9,
  // Heavy thresholds (10-13)
  heavyThreshold: {
    donLeft: 10,
    kaLeft: 11,
    donRight: 12,
    kaRight: 13,
  },
  // Cutoff thresholds (14-17)
  cutoffThreshold: {
    donLeft: 14,
    kaLeft: 15,
    donRight: 16,
    kaRight: 17,
  },
  // Key mappings (18-41)
  keyMapping: {
    drumP1: {
      kaLeft: 18,
      donLeft: 19,
      donRight: 20,
      kaRight: 21,
    },
    drumP2: {
      kaLeft: 22,
      donLeft: 23,
      donRight: 24,
      kaRight: 25,
    },
    controller: {
      up: 26,
      down: 27,
      left: 28,
      right: 29,
      north: 30,
      east: 31,
      south: 32,
      west: 33,
      l: 34,
      r: 35,
      start: 36,
      select: 37,
      home: 38,
      share: 39,
      l3: 40,
      r3: 41,
    },
  },
  // ADC channels (42-45)
  adcChannel: {
    donLeft: 42,
    kaLeft: 43,
    donRight: 44,
    kaRight: 45,
  },
} as const;
