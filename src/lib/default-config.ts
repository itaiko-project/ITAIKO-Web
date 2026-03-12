import type { DeviceConfig, MonitorSettings } from "@/types";

// HID Keyboard keycodes (USB HID Usage Tables)
// Defaults matching GlobalConfiguration.h
export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  pads: {
    kaLeft: { light: 100, heavy: 1500, cutoff: 4095 },
    donLeft: { light: 100, heavy: 1500, cutoff: 4095 },
    donRight: { light: 100, heavy: 1500, cutoff: 4095 },
    kaRight: { light: 100, heavy: 1500, cutoff: 4095 },
  },
  doubleInputMode: false,
  timing: {
    donDebounce: 30,
    kaDebounce: 30,
    crosstalkDebounce: 45,
    individualDebounce: 25,
    keyHoldTime: 20,
  },
  keyMappings: {
    drumP1: {
      kaLeft: 0x07,   // D
      donLeft: 0x09,  // F
      donRight: 0x0d, // J
      kaRight: 0x0e,  // K
    },
    drumP2: {
      kaLeft: 0x1d,   // Z
      donLeft: 0x1b,  // X
      donRight: 0x06, // C
      kaRight: 0x19,  // V
    },
    controller: {
      up: 0x52,       // Up Arrow
      down: 0x51,     // Down Arrow
      left: 0x50,     // Left Arrow
      right: 0x4f,    // Right Arrow
      north: 0x0f,    // L
      east: 0x2a,     // Backspace
      south: 0x28,    // Enter
      west: 0x13,     // P
      l: 0x14,        // Q
      r: 0x08,        // E
      start: 0x29,    // Escape
      select: 0x2b,   // Tab
      home: 0x00,     // None
      share: 0x00,    // None
      l3: 0x00,       // None
      r3: 0x00,       // None
    },
  },
  adcChannels: {
    donLeft: 1,   // ADC channel 1
    kaLeft: 0,    // ADC channel 0
    donRight: 2,  // ADC channel 2
    kaRight: 3,   // ADC channel 3
  },
};

export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  refreshRate: 50, // 50ms = 20Hz update rate for graphs
  historyBuffer: 5000, // 5000 samples visible
  csvLogging: false,
};

// Threshold limits
export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 4095;

// Timing limits (ms)
export const TIMING_MIN = 0;
export const TIMING_MAX = 1000;

// Monitor settings limits
export const REFRESH_RATE_MIN = 10;
export const REFRESH_RATE_MAX = 1000;
export const HISTORY_BUFFER_MIN = 100;
export const HISTORY_BUFFER_MAX = 10000;
