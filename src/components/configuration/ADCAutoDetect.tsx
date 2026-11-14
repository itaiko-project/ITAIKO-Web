import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useDevice } from "@/context/DeviceContext";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { usePadLabels } from "@/i18n/pad-labels";
import { DEFAULT_DEVICE_CONFIG } from "@/lib/default-config";
import { PAD_COLORS, PAD_NAMES, type ADCChannels, type PadName } from "@/types";
import { DRUM_PAD_PATHS } from "@/components/visual/drumPads";

const ORDER: PadName[] = ["donLeft", "donRight", "kaLeft", "kaRight"];
const HITS_NEEDED = 3;

// Firmware streams raw values per pad *slot*, after the current channel mapping.
// So a hit showing up on slot X came from physical channel channels[X].
// That only works if every slot reads a different channel.
const isPermutation = (c: ADCChannels) => new Set(Object.values(c)).size === 4;

export function ADCAutoDetect({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open: fresh state and stream each time */}
        <Wizard onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Wizard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("config");
  const padLabels = usePadLabels();
  const { config, buffers, startStreaming, stopStreaming, updateADCChannel, resetADCChannels } = useDevice();

  // Mapping in effect while detecting; a broken one (two pads on one channel) is reset first
  const [channels] = useState<ADCChannels>(() =>
    config.adcChannels && isPermutation(config.adcChannels) ? config.adcChannels : DEFAULT_DEVICE_CONFIG.adcChannels!);
  const [light] = useState(() => Object.fromEntries(PAD_NAMES.map((p) => [p, config.pads[p].light])) as Record<PadName, number>);

  const [step, setStep] = useState(0);
  const [hits, setHits] = useState<PadName[]>([]);
  const [found, setFound] = useState<Partial<Record<PadName, PadName>>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const done = step >= ORDER.length;
  // Broken mapping (pads sharing a channel): reset first, listen once the drum has it
  const [needsReset] = useState(() => !!config.adcChannels && !isPermutation(config.adcChannels));
  const [preparing, setPreparing] = useState(needsReset);

  const onHit = (slot: PadName) => {
    if (done) return;
    const pad = ORDER[step];
    const owner = ORDER.find((p) => found[p] === slot);
    if (owner) {
      setWarning(t("adcChannels.autoDetect.duplicate", { other: padLabels[owner], pad: padLabels[pad] }));
      setHits([]);
      return;
    }
    if (hits.length && hits[0] !== slot) {
      setWarning(t("adcChannels.autoDetect.inconsistent", { pad: padLabels[pad] }));
      setHits([slot]);
      return;
    }
    setWarning(null);
    if (hits.length + 1 < HITS_NEEDED) {
      setHits([...hits, slot]);
      return;
    }
    setFound({ ...found, [pad]: slot });
    setHits([]);
    setStep(step + 1);
  };
  const onHitRef = useRef(onHit);
  useEffect(() => { onHitRef.current = onHit; });

  const streamRef = useRef({ startStreaming, stopStreaming });
  useEffect(() => { streamRef.current = { startStreaming, stopStreaming }; });

  // Hit detector: watch the raw stream, a hit is a burst above the pad's light threshold;
  // the slot that rose the most (relative to its threshold) wins, so crosstalk loses.
  useEffect(() => {
    // Reset reaches the drum via the 500ms auto-save; ignore the stream until then
    if (needsReset) resetADCChannels();
    const armedAt = performance.now() + (needsReset ? 1500 : 0);
    const armTimer = needsReset ? setTimeout(() => setPreparing(false), 1500) : undefined;
    streamRef.current.startStreaming("raw");

    const base = {} as Record<PadName, number>;
    const last = {} as Record<PadName, number>;
    const peak = { kaLeft: 0, donLeft: 0, donRight: 0, kaRight: 0 };
    let inHit = false;
    let quietSince = 0;

    const id = setInterval(() => {
      const now = performance.now();
      if (now < armedAt) {
        // Skip samples read with the old mapping, and re-learn resting levels after
        for (const slot of PAD_NAMES) {
          last[slot] = buffers.current[slot].head;
          delete base[slot];
        }
        return;
      }
      let max = 0;
      for (const slot of PAD_NAMES) {
        const b = buffers.current[slot];
        let i = last[slot] ?? b.head;
        while (i !== b.head) {
          const raw = b.raw[i];
          base[slot] ??= raw;
          const score = (raw - base[slot]) / Math.max(light[slot], 50);
          if (!inHit) base[slot] += (raw - base[slot]) * 0.02; // slow resting-level tracker
          peak[slot] = Math.max(peak[slot], score);
          max = Math.max(max, score);
          i = (i + 1) % b.capacity;
        }
        last[slot] = b.head;
      }

      if (!inHit) {
        if (max >= 1) { inHit = true; quietSince = now; }
        else PAD_NAMES.forEach((s) => (peak[s] = 0));
      } else if (max >= 0.5) {
        quietSince = now;
      } else if (now - quietSince > 150) {
        const winner = PAD_NAMES.reduce((a, b) => (peak[b] > peak[a] ? b : a));
        onHitRef.current(winner);
        PAD_NAMES.forEach((s) => (peak[s] = 0));
        inHit = false;
      }
    }, 30);

    return () => {
      clearInterval(id);
      clearTimeout(armTimer);
      streamRef.current.stopStreaming();
    };
    // ponytail: mount-only; channel reset and stream start happen once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = () => { setStep(0); setHits([]); setFound({}); setWarning(null); };

  const apply = () => {
    for (const pad of ORDER) {
      const slot = found[pad];
      if (slot) updateADCChannel(pad, channels[slot]);
    }
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("adcChannels.autoDetect.title")}</DialogTitle>
        <DialogDescription>{t("adcChannels.autoDetect.intro")}</DialogDescription>
      </DialogHeader>

      {/* The pad to hit flashes; found pads stay lightly tinted */}
      <div className="relative w-full max-w-52 mx-auto aspect-square">
        <img src="/visual_drum.webp" alt="" className="absolute inset-0 w-full h-full object-contain" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" aria-hidden>
          {PAD_NAMES.map((pad) => (
            <path
              key={pad}
              d={DRUM_PAD_PATHS[pad]}
              fill={PAD_COLORS[pad]}
              className={!done && !preparing && pad === ORDER[step] ? "pad-flash" : ""}
              style={{ opacity: found[pad] ? 0.25 : 0 }}
            />
          ))}
        </svg>
      </div>

      <ol className="space-y-2">
        {ORDER.map((pad, i) => {
          const slot = found[pad];
          const current = i === step;
          return (
            <li
              key={pad}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${current ? "border-brand bg-brand/10" : ""} ${i > step ? "opacity-50" : ""}`}
            >
              <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: PAD_COLORS[pad] }} />
              <span className="flex-1 text-sm font-medium">{padLabels[pad]}</span>
              {slot ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-4 text-brand-ink" aria-hidden />
                  {t("adcChannels.channel", { n: channels[slot] })}
                </span>
              ) : current ? (
                <span className="flex gap-1" aria-label={`${hits.length}/${HITS_NEEDED}`}>
                  {Array.from({ length: HITS_NEEDED }, (_, n) => (
                    <span key={n} className={`size-2.5 rounded-full ${n < hits.length ? "bg-brand" : "bg-foreground/15"}`} />
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="text-center space-y-1" aria-live="polite">
        <p className="display-font text-xl">
          {preparing
            ? t("adcChannels.autoDetect.preparing")
            : done
            ? t("adcChannels.autoDetect.done")
            : t("adcChannels.autoDetect.hitPad", { pad: padLabels[ORDER[step]], n: HITS_NEEDED })}
        </p>
        {/* Fixed height so warnings don't shift the dialog */}
        <p className="min-h-5 text-sm text-amber-600 dark:text-amber-400">{warning}</p>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={restart} disabled={step === 0 && hits.length === 0}>
          {t("adcChannels.autoDetect.restart")}
        </Button>
        <Button onClick={apply} disabled={!done}>
          {t("adcChannels.autoDetect.apply")}
        </Button>
      </DialogFooter>
    </>
  );
}
