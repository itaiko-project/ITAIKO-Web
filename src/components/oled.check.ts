// Self-check for the OLED menu port. Run: npx tsx src/components/oled.check.ts
import { DESCRIPTORS, Onigiri, type Button } from "./oled";

const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };

for (const [page, d] of Object.entries(DESCRIPTORS))
  for (const [, action] of d.items)
    if (typeof action === "object") assert(action.goto in DESCRIPTORS, `${page} links to missing page ${action.goto}`);

const o = new Onigiri(0);
let t = 0;
const run = (ms: number) => o.update((t += ms));
const tap = (b: Button) => { o.press(b, true); run(5); o.press(b, false); run(5); };
const frame = () => o.pixels.join("");

run(2100);
const idle = frame();
o.press("start", true);
for (let i = 0; i < 25; i++) run(100);
o.press("start", false);
run(5);
assert(frame() !== idle, "holding + opens the menu");

tap("right"); tap("east"); tap("east"); // Settings → Drum → Hold Time (25)
const at25 = frame();
tap("up"); tap("up");
assert(frame() !== at25, "up changes the value");
tap("south"); tap("east"); // back restores, re-enter
assert(frame() === at25, "back restores the original value");

tap("south"); tap("south"); tap("south"); // value → Drum → Settings → idle
assert(frame() === idle, "backing out of Settings returns to idle");
// Unsaved edits are lost on reset; saved ones survive.
o.press("select", true);
for (let i = 0; i < 25; i++) run(100);
o.press("select", false);
run(5);
tap("right"); tap("east"); tap("east"); tap("up"); tap("east"); // Hold Time 26, confirmed but menu still open
o.reset(); run(2100);
o.press("start", true); for (let i = 0; i < 25; i++) run(100); o.press("start", false); run(5);
tap("right"); tap("east"); tap("east");
assert(frame() === at25, "reset drops edits made while the menu was open");
console.log("oled ok");
