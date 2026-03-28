import { useEffect, useState } from "react";
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
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-muted-foreground text-center">
        Step 1 — Hold <strong>START</strong> + <strong>SELECT</strong> for 2 seconds
      </p>
      <div className="flex gap-4">
        {["START", "SELECT"].map((label) => (
          <div
            key={label}
            className={`
              flex items-center justify-center w-20 h-10 rounded-full border-2 text-xs font-bold
              transition-all duration-300
              ${active ? "border-amber-500 bg-amber-500/20 text-amber-600 scale-110 shadow-lg shadow-amber-500/30" : "border-muted text-muted-foreground"}
            `}
          >
            {label}
          </div>
        ))}
      </div>
      {/* Hold progress bar */}
      <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full bg-amber-500 rounded-full transition-none ${active ? "animate-fill-bar" : "w-0"}`}
          style={
            active
              ? {
                  animation: "fill-bar 2s ease-in-out infinite",
                }
              : { width: 0 }
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">Hold until the menu appears</p>
    </div>
  );
}

function Step2NavigateMenu({ active }: StepProps) {
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
        Step 2 — Navigate to <strong>Device Mode</strong>
      </p>
      <div className="w-48 border rounded-lg overflow-hidden bg-background shadow-md">
        <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-center border-b">ITAIKO Menu</div>
        {items.map((item, i) => (
          <div
            key={item}
            className={`
              px-3 py-2 text-xs flex items-center gap-2 transition-colors duration-200
              ${active && i === highlighted ? "bg-amber-500 text-white font-semibold" : "text-foreground"}
            `}
          >
            {active && i === highlighted && <span className="text-white">▶</span>}
            {(!active || i !== highlighted) && <span className="opacity-0">▶</span>}
            {item}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Use the D-pad to navigate</p>
    </div>
  );
}

function Step3SelectKeyboard({ active }: StepProps) {
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
        Step 3 — Select <strong>Keyboard P1</strong> (or P2)
      </p>
      <div className="w-48 border rounded-lg overflow-hidden bg-background shadow-md">
        <div className="bg-muted px-3 py-1.5 text-xs font-semibold text-center border-b">Device Mode</div>
        {modes.map((mode, i) => (
          <div
            key={mode}
            className={`
              px-3 py-2 text-xs flex items-center gap-2 transition-colors duration-200
              ${active && i === highlighted ? "bg-amber-500 text-white font-semibold" : "text-foreground"}
            `}
          >
            {active && i === highlighted && <span className="text-white">▶</span>}
            {(!active || i !== highlighted) && <span className="opacity-0">▶</span>}
            {mode}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Press confirm to select</p>
    </div>
  );
}

interface KeyboardModeHelperModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardModeHelperModal({ open, onClose }: KeyboardModeHelperModalProps) {
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
              <span className="text-amber-500">⚠</span> Having trouble connecting?
            </DialogTitle>
            <DialogDescription>
              The configurator requires the drum to be in <strong>Keyboard mode</strong>.
              Follow these steps:
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex justify-center gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step === i ? "w-6 bg-amber-500" : "w-1.5 bg-muted"
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
              Got it, I'll try that
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground w-full" onClick={() => handleDismiss(true)}>
              Don't show this again
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
