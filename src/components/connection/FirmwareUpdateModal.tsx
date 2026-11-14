import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, CheckCircle2, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function FirmwareUpdateModal() {
  const { t } = useTranslation("connection");
  const { firmwareUpdate, isConnected, exportConfig } = useDevice();
  const { status, progress, error, latestFirmware, modalOpen, setModalOpen, installUpdate } = firmwareUpdate;
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Track if we reached 'complete' status to auto-close on reconnect
  const wasCompleteRef = useRef(false);

  // Prevent closing when in progress
  const isUpdating = status !== 'idle' && status !== 'available' && status !== 'checking' && status !== 'complete' && status !== 'error' && status !== 'manual_action_required';

  // Auto-close modal when device reconnects after successful update
  useEffect(() => {
    // 'manual_action_required' is the Firefox path's terminal state — treat it as complete too
    if (status === 'complete' || status === 'manual_action_required') {
      wasCompleteRef.current = true;
    }

    // If we were complete and device reconnected, reload the page for a clean slate
    // (avoids stale serial/update state after the device reboots with new firmware)
    if (wasCompleteRef.current && isConnected && (status === 'idle' || status === 'checking')) {
      wasCompleteRef.current = false;
      window.location.reload();
    }
  }, [status, isConnected, setModalOpen]);

  const handleOpenChange = (open: boolean) => {
    if (isUpdating && !open) {
      // Don't allow closing while updating
      return;
    }
    setModalOpen(open);
  };

  const handleStartUpdate = async () => {
    if (backupEnabled) {
      setIsExporting(true);
      await exportConfig();
      setIsExporting(false);
    }
    await installUpdate();
  };

  return (
    <Dialog open={modalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("firmwareUpdateModal.title")}</DialogTitle>
          <DialogDescription>
            {status === 'available' && (latestFirmware
              ? t("firmwareUpdateModal.description.available", { version: latestFirmware.version })
              : t("firmwareUpdateModal.description.availableNoVersion"))}
            {status === 'idle' && t("firmwareUpdateModal.description.idle")}
            {status === 'complete' && t("firmwareUpdateModal.description.complete")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {status === 'available' && latestFirmware && (
            <div className="space-y-4">
               <div className="space-y-2 text-sm text-muted-foreground">
                 <p className="font-medium text-foreground">{t("firmwareUpdateModal.howItWorks.heading")}</p>
                 <ol className="list-decimal list-inside space-y-1 ml-1">
                   <li>{t("firmwareUpdateModal.howItWorks.step1")}</li>
                   <li>{t("firmwareUpdateModal.howItWorks.step2")}</li>
                   <li>{t("firmwareUpdateModal.howItWorks.step3")}</li>
                 </ol>
               </div>

               <div className="flex items-start space-x-2 py-4 border-t">
                 <Switch id="backup-update" checked={backupEnabled} onCheckedChange={setBackupEnabled} className="mt-0.5" />
                 <div>
                   <Label htmlFor="backup-update">{t("firmwareUpdateModal.backup.label")}</Label>
                   <p className="text-xs text-muted-foreground mt-0.5">
                     {t("firmwareUpdateModal.backup.hint")}
                   </p>
                 </div>
               </div>
            </div>
          )}

          {(status === 'downloading' || status === 'rebooting' || status === 'waiting_for_device' || status === 'flashing' || status === 'writing') && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-4">
                 {status === 'writing' ? (
                   <div className="relative h-16 w-16">
                     <div className="absolute inset-0 border-4 border-brand/20 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-brand rounded-full border-t-transparent animate-spin"></div>
                   </div>
                 ) : (
                   <Loader2 className="h-12 w-12 animate-spin text-primary" />
                 )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span className="capitalize">{status.replace(/_/g, ' ')}...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {status === 'waiting_for_device' && (
                <p className="text-sm text-muted-foreground text-center bg-muted/50 p-3 rounded-xl">
                  {t("firmwareUpdateModal.progress.waitingForDevice")}
                </p>
              )}

              {status === 'flashing' && (
                <p className="text-sm font-medium text-center bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
                  {t("firmwareUpdateModal.progress.flashingPrompt")}
                </p>
              )}

              {status === 'writing' && (
                <p className="text-sm font-medium text-center bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
                  {t("firmwareUpdateModal.progress.writingWarning")}
                </p>
              )}
            </div>
          )}

          {status === 'manual_action_required' && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-foreground mb-2">
                  <Download className="h-5 w-5" />
                  <span className="font-semibold">{t("firmwareUpdateModal.manualAction.fileDownloaded")}</span>
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>{t("firmwareUpdateModal.manualAction.intro")}</p>
                  <ol className="list-decimal list-inside ml-1">
                    <li>{t("firmwareUpdateModal.manualAction.step1")}</li>
                    <li>{t("firmwareUpdateModal.manualAction.step2")}</li>
                    <li>{t("firmwareUpdateModal.manualAction.step3")}</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && (
             <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
               <CheckCircle2 className="h-16 w-16 text-green-500" />
               <h3 className="text-lg font-medium">{t("firmwareUpdateModal.complete.heading")}</h3>
               <p className="text-sm text-muted-foreground">{t("firmwareUpdateModal.complete.description")}</p>
             </div>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 p-4 rounded-md flex items-start gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{t("firmwareUpdateModal.error.title")}</p>
                <p className="text-sm">{error || t("firmwareUpdateModal.error.unknown")}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
           {status === 'available' ? (
             <>
               <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isExporting}>
                 {t("firmwareUpdateModal.buttons.cancel")}
               </Button>
               <Button onClick={handleStartUpdate} disabled={isExporting}>
                 {isExporting
                   ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("firmwareUpdateModal.buttons.exportingBackup")}</>
                   : t("firmwareUpdateModal.buttons.startUpdate")
                 }
               </Button>
             </>
           ) : isUpdating ? (
             <Button disabled className="w-full">{t("firmwareUpdateModal.buttons.updating")}</Button>
           ) : (
             <Button className="w-full" variant={status === 'error' ? 'secondary' : 'default'} onClick={() => setModalOpen(false)}>
               {t("firmwareUpdateModal.buttons.close")}
             </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
