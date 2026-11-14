import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("config");
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
        setError(t("backupRestore.dialog.errorInvalidFile"));
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
      setError(t("backupRestore.dialog.errorReadFailed"));
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
      setError(t("backupRestore.dialog.errorImportFailed"));
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
          <CardTitle className="text-base">{t("backupRestore.title")}</CardTitle>
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
              {t("backupRestore.importConfig")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("backupRestore.exporting")}</>
              ) : (
                <><Download className="mr-2 h-4 w-4" />{t("backupRestore.exportConfig")}</>
              )}
            </Button>
          </div>

          {isExporting ? (
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? t("backupRestore.exportingFromDevice")
                : t("backupRestore.exportingLocal")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("backupRestore.description")}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={importStep !== null} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("backupRestore.dialog.title")}</DialogTitle>
            <DialogDescription>
              {importStep === "confirm" && t("backupRestore.dialog.descConfirm")}
              {importStep === "importing" && t("backupRestore.dialog.descImporting")}
              {importStep === "done" && t("backupRestore.dialog.descDone")}
              {importStep === "rebooting" && t("backupRestore.dialog.descRebooting")}
              {importStep === "error" && t("backupRestore.dialog.descError")}
            </DialogDescription>
          </DialogHeader>

          {importStep === "confirm" && (
            <>
              <div className="space-y-3 py-1">
                <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-2">
                  <p className="font-medium text-foreground">{t("backupRestore.dialog.willTitle")}</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-1">
                    <li>{t("backupRestore.dialog.willReplacePads")}</li>
                    {parsedImport?.hasPs4Auth && (
                      <li>{t("backupRestore.dialog.willUploadPs4")}</li>
                    )}
                    {isConnected && <li>{t("backupRestore.dialog.willSaveImmediately")}</li>}
                  </ul>
                </div>

                {willReboot && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                    {t("backupRestore.dialog.rebootWarning")}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseModal}>{t("backupRestore.dialog.cancel")}</Button>
                <Button onClick={handleConfirmImport}>{t("backupRestore.dialog.import")}</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "importing" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {parsedImport?.hasPs4Auth && isConnected
                  ? t("backupRestore.dialog.applyingWithPs4")
                  : t("backupRestore.dialog.applyingSettings")}
              </p>
            </div>
          )}

          {importStep === "done" && (
            <>
              <div className="flex flex-col items-center justify-center py-6 space-y-2 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="text-sm text-muted-foreground">{t("backupRestore.dialog.allSettingsApplied")}</p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseModal}>{t("backupRestore.dialog.done")}</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "rebooting" && (
            <>
              <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <h3 className="text-base font-semibold">{t("backupRestore.dialog.configImported")}</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {t("backupRestore.dialog.rebootingDescription")}
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseModal}>{t("backupRestore.dialog.close")}</Button>
              </DialogFooter>
            </>
          )}

          {importStep === "error" && (
            <>
              <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-4 py-3 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {error ?? t("backupRestore.dialog.unknownError")}
              </div>
              <DialogFooter>
                <Button className="w-full" variant="outline" onClick={handleCloseModal}>{t("backupRestore.dialog.close")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
