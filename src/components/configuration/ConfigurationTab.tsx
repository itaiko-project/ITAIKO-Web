import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PadConfigGroup } from "./PadConfigGroup";
import { TimingSettings } from "./TimingSettings";
import { ADCChannelSettings } from "./ADCChannelSettings";
import { InteractiveKeyMapping } from "./InteractiveKeyMapping";
import { DrumKeyMapping } from "./DrumKeyMapping";
import { RollBoostSettings } from "./RollBoostSettings";
import { PS4AuthSetup } from "./PS4AuthSetup";
import { BackupRestore } from "./BackupRestore";
import { PAD_NAMES, PAD_COLORS } from "@/types";
import { HelpButton } from "@/components/ui/help-modal";
import { HitHistoryGrid } from "@/components/visual/HitHistoryGrid";
import { DRUM_PAD_PATHS } from "@/components/visual/drumPads";
import { RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearchParams } from "react-router-dom";
import {
  KeyboardModeHelperModal,
  shouldShowKeyboardHelper,
} from "./KeyboardModeHelperModal";

export function ConfigurationTab() {
  const { t } = useTranslation("config");
  const {
    config,
    setDoubleInputMode,
    isConnected,
    isReady,
    triggers,
    saveToFlash,
    configDirty,
    resetPadThresholds,
    resetToDefaults,
  } = useDevice();

  const [searchParams] = useSearchParams();
  const advancedMode = searchParams.get("advanced") === "true";

  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showHelperModal, setShowHelperModal] = useState(false);

  // Show keyboard mode helper after 60s if still not connected
  useEffect(() => {
    if (isReady) return;
    if (!shouldShowKeyboardHelper()) return;
    const timer = setTimeout(() => {
      if (!isReady) setShowHelperModal(true);
    }, 60_000);
    return () => clearTimeout(timer);
  }, [isReady]);

  const handleFactoryReset = () => {
    resetToDefaults();
    setShowResetDialog(false);
  };

  const isFirstRender = useRef(true);

  // Debounced auto-save: save to flash 500ms after config changes
  const saveToFlashRef = useRef(saveToFlash);
  useEffect(() => {
    saveToFlashRef.current = saveToFlash;
  });

  useEffect(() => {
    // Skip auto-save on first render (initial config load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Only auto-save if connected and there are unsaved changes
    if (!isConnected || !configDirty) return;

    const timeoutId = setTimeout(() => {
      saveToFlashRef.current();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [config, isConnected, configDirty]);

  return (
    <div className="space-y-6">
      {/* Visual Drum */}
      <div className="flex flex-col items-center py-4 relative rounded-2xl border bg-foreground/[0.03] overflow-hidden">
        {/* Drum Container - Blurred when not ready */}
        <div
          className={`relative w-full max-w-100 aspect-square transition-all duration-500 ${!isReady ? "blur-sm opacity-50 grayscale" : ""}`}
        >
          {/* Background Image */}
          <img
            src="/visual_drum.webp"
            alt="Visual Drum Background"
            className="absolute inset-0 w-full h-full object-contain"
          />
          {/* Drum SVG Overlay */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
            {PAD_NAMES.map((pad) => (
              <path
                key={pad}
                d={DRUM_PAD_PATHS[pad]}
                fill={PAD_COLORS[pad]}
                style={{
                  opacity: triggers[pad] ? 0.6 : 0,
                  transition: triggers[pad] ? "none" : "opacity 200ms ease-out",
                }}
              />
            ))}
          </svg>
        </div>

        {/* Connect Overlay - Centered over the drum */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-background/90 backdrop-blur-md mx-4 px-5 sm:px-8 py-5 rounded-2xl border text-center space-y-2">
              <p className="display-font text-2xl sm:text-3xl">{t("connectOverlay.connectYourDrum")}</p>
              <p className="text-xs text-muted-foreground">{t("connectOverlay.toStartConfiguration")}</p>
              <p className="text-xs font-medium text-brand-ink">
                {t("connectOverlay.setKeyboardMode")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hit History Grid - Always visible when connected */}
      <HitHistoryGrid />

      {/* Configuration Settings - Deactivated when not ready */}
      <div
        className={`space-y-6 transition-all duration-500 ${!isReady ? "pointer-events-none opacity-50" : ""}`}
      >
        {/* Global Settings - Advanced only */}
        {advancedMode && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {t("globalSettings.title")}
                <HelpButton helpKey="global-settings" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="double-mode">
                    {t("globalSettings.allowDoubleInputs")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("globalSettings.allowDoubleInputsDescription")}
                  </p>
                </div>
                <Switch
                  id="double-mode"
                  checked={config.doubleInputMode}
                  onCheckedChange={setDoubleInputMode}
                  disabled={!isConnected}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pad Configuration Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="display-font text-2xl flex items-center gap-2">
              {t("padThresholds.title")}
              <HelpButton helpKey="pad-thresholds" />
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetPadThresholds}
              disabled={!isConnected}
              title={t("padThresholds.resetTitle")}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PAD_NAMES.map((pad) => (
              <PadConfigGroup key={pad} pad={pad} simpleMode={!advancedMode} />
            ))}
          </div>
        </div>

        {/* Key bindings - always visible */}
        <DrumKeyMapping />
        <InteractiveKeyMapping />

        {/* Pad wiring: auto-detect always, channel selectors in advanced */}
        <ADCChannelSettings advanced={advancedMode} />

        {/* Roll Boost (連打增速) - Always visible */}
        {advancedMode && <RollBoostSettings />}

        {/* Advanced Settings */}
        {advancedMode && (
          <>
            {/* Timing Settings */}
            <TimingSettings />

            {/* PS4 Authentication */}
            <PS4AuthSetup />
          </>
        )}

        {/* Import/Export Config */}
        <BackupRestore />
      </div>

      {/* Factory Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("factoryReset.title")}</DialogTitle>
            <DialogDescription>
              {t("factoryReset.description")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              {t("factoryReset.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleFactoryReset}>
              {t("factoryReset.resetToDefaults")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KeyboardModeHelperModal
        open={showHelperModal}
        onClose={() => setShowHelperModal(false)}
      />
    </div>
  );
}
