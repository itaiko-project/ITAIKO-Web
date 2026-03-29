import { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useDevice } from "@/context/DeviceContext";

type ImportStep = "confirm" | "importing" | "done" | "rebooting" | "error";

interface ParsedImport {
  file: File;
  hasPs4Auth: boolean;
}

export function BackupRestore() {
  const { isConnected, isReady, importConfig, exportConfig } = useDevice();

  const [isExporting, setIsExporting] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null);
  const [willReboot, setWillReboot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-close modal when device comes back ready after PS4 auth reboot
  useEffect(() => {
    if (isReady && importStep === "rebooting") {
      setImportStep(null);
      setParsedImport(null);
    }
  }, [isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportConfig();
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      if (!data.pads || !data.timing) {
        setError("Invalid config file: missing required fields.");
        setImportStep("error");
        setParsedImport(null);
        return;
      }
      const hasPs4Auth = Boolean(data.ps4Auth);
      setParsedImport({ file, hasPs4Auth });
      setWillReboot(hasPs4Auth && isConnected);
      setError(null);
      setImportStep("confirm");
    } catch {
      setError("Failed to read config file. Make sure it is a valid JSON backup.");
      setImportStep("error");
      setParsedImport(null);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedImport) return;
    setImportStep("importing");
    setError(null);

    const ok = await importConfig(parsedImport.file);

    if (ok) {
      setImportStep(willReboot ? "rebooting" : "done");
    } else {
      setError("Import failed. Check your connection and try again.");
      setImportStep("error");
    }
  };

  const handleCloseModal = () => {
    if (importStep === "importing") return;
    setImportStep(null);
    setParsedImport(null);
    setError(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup & Restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            <Button variant="outline" className="flex-1" onClick={handleImportClick} disabled={isExporting}>
              <Upload className="mr-2 h-4 w-4" />
              Import Config
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting...</>
              ) : (
                <><Download className="mr-2 h-4 w-4" />Export Config</>
              )}
            </Button>
          </div>

          {isExporting ? (
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? "Fetching configuration from device — this may take a few seconds if a PS4 auth key is stored."
                : "Saving configuration..."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Export your current configuration to a JSON file, or import a previously saved config.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={importStep !== null} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Import Configuration</DialogTitle>
            <DialogDescription>
              {importStep === "confirm" && "Review what will happen before applying."}
              {importStep === "importing" && "Applying configuration to device..."}
              {importStep === "done" && "Configuration applied successfully."}
              {importStep === "rebooting" && "Controller is rebooting."}
              {importStep === "error" && "Something went wrong."}
            </DialogDescription>
          </DialogHeader>

          {importStep === "confirm" && (
            <>
              <div className="space-y-3 py-1">
                <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-2">
                  <p className="font-medium text-foreground">This will:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-1">
                    <li>Replace all pad thresholds, timing, and key mappings</li>
                    {parsedImport?.hasPs4Auth && (
                      <li>Upload a PS4 authentication key</li>
                    )}
                    {isConnected && <li>Save settings to the controller immediately</li>}
                  </ul>
                </div>

                {willReboot && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                    The controller will reboot after importing the PS4 auth key. You will need to reconnect.
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                <Button onClick={handleConfirmImport}>Import</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "importing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {parsedImport?.hasPs4Auth && isConnected
                  ? "Applying settings and uploading PS4 auth key..."
                  : "Applying settings..."}
              </p>
            </div>
          )}

          {importStep === "done" && (
            <>
              <div className="flex flex-col items-center justify-center py-6 space-y-2 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="text-sm text-muted-foreground">All settings have been applied.</p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseModal}>Done</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "rebooting" && (
            <>
              <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <h3 className="text-base font-semibold">Config imported!</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  The controller is rebooting to activate the PS4 auth key. Reconnect when it comes back online.
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseModal}>Close</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "error" && (
            <>
              <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {error ?? "An unknown error occurred."}
              </div>
              <DialogFooter>
                <Button className="w-full" variant="outline" onClick={handleCloseModal}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
