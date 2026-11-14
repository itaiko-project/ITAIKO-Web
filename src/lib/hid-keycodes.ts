// HID Usage Tables - Keyboard/Keypad Page (0x07)
// Maps HID keycodes to human-readable key names
// Reference: https://www.usb.org/sites/default/files/documents/hut1_12v2.pdf

export const HID_TO_KEY_NAME: Record<number, string> = {
  // Letters (A-Z)
  0x00: "Unassigned",
  0x04: "A",
  0x05: "B",
  0x06: "C",
  0x07: "D",
  0x08: "E",
  0x09: "F",
  0x0a: "G",
  0x0b: "H",
  0x0c: "I",
  0x0d: "J",
  0x0e: "K",
  0x0f: "L",
  0x10: "M",
  0x11: "N",
  0x12: "O",
  0x13: "P",
  0x14: "Q",
  0x15: "R",
  0x16: "S",
  0x17: "T",
  0x18: "U",
  0x19: "V",
  0x1a: "W",
  0x1b: "X",
  0x1c: "Y",
  0x1d: "Z",

  // Numbers (1-0)
  0x1e: "1",
  0x1f: "2",
  0x20: "3",
  0x21: "4",
  0x22: "5",
  0x23: "6",
  0x24: "7",
  0x25: "8",
  0x26: "9",
  0x27: "0",

  // Special keys
  0x28: "Enter",
  0x29: "Escape",
  0x2a: "Backspace",
  0x2b: "Tab",
  0x2c: "Space",
  0x2d: "-",
  0x2e: "=",
  0x2f: "[",
  0x30: "]",
  0x31: "\\",
  0x33: ";",
  0x34: "'",
  0x35: "`",
  0x36: ",",
  0x37: ".",
  0x38: "/",
  0x39: "Caps Lock",

  // Function keys
  0x3a: "F1",
  0x3b: "F2",
  0x3c: "F3",
  0x3d: "F4",
  0x3e: "F5",
  0x3f: "F6",
  0x40: "F7",
  0x41: "F8",
  0x42: "F9",
  0x43: "F10",
  0x44: "F11",
  0x45: "F12",

  // Navigation keys
  0x46: "Print Screen",
  0x47: "Scroll Lock",
  0x48: "Pause",
  0x49: "Insert",
  0x4a: "Home",
  0x4b: "Page Up",
  0x4c: "Delete",
  0x4d: "End",
  0x4e: "Page Down",
  0x4f: "→", // Right Arrow
  0x50: "←", // Left Arrow
  0x51: "↓", // Down Arrow
  0x52: "↑", // Up Arrow

  // Keypad
  0x53: "Num Lock",
  0x54: "KP /",
  0x55: "KP *",
  0x56: "KP -",
  0x57: "KP +",
  0x58: "KP Enter",
  0x59: "KP 1",
  0x5a: "KP 2",
  0x5b: "KP 3",
  0x5c: "KP 4",
  0x5d: "KP 5",
  0x5e: "KP 6",
  0x5f: "KP 7",
  0x60: "KP 8",
  0x61: "KP 9",
  0x62: "KP 0",
  0x63: "KP .",

  // Modifiers
  0xe0: "Left Ctrl",
  0xe1: "Left Shift",
  0xe2: "Left Alt",
  0xe3: "Left GUI",
  0xe4: "Right Ctrl",
  0xe5: "Right Shift",
  0xe6: "Right Alt",
  0xe7: "Right GUI",
};

// Maps browser KeyboardEvent.code to HID keycodes
export const BROWSER_KEY_TO_HID: Record<string, number> = {
  // Letters
  KeyA: 0x04,
  KeyB: 0x05,
  KeyC: 0x06,
  KeyD: 0x07,
  KeyE: 0x08,
  KeyF: 0x09,
  KeyG: 0x0a,
  KeyH: 0x0b,
  KeyI: 0x0c,
  KeyJ: 0x0d,
  KeyK: 0x0e,
  KeyL: 0x0f,
  KeyM: 0x10,
  KeyN: 0x11,
  KeyO: 0x12,
  KeyP: 0x13,
  KeyQ: 0x14,
  KeyR: 0x15,
  KeyS: 0x16,
  KeyT: 0x17,
  KeyU: 0x18,
  KeyV: 0x19,
  KeyW: 0x1a,
  KeyX: 0x1b,
  KeyY: 0x1c,
  KeyZ: 0x1d,

  // Numbers
  Digit1: 0x1e,
  Digit2: 0x1f,
  Digit3: 0x20,
  Digit4: 0x21,
  Digit5: 0x22,
  Digit6: 0x23,
  Digit7: 0x24,
  Digit8: 0x25,
  Digit9: 0x26,
  Digit0: 0x27,

  // Special keys
  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  Minus: 0x2d,
  Equal: 0x2e,
  BracketLeft: 0x2f,
  BracketRight: 0x30,
  Backslash: 0x31,
  Semicolon: 0x33,
  Quote: 0x34,
  Backquote: 0x35,
  Comma: 0x36,
  Period: 0x37,
  Slash: 0x38,
  CapsLock: 0x39,

  // Function keys
  F1: 0x3a,
  F2: 0x3b,
  F3: 0x3c,
  F4: 0x3d,
  F5: 0x3e,
  F6: 0x3f,
  F7: 0x40,
  F8: 0x41,
  F9: 0x42,
  F10: 0x43,
  F11: 0x44,
  F12: 0x45,

  // Navigation
  PrintScreen: 0x46,
  ScrollLock: 0x47,
  Pause: 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  Delete: 0x4c,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,

  // Keypad
  NumLock: 0x53,
  NumpadDivide: 0x54,
  NumpadMultiply: 0x55,
  NumpadSubtract: 0x56,
  NumpadAdd: 0x57,
  NumpadEnter: 0x58,
  Numpad1: 0x59,
  Numpad2: 0x5a,
  Numpad3: 0x5b,
  Numpad4: 0x5c,
  Numpad5: 0x5d,
  Numpad6: 0x5e,
  Numpad7: 0x5f,
  Numpad8: 0x60,
  Numpad9: 0x61,
  Numpad0: 0x62,
  NumpadDecimal: 0x63,

  // Modifiers
  ControlLeft: 0xe0,
  ShiftLeft: 0xe1,
  AltLeft: 0xe2,
  MetaLeft: 0xe3,
  ControlRight: 0xe4,
  ShiftRight: 0xe5,
  AltRight: 0xe6,
  MetaRight: 0xe7,
};

/**
 * Convert HID keycode to human-readable key name
 */
export function hidToKeyName(hid: number): string {
  return HID_TO_KEY_NAME[hid] || `0x${hid.toString(16).toUpperCase().padStart(2, "0")}`;
}

// Keycap-short names for the long ones
const SHORT_KEY_NAMES: Record<string, string> = {
  Escape: "Esc", Delete: "Del", Insert: "Ins", "Page Up": "PgUp", "Page Down": "PgDn",
  "Print Screen": "PrtSc", "Scroll Lock": "ScrLk", "Num Lock": "Num", "Caps Lock": "Caps", Unassigned: "",
};

export function shortKeyName(hid: number): string {
  const name = hidToKeyName(hid);
  return SHORT_KEY_NAMES[name] ?? name;
}

/**
 * Convert browser KeyboardEvent to HID keycode
 */
export function browserKeyToHid(event: KeyboardEvent): number | null {
  return BROWSER_KEY_TO_HID[event.code] ?? null;
}
