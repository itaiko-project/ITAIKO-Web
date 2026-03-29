import { useEffect, useRef, useState } from "react";
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
    if (status === 'complete') {
      wasCompleteRef.current = true;
    }

    // If we were complete and device reconnected (status changed to idle/checking), close modal
    if (wasCompleteRef.current && isConnected && (status === 'idle' || status === 'checking')) {
      wasCompleteRef.current = false;
      setModalOpen(false);
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
          <DialogTitle>Firmware Update</DialogTitle>
          <DialogDescription>
            {status === 'available' && (latestFirmware ? `Version ${latestFirmware.version} is available.` : "New version available.")}
            {status === 'idle' && "Check for firmware updates."}
            {status === 'complete' && "Update successful!"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {status === 'available' && latestFirmware && (
            <div className="space-y-4">
               <div className="space-y-2 text-sm text-muted-foreground">
                 <p className="font-medium text-foreground">How it works:</p>
                 <ol className="list-decimal list-inside space-y-1 ml-1">
                   <li>The update file will be downloaded.</li>
                   <li>Your device will reboot into bootloader mode.</li>
                   <li>A "Save File" dialog will appear. Save the file to the "RPI-RP2" drive.</li>
                 </ol>
               </div>

               <div className="flex items-start space-x-2 py-4 border-t">
                 <Switch id="backup-update" checked={backupEnabled} onCheckedChange={setBackupEnabled} className="mt-0.5" />
                 <div>
                   <Label htmlFor="backup-update">Backup configuration before updating</Label>
                   <p className="text-xs text-muted-foreground mt-0.5">
                     May take a few seconds if a PS4 auth key is stored.
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
                     <div className="absolute inset-0 border-4 border-amber-200 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
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
                <p className="text-sm text-muted-foreground text-center bg-muted/50 p-2 rounded">
                  Waiting for device to reboot into bootloader mode...
                </p>
              )}
              
              {status === 'flashing' && (
                <p className="text-sm text-amber-600 font-medium text-center bg-amber-50 p-2 rounded border border-amber-200">
                  Please save the file to the "RPI-RP2" drive.
                </p>
              )}

              {status === 'writing' && (
                <p className="text-sm text-amber-600 font-medium text-center bg-amber-50 p-2 rounded border border-amber-200 animate-pulse">
                  Copying firmware to device. Do not unplug!
                </p>
              )}
            </div>
          )}

          {status === 'manual_action_required' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
                <div className="flex items-center gap-2 text-amber-800 mb-2">
                  <Download className="h-5 w-5" />
                  <span className="font-semibold">File downloaded</span>
                </div>
                <div className="text-sm text-amber-700 space-y-2">
                  <p>The firmware file has been downloaded to your computer.</p>
                  <ol className="list-decimal list-inside ml-1">
                    <li>Locate the downloaded file.</li>
                    <li>Drag and drop the file onto the "RPI-RP2" drive.</li>
                    <li>The device will automatically reboot when finished.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {status === 'complete' && (
             <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
               <CheckCircle2 className="h-16 w-16 text-green-500" />
               <h3 className="text-lg font-medium">Update Complete!</h3>
               <p className="text-sm text-muted-foreground">Your device has been updated and is rebooting.</p>
             </div>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 p-4 rounded-md flex items-start gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Update Failed</p>
                <p className="text-sm">{error || "An unknown error occurred."}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
           {status === 'available' ? (
             <>
               <Button variant="outline" onClick={() => setModalOpen(false)} disabled={isExporting}>Cancel</Button>
               <Button onClick={handleStartUpdate} disabled={isExporting}>
                 {isExporting
                   ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting backup...</>
                   : "Start Update"
                 }
               </Button>
             </>
           ) : status === 'complete' ? (
             <Button className="w-full" onClick={() => setModalOpen(false)}>Close</Button>
           ) : status === 'manual_action_required' ? (
             <Button className="w-full" onClick={() => setModalOpen(false)}>Close</Button>
           ) : status === 'error' ? (
             <Button className="w-full" variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
           ) : (
             <Button disabled className="w-full">Updating...</Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
