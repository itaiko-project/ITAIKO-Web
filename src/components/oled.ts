// Browser port of the onigiri's SSD1306 UI: ITAIKO-Firmware src/utils/Menu.cpp, src/peripherals/Display.cpp
// and the pico_ssd1306 drawing routines. Behaviour and pixel positions follow the firmware; keep them in sync.
import { FONT_8X5, MENU_SCREEN_SUB, MENU_SCREEN_TOP, MENU_SCREEN_VALUE, SPLASH_SCREEN } from "./oledData";

export const OLED_W = 128;
export const OLED_H = 64;

export type Button = "up" | "down" | "left" | "right" | "east" | "south" | "start" | "select";

// ponytail: page names are plain strings; a typo shows up as a missing page in oled.check.ts
type Page = string;
type PageType = "menu" | "selection" | "value" | "toggle" | "rebootInfo" | "info";
type Action =
  | { goto: Page }
  | "set" | "parent" | "reset" | "bootsel" | "doubleTriggerOff" | "none";
interface Descriptor { type: PageType; name: string; items: [string, Action][]; max?: number }

const ROLL_BOOST_MAX = 50; // RollBoost::kMaxWindowMs
const FIRMWARE_VERSION = "1.16.0"; // ponytail: matches public/firmware/version.txt; bump together

const value = (name: string, max: number): Descriptor => ({ type: "value", name, items: [["", "set"]], max });
const pads = (prefix: string): [string, Action][] =>
  (["KaLeft", "DonLeft", "DonRight", "KaRight"] as const).map((p, i) =>
    [["Left Ka", "Left Don", "Right Don", "Right Ka"][i], { goto: `${prefix}${p}` }]);

export const DESCRIPTORS: Record<Page, Descriptor> = {
  Main: { type: "menu", name: "Settings", items: [
    ["Mode", { goto: "DeviceMode" }], ["Drum", { goto: "Drum" }], ["Led", { goto: "Led" }],
    ["Reset", { goto: "Reset" }], ["USB Flash", { goto: "Bootsel" }], ["Version", { goto: "Version" }],
    ["PS4 Key", { goto: "PS4Auth" }], ["PS3 MAC", { goto: "MacAddress" }],
  ] },
  Version: { type: "info", name: "Firmware Version", items: [[FIRMWARE_VERSION, "none"]] },
  PS4Auth: { type: "info", name: "PS4 Auth Key", items: [["None", "none"], ["Present", "none"]] },
  MacAddress: { type: "info", name: "PS3 MAC", items: [["", "none"]] },
  DeviceMode: { type: "selection", name: "Mode", items: [
    ["Keybrd P1", "set"], ["Keybrd P2", "set"], ["Swtch Tata", "set"], ["PS4 Tata", "set"],
    ["Joystick", "set"], ["USIO Taiko", "set"], ["MIDI", "set"], ["Dualshock3", "set"],
  ] },
  Drum: { type: "menu", name: "Drum Settings", items: [
    ["Hold Time", { goto: "DrumDebounceDelay" }], ["Debounce", { goto: "DrumDebounce" }],
    ["Thresholds", { goto: "DrumTriggerThresholds" }], ["Cutoff", { goto: "DrumCutoffThresholds" }],
    ["Double Trg", { goto: "DrumDoubleTrigger" }], ["Roll Boost", { goto: "DrumRollBoost" }],
    ["Buffered", { goto: "DrumBufferedInput" }],
  ] },
  DrumTriggerThresholds: { type: "menu", name: "Thresholds", items: pads("DrumTriggerThreshold") },
  DrumCutoffThresholds: { type: "menu", name: "Cutoff", items: pads("DrumCutoffThreshold") },
  DrumDoubleTrigger: { type: "menu", name: "Double Hit Mode", items: [
    ["Off", "doubleTriggerOff"], ["Threshold", { goto: "DrumDoubleTriggerThresholds" }],
  ] },
  DrumDoubleTriggerThresholds: { type: "menu", name: "Double Thresholds", items: pads("DrumDoubleTriggerThreshold") },
  DrumDebounceDelay: value("Hit Hold Time (ms)", 255),
  DrumKeyTimeout: value("Key Debounce (ms)", 255),
  DrumRollBoost: value("Roll Boost (ms)", ROLL_BOOST_MAX),
  DrumBufferedInput: { type: "toggle", name: "Buffered Input", items: [["", "set"]] },
  DrumDebounce: { type: "menu", name: "Debounce Settings", items: [
    ["Don", { goto: "DrumDonDebounce" }], ["Ka", { goto: "DrumKatDebounce" }],
    ["Crosstalk", { goto: "DrumCrosstalkDebounce" }], ["Key", { goto: "DrumKeyTimeout" }],
  ] },
  DrumDonDebounce: value("Don Debounce (ms)", 255),
  DrumKatDebounce: value("Ka Debounce (ms)", 255),
  DrumCrosstalkDebounce: value("Crosstalk Debounce (ms)", 255),
  DrumTriggerThresholdKaLeft: value("Trg Level Left Ka", 4095),
  DrumTriggerThresholdDonLeft: value("Trg Level Left Don", 4095),
  DrumTriggerThresholdDonRight: value("Trg Level Right Don", 4095),
  DrumTriggerThresholdKaRight: value("Trg Level Right Ka", 4095),
  DrumDoubleTriggerThresholdKaLeft: value("Trg Level Left Ka", 4095),
  DrumDoubleTriggerThresholdDonLeft: value("Trg Level Left Don", 4095),
  DrumDoubleTriggerThresholdDonRight: value("Trg Level Right Don", 4095),
  DrumDoubleTriggerThresholdKaRight: value("Trg Level Right Ka", 4095),
  DrumCutoffThresholdKaLeft: value("Cutoff Threshold Ka Left", 4095),
  DrumCutoffThresholdDonLeft: value("Cutoff Threshold Don Left", 4095),
  DrumCutoffThresholdDonRight: value("Cutoff Threshold Don Right", 4095),
  DrumCutoffThresholdKaRight: value("Cutoff Threshold Ka Right", 4095),
  Led: { type: "menu", name: "LED Settings", items: [
    ["Brightness", { goto: "LedBrightness" }], ["Plyr Color", { goto: "LedEnablePlayerColor" }],
  ] },
  LedBrightness: value("LED Brightness", 255),
  LedEnablePlayerColor: { type: "toggle", name: "Player Color (PS4)", items: [["", "set"]] },
  Reset: { type: "menu", name: "Reset all Settings?", items: [["No", "parent"], ["Yes", "reset"]] },
  Bootsel: { type: "menu", name: "Reboot to Flash Mode", items: [["Reboot?", "bootsel"]] },
  BootselMsg: { type: "rebootInfo", name: "Ready to Flash...", items: [["BOOTSEL", "none"]] },
};
const descriptor = (page: Page): Descriptor => DESCRIPTORS[page];

// SettingsStore defaults (GlobalConfiguration.h / SettingsStore.cpp). A page's value lives under its own name,
// which collapses the firmware's per-page getCurrentValue / restore / set switches into one lookup.
const DEFAULTS: Record<Page, number> = {
  DeviceMode: 0, // USB_MODE_KEYBOARD_P1
  DrumDebounceDelay: 25, DrumDonDebounce: 30, DrumKatDebounce: 30, DrumCrosstalkDebounce: 30, DrumKeyTimeout: 20,
  DrumRollBoost: 30, DrumBufferedInput: 1, DrumDoubleTrigger: 0,
  DrumTriggerThresholdKaLeft: 100, DrumTriggerThresholdDonLeft: 100,
  DrumTriggerThresholdDonRight: 100, DrumTriggerThresholdKaRight: 100,
  DrumDoubleTriggerThresholdKaLeft: 1500, DrumDoubleTriggerThresholdDonLeft: 1500,
  DrumDoubleTriggerThresholdDonRight: 1500, DrumDoubleTriggerThresholdKaRight: 1500,
  DrumCutoffThresholdKaLeft: 4095, DrumCutoffThresholdDonLeft: 4095,
  DrumCutoffThresholdDonRight: 4095, DrumCutoffThresholdKaRight: 4095,
  LedBrightness: 255, LedEnablePlayerColor: 0, PS4Auth: 0,
};

const MODE_NAMES = ["Keyboard P1", "Keyboard P2", "Switch Tatacon", "PS4 Tatacon", "Joystick", "USIO Taiko", "MIDI", "Dualshock 3"];
const MAC = "02:1A:2B:3C:4D:5E"; // ponytail: the real one is per-device; any plausible address will do here

// Menu::Buttons repeat timing (ms)
const REPEAT_DELAY = 1000, REPEAT_INTERVAL = 20, FAST_REPEAT_DELAY = 5000, FAST_REPEAT_INTERVAL = 2;
const SPLASH_MS = 2000;

const bitmap = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const BITMAPS = {
  splash: bitmap(SPLASH_SCREEN), top: bitmap(MENU_SCREEN_TOP), sub: bitmap(MENU_SCREEN_SUB), value: bitmap(MENU_SCREEN_VALUE),
};

interface MenuState { page: Page; selected: number; original: number }
interface Repeat { phase: "idle" | "delay" | "repeat" | "fast"; since: number; last: number }

export class Onigiri {
  /** One byte per pixel, row-major; 1 = lit. */
  readonly pixels = new Uint8Array(OLED_W * OLED_H);
  private held = new Set<Button>();
  private repeat = new Map<Button, Repeat>();
  private settings = { ...DEFAULTS };
  private stored = { ...DEFAULTS }; // what survives a reboot: written when the menu closes
  private stack: MenuState[] = [];
  screen: "splash" | "idle" | "menu" = "splash";
  private splashAt: number;
  private clock: number;

  constructor(now: number) {
    this.clock = this.splashAt = now;
    this.draw();
  }

  /** The Pico's reset button: reboot, dropping anything changed in a menu that was never closed. */
  reset() {
    this.settings = { ...this.stored };
    this.stack = [];
    this.held.clear();
    this.screen = "splash";
    this.splashAt = this.clock;
  }

  press(button: Button, down: boolean) {
    if (down) this.held.add(button);
    else this.held.delete(button);
  }

  /** Advances the simulated firmware loop to `now`. Returns true when the screen changed. */
  update(now: number): boolean {
    const before = this.pixels.slice();
    // The firmware polls every millisecond; stepping at that rate keeps the fast repeat honest.
    // ponytail: capped at 100 steps per call, so a backgrounded tab does not replay minutes of held keys.
    for (let t = Math.max(this.clock, now - 100) + 1; t <= now; t++) this.step(t);
    this.clock = now;
    this.draw();
    return before.some((v, i) => v !== this.pixels[i]);
  }

  private step(now: number) {
    if (this.screen === "splash") {
      if (now - this.splashAt >= SPLASH_MS) this.screen = "idle";
      return;
    }
    if (this.screen === "idle") {
      // The firmware wants + and − held together for 2 s; on the page a single press of either opens the menu,
      // so trying it is instant.
      if (this.held.has("start") || this.held.has("select")) {
        this.stack = [{ page: "Main", selected: 0, original: 0 }];
        this.screen = "menu";
      }
      return;
    }
    this.menuUpdate(now);
  }

  private pressed(button: Button, now: number): boolean {
    const r = this.repeat.get(button) ?? { phase: "idle", since: 0, last: 0 };
    this.repeat.set(button, r);
    if (!this.held.has(button)) {
      r.phase = "idle";
      return false;
    }
    switch (r.phase) {
      case "idle":
        Object.assign(r, { phase: "delay", since: now });
        return true;
      case "delay":
        if (now - r.since <= REPEAT_DELAY) return false;
        Object.assign(r, { phase: "repeat", last: now });
        return true;
      case "repeat":
        if (now - r.since > FAST_REPEAT_DELAY) {
          Object.assign(r, { phase: "fast", last: now });
          return true;
        }
        if (now - r.last <= REPEAT_INTERVAL) return false;
        r.last = now;
        return true;
      case "fast":
        if (now - r.last <= FAST_REPEAT_INTERVAL) return false;
        r.last = now;
        return true;
    }
  }

  private gotoPage(page: Page) {
    const v = this.settings[page] ?? 0;
    this.stack.push({ page, selected: v, original: v });
  }

  private gotoParent(restore: boolean) {
    const top = this.stack.pop()!;
    if (restore && top.page in this.settings) this.settings[top.page] = top.original;
    if (top.page === "Main") {
      this.screen = "idle";
      this.stored = { ...this.settings }; // settings_store->store()
    }
  }

  private perform(action: Action, value: number) {
    const top = this.stack.at(-1)!;
    if (typeof action === "object") {
      if (action.goto === "DrumDoubleTriggerThresholds") this.settings.DrumDoubleTrigger = 1;
      return this.gotoPage(action.goto);
    }
    switch (action) {
      case "set": this.settings[top.page] = value; break;
      case "parent": this.gotoParent(false); break;
      case "reset": this.settings = { ...DEFAULTS }; break;
      case "doubleTriggerOff": this.settings.DrumDoubleTrigger = 0; this.gotoParent(false); break;
      case "bootsel": this.gotoPage("BootselMsg"); break;
    }
  }

  private menuUpdate(now: number) {
    // Every button runs its repeat state machine each tick, like Buttons::update.
    const p = Object.fromEntries((["left", "right", "up", "down", "south", "east"] as const)
      .map((b) => [b, this.pressed(b, now)])) as Record<"left" | "right" | "up" | "down" | "south" | "east", boolean>;
    const state = this.stack.at(-1)!;
    const d = descriptor(state.page);
    const n = d.items.length;

    if (d.type === "rebootInfo") {
      // The real device drops off USB here; pretend it rebooted and came back.
      if (now - this.splashAt > 1500) {
        this.reset();
      }
      return;
    }
    if (p.left || p.right) {
      const delta = p.left ? n - 1 : 1;
      if (d.type === "toggle") {
        state.selected = state.selected ? 0 : 1;
        this.perform(d.items[0][1], state.selected);
      } else if (d.type === "selection" || d.type === "menu") {
        state.selected = (state.selected + delta) % n;
        if (d.type === "selection") this.perform(d.items[state.selected][1], state.selected);
      }
    } else if (p.up || p.down) {
      if (d.type === "value" && (p.up ? state.selected < d.max! : state.selected > 0)) {
        state.selected += p.up ? 1 : -1;
        this.perform(d.items[0][1], state.selected);
      }
    } else if (p.south) {
      if (d.type === "value" || d.type === "toggle" || d.type === "selection") this.gotoParent(true);
      else this.gotoParent(false);
    } else if (p.east) {
      if (d.type === "value" || d.type === "toggle" || d.type === "selection") this.gotoParent(false);
      else if (d.type === "menu") this.perform(d.items[state.selected][1], state.selected);
    }
    // Entering BootselMsg starts its "reboot" timer (splashAt doubles as it until the splash takes over).
    if (this.stack.at(-1)?.page === "BootselMsg" && state.page !== "BootselMsg") this.splashAt = now;
  }

  // ── drawing (pico_ssd1306) ──

  private pixel(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < OLED_W && y < OLED_H) this.pixels[y * OLED_W + x] = 1;
  }

  private square(x: number, y: number, w: number, h: number) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.pixel(x + i, y + j);
  }

  private text(x: number, y: number, scale: number, s: string) {
    for (const c of s) {
      const code = c.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        for (let w = 0; w < 5; w++) {
          const line = FONT_8X5[(code - 32) * 5 + w];
          for (let j = 0; j < 8; j++) if ((line >> j) & 1) this.square(x + w * scale, y + j * scale, scale, scale);
        }
      }
      x += 6 * scale;
    }
  }

  /** Firmware centring, `(127 - len * charWidth) / 2`, including its unsigned wrap for over-long strings. */
  private centered(y: number, scale: number, s: string) {
    this.text(Math.floor((127 - s.length * 6 * scale) / 2), y, scale, s);
  }

  private image(bits: Uint8Array) {
    for (let i = 0; i < this.pixels.length; i++) if ((bits[i >> 3] >> (7 - (i & 7))) & 1) this.pixels[i] = 1;
  }

  private dots(count: number, selected: number) {
    for (let i = 0; i < count; i++) {
      if (i === selected) this.square(127 - (count - i) * 6 - 1, 2, 4, 4);
      else this.square(127 - (count - i) * 6, 3, 2, 2);
    }
  }

  private draw() {
    this.pixels.fill(0);
    if (this.screen === "splash") return this.image(BITMAPS.splash);

    if (this.screen === "idle") {
      this.text(0, 0, 1, `${MODE_NAMES[this.settings.DeviceMode ?? 0]} mode`);
      this.square(0, 10, 128, 1);
      this.centered(20, 2, "0 Roll");
      this.centered(40, 1, "Last 0");
      this.square(0, 54, 128, 1);
      this.text(0, 56, 1, "Hold + and - for Menu");
      return;
    }

    const { page, selected } = this.stack.at(-1)!;
    const d = descriptor(page);
    if (d.type === "menu") this.image(page === "Main" ? BITMAPS.top : BITMAPS.sub);
    else if (d.type === "value") this.image(BITMAPS.value);
    else if (d.type !== "rebootInfo") this.image(BITMAPS.sub);

    this.text(0, 0, 1, d.name);

    let selection: string;
    let scale = 2;
    if (d.type === "value") selection = String(selected);
    else if (d.type === "toggle") selection = selected ? "On" : "Off";
    else if (page === "MacAddress") [selection, scale] = [MAC, 1];
    else selection = d.items[selected][0];
    this.centered(15, scale, selection);

    if (d.type === "menu" || d.type === "selection") this.dots(d.items.length, selected);
  }
}

