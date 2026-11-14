import type { PadName } from "@/types";

// Pad shapes over /visual_drum.webp, in a 0 0 200 200 viewBox
export const DRUM_PAD_PATHS: Record<PadName, string> = {
  kaLeft: "M 100 23 A 63 63 0 0 0 100 149 L 100 135 A 49 49 0 0 1 100 37 Z",
  kaRight: "M 100 23 A 63 63 0 0 1 100 149 L 100 135 A 49 49 0 0 0 100 37 Z",
  donLeft: "M 100 37 A 49 49 0 0 0 100 135 L 100 86 Z",
  donRight: "M 100 37 A 49 49 0 0 1 100 135 L 100 86 Z",
};
