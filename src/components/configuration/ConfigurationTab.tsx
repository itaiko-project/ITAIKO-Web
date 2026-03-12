import { useEffect, useRef, useState } from "react";
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
import { BootScreenEditor } from "./BootScreenEditor";
import { PAD_NAMES, PAD_COLORS } from "@/types";
import { HelpButton } from "@/components/ui/help-modal";
import { HitHistoryGrid } from "@/components/visual/HitHistoryGrid";
import { RotateCcw, Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSearchParams } from "react-router-dom";

export function ConfigurationTab() {
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
    exportConfig,
    importConfig,
  } = useDevice();

  const [searchParams, setSearchParams] = useSearchParams();
  const advancedParam = searchParams.get("advanced");

  const [advancedMode, setAdvancedModeState] = useState(advancedParam === "true");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [backupReset, setBackupReset] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await importConfig(file);
      // Reset input so the same file can be selected again
      e.target.value = "";
    }
  };

  const handleFactoryReset = () => {
    if (backupReset) {
      exportConfig();
    }
    resetToDefaults();
    setShowResetDialog(false);
  };

  const handleAdvancedModeChange = (checked: boolean) => {
    setAdvancedModeState(checked);
    if (checked) {
      searchParams.set("advanced", "true");
    } else {
      searchParams.delete("advanced");
    }
    setSearchParams(searchParams);
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
      <div className="flex flex-col items-center py-4 relative">
        {/* Drum Container - Blurred when not ready */}
        <div
          className={`relative w-144 h-144 transition-all duration-500 ${!isReady ? "blur-sm opacity-50 grayscale" : ""}`}
        >
          {/* Background Image */}
          <img
            src="/visual_drum.png"
            alt="Visual Drum Background"
            className="absolute inset-0 w-full h-full object-contain translate-x-[2px]"
          />
          {/* Drum SVG Overlay */}
          <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
            {/* Ka Left - left half of outer ring */}
            <path
              d="M 100 23 A 63 63 0 0 0 100 149 L 100 135 A 49 49 0 0 1 100 37 Z"
              fill={PAD_COLORS.kaLeft}
              style={{
                opacity: triggers.kaLeft ? 0.6 : 0,
                transition: triggers.kaLeft ? "none" : "opacity 200ms ease-out",
              }}
            />
            {/* Ka Right - right half of outer ring */}
            <path
              d="M 100 23 A 63 63 0 0 1 100 149 L 100 135 A 49 49 0 0 0 100 37 Z"
              fill={PAD_COLORS.kaRight}
              style={{
                opacity: triggers.kaRight ? 0.6 : 0,
                transition: triggers.kaRight ? "none" : "opacity 200ms ease-out",
              }}
            />
            {/* Don Left - left half of inner circle */}
            <path
              d="M 100 37 A 49 49 0 0 0 100 135 L 100 86 Z"
              fill={PAD_COLORS.donLeft}
              style={{
                opacity: triggers.donLeft ? 0.6 : 0,
                transition: triggers.donLeft ? "none" : "opacity 200ms ease-out",
              }}
            />
            {/* Don Right - right half of inner circle */}
            <path
              d="M 100 37 A 49 49 0 0 1 100 135 L 100 86 Z"
              fill={PAD_COLORS.donRight}
              style={{
                opacity: triggers.donRight ? 0.6 : 0,
                transition: triggers.donRight ? "none" : "opacity 200ms ease-out",
              }}
            />
          </svg>
        </div>

        {/* Connect Overlay - Centered over the drum */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-background/80 backdrop-blur-md px-6 py-3 rounded-2xl border shadow-sm text-center">
              <p className="text-lg font-semibold">Connect your drum</p>
              <p className="text-xs text-muted-foreground mt-1">to start configuration</p>
            </div>
          </div>
        )}
      </div>

      {/* Hit History Grid - Always visible when connected */}
      <HitHistoryGrid />


      {/* Configuration Settings - Deactivated when not ready */}
      <div className={`space-y-6 transition-all duration-500 ${!isReady ? "pointer-events-none opacity-50" : ""}`}>
        {/* Global Settings - Advanced only */}
        {advancedMode && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Global Settings
                <HelpButton helpKey="global-settings" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="double-mode">Allow Double Inputs</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable heavy trigger threshold for fast double hits
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
            <h3 className="font-medium flex items-center gap-2">
              Pad Thresholds
              <HelpButton helpKey="pad-thresholds" />
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetPadThresholds}
              disabled={!isConnected}
              title="Reset pad thresholds to defaults"
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

        {/* Drum Key Bindings - Always visible */}
        <DrumKeyMapping />

        {/* Advanced Settings */}
        {advancedMode && (
          <>
            {/* Timing Settings */}
            <TimingSettings />

            {/* ADC Channel Mapping */}
            <ADCChannelSettings />

            {/* Key Mappings */}
            <InteractiveKeyMapping />

            {/* Custom Boot Screen */}
            <BootScreenEditor />
          </>
        )}

        {/* Import/Export Config */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup & Restore</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleImportClick}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import Config
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={exportConfig}
              >
                <Download className="mr-2 h-4 w-4" />
                Export Config
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Export your current configuration to a JSON file, or import a previously saved config. It will not include your custom logo.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mode Toggle - Always accessible */}
      <Card>
        <CardContent >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="advanced-mode">Advanced Mode</Label>
              <p className="text-sm text-muted-foreground">
                Show all configuration options
              </p>
            </div>
            <Switch
              id="advanced-mode"
              checked={advancedMode}
              onCheckedChange={handleAdvancedModeChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Factory Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Factory Reset</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset all configuration settings to their default values? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center space-x-2 py-4">
            <Switch id="backup-reset" checked={backupReset} onCheckedChange={setBackupReset} />
            <Label htmlFor="backup-reset">Backup configuration before resetting</Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleFactoryReset}>Reset to Defaults</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}