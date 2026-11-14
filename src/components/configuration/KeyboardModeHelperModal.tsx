import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DONT_SHOW_KEY = "keyboard_helper_dismissed";
const STEP_DURATION_MS = 3200;

interface StepProps {
  active: boolean;
}

function Step1HoldButtons({ active }: StepProps) {
  const { t } = useTranslation("setup");
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground text-center">
        <Trans i18nKey="keyboardHelper.step1.label" ns="setup">
          Step 1 — Hold <strong>+</strong> and <strong>-</strong> for 2 seconds
        </Trans>
      </p>
      <div className="flex gap-4">
        {["+", "-"].map((label) => (
          <div
            key={label}
            className={`
              flex items-center justify-center w-20 h-10 rounded-full border-2 text-xl font-bold
              transition-all duration-300
              ${active ? "border-brand bg-brand/15 text-brand-ink scale-110" : "border-muted text-muted-foreground"}
            `}
          >
            {label}
          </div>
        ))}
      </div>
      {/* Hold progress bar */}
      <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full bg-brand rounded-full transition-none ${active ? "animate-fill-bar" : "w-0"}`}
          style={
            active
              ? {
                  animation: "fill-bar 2s ease-in-out infinite",
                }
              : { width: 0 }
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("keyboardHelper.step1.holdHint")}</p>
    </div>
  );
}

function Step2NavigateMenu({ active }: StepProps) {
  const { t } = useTranslation("setup");
  const items = ["Device Mode", "Drum Settings", "LED Settings", "System"];
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!active) {
      setHighlighted(0);
      return;
    }
    // Animate cursor moving down to "Device Mode" (index 0)
    setHighlighted(0);
  }, [active]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground text-center">
        <Trans i18nKey="keyboardHelper.step2.label" ns="setup">
          Step 2 — Navigate to <strong>Device Mode</strong>
        </Trans>
      </p>
      <div className="w-48 border rounded-lg overflow-hidden bg-background">
        <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-center border-b">ITAIKO Menu</div>
        {items.map((item, i) => (
          <div
            key={item}
            className={`
              px-3 py-2 text-xs flex items-center gap-2 transition-colors duration-200
              ${active && i === highlighted ? "bg-brand-fill text-white font-semibold" : "text-foreground"}
            `}
          >
            {active && i === highlighted && <span className="text-white">▶</span>}
            {(!active || i !== highlighted) && <span className="opacity-0">▶</span>}
            {item}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("keyboardHelper.step2.navHint")}</p>
    </div>
  );
}

function Step3SelectKeyboard({ active }: StepProps) {
  const { t } = useTranslation("setup");
  const modes = ["Switch Tatacon", "Switch Horipad", "PS3 Dualshock3", "Keyboard P1", "Keyboard P2"];
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!active) {
      setHighlighted(0);
      return;
    }
    // Animate stepping down to Keyboard P1 (index 3)
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setHighlighted(step);
      if (step >= 3) clearInterval(interval);
    }, 400);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground text-center">
        <Trans i18nKey="keyboardHelper.step3.label" ns="setup">
          Step 3 — Select <strong>Keyboard P1</strong> (or P2)
        </Trans>
      </p>
      <div className="w-48 border rounded-lg overflow-hidden bg-background">
        <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-center border-b">Device Mode</div>
        {modes.map((mode, i) => (
          <div
            key={mode}
            className={`
              px-3 py-2 text-xs flex items-center gap-2 transition-colors duration-200
              ${active && i === highlighted ? "bg-brand-fill text-white font-semibold" : "text-foreground"}
            `}
          >
            {active && i === highlighted && <span className="text-white">▶</span>}
            {(!active || i !== highlighted) && <span className="opacity-0">▶</span>}
            {mode}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("keyboardHelper.step3.confirmHint")}</p>
    </div>
  );
}

interface KeyboardModeHelperModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardModeHelperModal({ open, onClose }: KeyboardModeHelperModalProps) {
  const { t } = useTranslation("setup");
  const [step, setStep] = useState(0);

  // Cycle through steps while open
  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 3);
    }, STEP_DURATION_MS);
    return () => clearInterval(interval);
  }, [open]);

  const handleDismiss = (permanently: boolean) => {
    if (permanently) {
      localStorage.setItem(DONT_SHOW_KEY, "true");
    }
    onClose();
  };

  return (
    <>
      {/* Keyframe for the fill-bar animation injected as a style tag */}
      <style>{`
        @keyframes fill-bar {
          0%   { width: 0%; }
          80%  { width: 100%; }
          100% { width: 100%; }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-amber-500">⚠</span> {t("keyboardHelper.title")}
            </DialogTitle>
            <DialogDescription>
              <Trans i18nKey="keyboardHelper.description" ns="setup">
                The configurator requires the drum to be in <strong>Keyboard mode</strong>. Follow these steps:
              </Trans>
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex justify-center gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step === i ? "w-6 bg-brand" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Animated step content */}
          <div className="min-h-[200px] flex items-center justify-center py-2">
            {step === 0 && <Step1HoldButtons active={open && step === 0} />}
            {step === 1 && <Step2NavigateMenu active={open && step === 1} />}
            {step === 2 && <Step3SelectKeyboard active={open && step === 2} />}
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button onClick={() => handleDismiss(false)} className="w-full">
              {t("keyboardHelper.gotIt")}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground w-full" onClick={() => handleDismiss(true)}>
              {t("keyboardHelper.dontShow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function shouldShowKeyboardHelper(): boolean {
  return localStorage.getItem(DONT_SHOW_KEY) !== "true";
}
