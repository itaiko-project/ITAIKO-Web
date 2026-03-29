import { useState, useRef, useEffect } from "react";
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
import { AlertTriangle, Loader2, CheckCircle2, Skull, Download } from "lucide-react";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type RecoveryStatus =
  | 'idle'
  | 'rebooting'
  | 'ready_to_nuke'
  | 'nuking'
  | 'confirm_nuke'
  | 'waiting_after_nuke'
  | 'ready_to_flash'
  | 'flashing'
  | 'confirm_flash'
  | 'complete'
  | 'error';

interface EmergencyRecoveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmergencyRecoveryModal({ open, onOpenChange }: EmergencyRecoveryModalProps) {
  const { rebootToBootsel, isConnected, exportConfig } = useDevice();
  const [status, setStatus] = useState<RecoveryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Pre-fetched data
  const nukeBlobRef = useRef<Blob | null>(null);
  const firmwareBlobRef = useRef<Blob | null>(null);
  const firmwareNameRef = useRef<string>('firmware.uf2');

  const isRecovering = status !== 'idle' && status !== 'complete' && status !== 'error';
  const canClose = !isRecovering || status === 'ready_to_nuke' || status === 'ready_to_flash';

  // Reset state when modal fully closes to avoid flash of content
  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setStatus('idle');
        setError(null);
        nukeBlobRef.current = null;
        firmwareBlobRef.current = null;
      }, 300); // Wait for transition
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!canClose && !newOpen) {
      return; // Don't allow closing during async operations
    }
    onOpenChange(newOpen);
  };

  // Step 1: Start recovery (reboot if connected, or go straight to nuke step)
  const handleStartRecovery = async () => {
    setError(null);

    if (isConnected && backupEnabled) {
      setIsExporting(true);
      await exportConfig();
      setIsExporting(false);
    }

    try {
      if (isConnected) {
        // Reboot to bootsel first
        setStatus('rebooting');
        await rebootToBootsel();
        // Wait for device to reboot
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Pre-fetch the flash nuke file
      const nukeResponse = await fetch('/universal_flash_nuke.uf2');
      if (!nukeResponse.ok) {
        throw new Error('Failed to fetch flash nuke file');
      }
      nukeBlobRef.current = await nukeResponse.blob();

      // Ready for user to save nuke file
      setStatus('ready_to_nuke');
    } catch (err) {
      console.error('Recovery failed:', err);
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  const prepareFirmware = async () => {
      // Fetch firmware from local public folder
      const firmwareResponse = await fetch('/firmware/ITAIKO.uf2');
      if (!firmwareResponse.ok) {
        throw new Error('Failed to download firmware');
      }
      firmwareBlobRef.current = await firmwareResponse.blob();
      firmwareNameRef.current = 'ITAIKO.uf2';

      // Ready for user to save firmware
      setStatus('ready_to_flash');
  };

  const handleNukeConfirmed = async () => {
      setStatus('waiting_after_nuke');
      // Give it a moment for the device to actually reboot if they just dragged it
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        await prepareFirmware();
      } catch (err) {
        console.error('Firmware prep failed:', err);
        setError('Failed to prepare firmware file');
        setStatus('error');
      }
  };

  // Step 2: User clicks to save flash_nuke.uf2
  const handleSaveNuke = async () => {
    if (!nukeBlobRef.current) {
      setError('Flash nuke file not loaded');
      setStatus('error');
      return;
    }

    try {
      setStatus('nuking');

      if ('showSaveFilePicker' in window) {
        // Show save dialog for flash_nuke - this is triggered by user click!
        // @ts-expect-error - showSaveFilePicker is not in standard types yet
        const nukeHandle = await window.showSaveFilePicker({
          suggestedName: 'flash_nuke.uf2',
          types: [{
            description: 'UF2 Firmware',
            accept: { 'application/x-uf2': ['.uf2'] },
          }],
        });
        const nukeWritable = await nukeHandle.createWritable();
        await nukeWritable.write(nukeBlobRef.current);
        await nukeWritable.close();
        
        // Automatic: Wait for device to wipe and reboot
        setStatus('waiting_after_nuke');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await prepareFirmware();
      } else {
        // Fallback: Manual download
        const url = window.URL.createObjectURL(nukeBlobRef.current);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flash_nuke.uf2';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Manual: Ask user to confirm drag & drop
        setStatus('confirm_nuke');
      }
    } catch (err) {
      console.error('Recovery failed:', err);
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  const handleFlashConfirmed = () => {
      setStatus('complete');
  };

  // Step 3: User clicks to save firmware
  const handleSaveFirmware = async () => {
    if (!firmwareBlobRef.current) {
      setError('Firmware file not loaded');
      setStatus('error');
      return;
    }

    try {
      setStatus('flashing');

      if ('showSaveFilePicker' in window) {
        // Show save dialog for firmware - this is triggered by user click!
        // @ts-expect-error - showSaveFilePicker is not in standard types yet
        const firmwareHandle = await window.showSaveFilePicker({
          suggestedName: firmwareNameRef.current,
          types: [{
            description: 'UF2 Firmware',
            accept: { 'application/x-uf2': ['.uf2'] },
          }],
        });
        const firmwareWritable = await firmwareHandle.createWritable();
        await firmwareWritable.write(firmwareBlobRef.current);
        await firmwareWritable.close();
        
        setStatus('complete');
      } else {
        // Fallback: Manual download
        const url = window.URL.createObjectURL(firmwareBlobRef.current);
        const a = document.createElement('a');
        a.href = url;
        a.download = firmwareNameRef.current;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Manual: Ask user to confirm drag & drop
        setStatus('confirm_flash');
      }
    } catch (err) {
      console.error('Recovery failed:', err);
      setError(err instanceof Error ? err.message : 'Recovery failed');
      setStatus('error');
    }
  };

  const getStepContent = () => {
    switch (status) {
      case 'rebooting':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-12 w-12 animate-spin text-destructive" />
            </div>
            <p className="text-sm text-center font-medium">
              Rebooting device into bootloader mode...
            </p>
          </div>
        );

      case 'ready_to_nuke':
        return (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
              <p className="text-sm text-amber-800 font-medium">
                Step 1: Save the flash nuke file to the RPI-RP2 drive
              </p>
              <p className="text-sm text-amber-700 mt-1">
                This will completely wipe the device. Make sure to save it to the correct drive!
              </p>
            </div>
          </div>
        );

      case 'nuking':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-12 w-12 animate-spin text-destructive" />
            </div>
            <p className="text-sm text-center font-medium">
              Saving flash nuke file...
            </p>
          </div>
        );

      case 'confirm_nuke':
        return (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-md">
              <div className="flex items-center gap-2 text-amber-800 mb-2">
                <Download className="h-5 w-5" />
                <span className="font-semibold">File downloaded</span>
              </div>
              <div className="text-sm text-amber-700 space-y-2">
                <p>The <strong>flash_nuke.uf2</strong> file has been downloaded to your computer.</p>
                <ol className="list-decimal list-inside ml-1">
                  <li>Locate the downloaded file.</li>
                  <li>Drag and drop it onto the "RPI-RP2" drive.</li>
                  <li>The device will disconnect and reboot immediately.</li>
                </ol>
              </div>
            </div>
            <p className="text-sm text-center font-medium">
              Click Continue after dragging the file.
            </p>
          </div>
        );

      case 'waiting_after_nuke':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-12 w-12 animate-spin text-destructive" />
            </div>
            <p className="text-sm text-center font-medium">
              Waiting for device to wipe and reboot...
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Downloading latest firmware in the background...
            </p>
          </div>
        );

      case 'ready_to_flash':
        return (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded-md">
              <p className="text-sm text-green-800 font-medium">
                Step 2: Save the firmware file to the RPI-RP2 drive
              </p>
              <p className="text-sm text-green-700 mt-1">
                The device has been wiped. Now save the firmware to restore it.
              </p>
            </div>
          </div>
        );

      case 'flashing':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <p className="text-sm text-center font-medium">
              Saving firmware file...
            </p>
          </div>
        );

      case 'confirm_flash':
        return (
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
                  <li>Drag and drop it onto the "RPI-RP2" drive.</li>
                  <li>The device will reboot into application mode.</li>
                </ol>
              </div>
            </div>
            <p className="text-sm text-center font-medium">
              Click Done after dragging the file.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  const getFooterButtons = () => {
    switch (status) {
      case 'idle':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isExporting}>Cancel</Button>
            <Button variant="destructive" onClick={handleStartRecovery} disabled={isExporting}>
              {isExporting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exporting backup...</>
                : <><Skull className="h-4 w-4 mr-2" />{isConnected ? 'Start Recovery' : 'Start Recovery (Device in Bootsel)'}</>
              }
            </Button>
          </>
        );

      case 'ready_to_nuke':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSaveNuke}>
              <Download className="h-4 w-4 mr-2" />
              Save Flash Nuke
            </Button>
          </>
        );

      case 'confirm_nuke':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleNukeConfirmed}>
              Continue
            </Button>
          </>
        );

      case 'ready_to_flash':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSaveFirmware}>
              <Download className="h-4 w-4 mr-2" />
              Save Firmware
            </Button>
          </>
        );

      case 'confirm_flash':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button onClick={handleFlashConfirmed}>
              Done
            </Button>
          </>
        );

      case 'complete':
        return <Button className="w-full" onClick={() => handleOpenChange(false)}>Close</Button>;

      case 'error':
        return (
          <>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            <Button variant="destructive" onClick={handleStartRecovery}>Try Again</Button>
          </>
        );

      default:
        return <Button disabled className="w-full">Recovery in progress...</Button>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Skull className="h-5 w-5" />
            Emergency Recovery
          </DialogTitle>
          <DialogDescription>
            {status === 'idle' && "Complete wipe and reflash of your controller."}
            {status === 'complete' && "Recovery complete!"}
            {(status === 'ready_to_nuke' || status === 'ready_to_flash') && "Follow the steps below."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {status === 'idle' && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-md">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-semibold text-destructive">Warning: This will wipe your device!</p>
                    <p className="text-sm text-muted-foreground">
                      This emergency recovery process will completely erase all data on your controller,
                      including settings and calibration. Only use this if your device is bricked or
                      a normal firmware update failed.
                    </p>
                  </div>
                </div>
              </div>

              {isConnected && (
                <div className="flex items-center space-x-2 py-4 border-t">
                  <Switch id="backup-recovery" checked={backupEnabled} onCheckedChange={setBackupEnabled} />
                  <Label htmlFor="backup-recovery">Backup configuration before wiping</Label>
                </div>
              )}

              {!isConnected && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-md space-y-3">
                  <p className="text-sm text-blue-800 text-center">
                    <strong>Device not connected:</strong> Make sure your device is already in bootloader mode
                    (RPI-RP2 drive should be visible) before proceeding.
                  </p>
                  <div className="flex justify-center">
                    <DotLottieReact
                      src="/lottie/enter_bootsel.lottie"
                      loop
                      autoplay
                      style={{ width: 192, height: 192 }}
                    />
                  </div>
                  <p className="text-xs text-blue-700 text-center">
                    Hold 1 then hold 2. Once the controller disconnects, release 1 then 2. A RPI-RP2 drive should appear on your computer.
                  </p>
                </div>
              )}

              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Recovery process:</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  {isConnected && <li>Device will reboot into bootloader mode</li>}
                  <li>You'll save a "flash nuke" file to wipe the device</li>
                  <li>Device will reboot again after wipe</li>
                  <li>You'll save the latest firmware to restore functionality</li>
                </ol>
              </div>
            </div>
          )}

          {getStepContent()}

          {status === 'complete' && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <h3 className="text-lg font-medium">Recovery Complete!</h3>
              <p className="text-sm text-muted-foreground">
                Your device has been wiped and reflashed. Please reconnect to your device manually.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 p-4 rounded-md flex items-start gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Recovery Failed</p>
                <p className="text-sm">{error || "An unknown error occurred."}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  You can try again or manually download the files from the GitHub releases page.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {getFooterButtons()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
