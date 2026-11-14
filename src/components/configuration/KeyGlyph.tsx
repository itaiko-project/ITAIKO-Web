import {
  ArrowBigUp, ArrowBigUpDash, ArrowDown, ArrowLeft, ArrowRight, ArrowRightToLine, ArrowUp,
  ChevronUp, Command, CornerDownLeft, Delete, Option, Space, type LucideIcon,
} from "lucide-react";
import { hidToKeyName, shortKeyName } from "@/lib/hid-keycodes";

// Keys that have a standard keycap symbol
const ICONS: Record<number, LucideIcon> = {
  0x28: CornerDownLeft, 0x58: CornerDownLeft, // Enter, KP Enter
  0x2a: Delete,                               // Backspace
  0x2b: ArrowRightToLine,                     // Tab
  0x2c: Space,
  0x39: ArrowBigUpDash,                       // Caps Lock
  0x4f: ArrowRight, 0x50: ArrowLeft, 0x51: ArrowDown, 0x52: ArrowUp,
  0xe0: ChevronUp, 0xe4: ChevronUp,           // Ctrl
  0xe1: ArrowBigUp, 0xe5: ArrowBigUp,         // Shift
  0xe2: Option, 0xe6: Option,                 // Alt
  0xe3: Command, 0xe7: Command,               // GUI
};

/** Glyph for a HID keycode. Icons size via className (e.g. "size-5").
 *  fit: shrink longer text labels so they stay inside a round button. */
export function KeyGlyph({ code, className, fit }: { code: number; className?: string; fit?: boolean }) {
  const Icon = ICONS[code];
  if (Icon) return <Icon className={className} role="img" aria-label={hidToKeyName(code)} />;
  const text = shortKeyName(code);
  if (!fit) return <>{text}</>;
  return <span style={{ fontSize: `${Math.min(1, 2.4 / Math.max(1, text.length))}em` }}>{text}</span>;
}
