import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldX,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useDevice } from "@/context/DeviceContext";
import { generatePs4AuthData, toBackupData, type Ps4AuthGeneratedData } from "@/lib/ps4-auth-generator";

type SetupStep = "select" | "confirm" | "uploading" | "rebooting" | "error";

function SetupModalContent({
  step,
  keyPemFile,
  serialFile,
  signatureFile,
  error,
  generatedData,
  onKeyPemChange,
  onSerialChange,
  onSignatureChange,
  onValidate,
  onUpload,
  onBack,
  onClose,
}: {
  step: SetupStep;
  keyPemFile: File | null;
  serialFile: File | null;
  signatureFile: File | null;
  error: string | null;
  generatedData: Ps4AuthGeneratedData | null;
  onKeyPemChange: (f: File | null) => void;
  onSerialChange: (f: File | null) => void;
  onSignatureChange: (f: File | null) => void;
  onValidate: () => void;
  onUpload: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const canValidate = Boolean(keyPemFile && serialFile && signatureFile);

  if (step === "select" || step === "error") {
    return (
      <>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            You'll need three files extracted from a PS4 DualShock 4 controller:
          </p>
          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1 ml-1">
            <li><code>key.pem</code> — the private RSA key</li>
            <li><code>serial.txt</code> — the controller serial (hex)</li>
            <li><code>sig.bin</code> — the signature blob</li>
          </ol>

          <div className="grid grid-cols-1 gap-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="setup-key-pem">key.pem</Label>
              <Input
                id="setup-key-pem"
                type="file"
                accept=".pem,text/plain"
                onChange={(e) => onKeyPemChange(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-serial">serial.txt</Label>
              <Input
                id="setup-serial"
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => onSerialChange(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup-sig">sig.bin</Label>
              <Input
                id="setup-sig"
                type="file"
                accept=".bin,application/octet-stream"
                onChange={(e) => onSignatureChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onValidate} disabled={!canValidate}>
            Continue
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "confirm") {
    return (
      <>
        <div className="space-y-4 py-2">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-emerald-700">Files validated successfully</p>
            <p className="text-muted-foreground">
              Serial: {generatedData?.serialBytes.length ?? 0} bytes &nbsp;·&nbsp;
              Signature: {generatedData?.signatureBytes.length ?? 0} bytes &nbsp;·&nbsp;
              Key: {generatedData?.keyPemText.length ?? 0} chars
            </p>
          </div>
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What will happen:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>The credentials are uploaded to the controller.</li>
              <li>The controller reboots automatically.</li>
              <li>Reconnect and switch to PS4 mode.</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onUpload}>Upload to Controller</Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Uploading credentials to controller...</p>
      </div>
    );
  }

  if (step === "rebooting") {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-6 space-y-3 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500" />
          <h3 className="text-base font-semibold">Credentials uploaded!</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            The controller is rebooting. Reconnect once it comes back online, then switch to PS4 mode.
          </p>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={onClose}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  return null;
}

export function PS4AuthSetup() {
  const { isConnected, readPs4AuthStatus, uploadPs4Auth, clearPs4Auth, disconnect } = useDevice();

  const [authPresent, setAuthPresent] = useState<boolean | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [step, setStep] = useState<SetupStep>("select");
  const [keyPemFile, setKeyPemFile] = useState<File | null>(null);
  const [serialFile, setSerialFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [generatedData, setGeneratedData] = useState<Ps4AuthGeneratedData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [clearOpen, setClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearDone, setClearDone] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!isConnected) return;
    setIsCheckingStatus(true);
    try {
      const present = await readPs4AuthStatus();
      setAuthPresent(present);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [isConnected, readPs4AuthStatus]);

  useEffect(() => {
    if (isConnected) {
      checkStatus();
    } else {
      setAuthPresent(null);
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close setup modal and refresh status when device reconnects after reboot
  useEffect(() => {
    if (isConnected && step === "rebooting" && setupOpen) {
      setSetupOpen(false);
      checkStatus();
    }
    if (isConnected && clearDone && clearOpen) {
      setClearOpen(false);
      setClearDone(false);
      checkStatus();
    }
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenSetup = () => {
    setStep("select");
    setKeyPemFile(null);
    setSerialFile(null);
    setSignatureFile(null);
    setGeneratedData(null);
    setSetupError(null);
    setSetupOpen(true);
  };

  const handleCloseSetup = () => {
    if (step === "uploading") return;
    setSetupOpen(false);
  };

  const handleValidate = async () => {
    if (!keyPemFile || !serialFile || !signatureFile) return;
    setSetupError(null);
    try {
      const [keyPemText, serialText, sigAB] = await Promise.all([
        keyPemFile.text(),
        serialFile.text(),
        signatureFile.arrayBuffer(),
      ]);
      const data = generatePs4AuthData({
        keyPemText,
        serialText,
        signatureBytes: new Uint8Array(sigAB),
      });
      setGeneratedData(data);
      setStep("confirm");
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Failed to read files. Check their format and try again.");
      setStep("error");
    }
  };

  const handleUpload = async () => {
    if (!generatedData) return;
    setStep("uploading");
    const ok = await uploadPs4Auth(toBackupData(generatedData));
    if (ok) {
      setStep("rebooting");
      await disconnect();
    } else {
      setSetupError("Upload failed. Check your connection and try again.");
      setStep("error");
    }
  };

  const handleOpenClear = () => {
    setClearError(null);
    setClearDone(false);
    setClearOpen(true);
  };

  const handleClear = async () => {
    setIsClearing(true);
    setClearError(null);
    const ok = await clearPs4Auth();
    setIsClearing(false);
    if (ok) {
      setClearDone(true);
      await disconnect();
    } else {
      setClearError("Clear failed. Check your connection and try again.");
    }
  };

  const handleCloseClear = () => {
    if (isClearing) return;
    setClearOpen(false);
    setClearDone(false);
    setClearError(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">PS4 Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {!isConnected ? (
                <>
                  <ShieldX className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">Connect a device to check status.</span>
                </>
              ) : isCheckingStatus || authPresent === null ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">Checking status...</span>
                </>
              ) : authPresent ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm">PS4 auth key is installed. PS4 mode is fully supported.</span>
                </>
              ) : (
                <>
                  <ShieldX className="h-5 w-5 text-amber-500 shrink-0" />
                  <span className="text-sm text-muted-foreground">No PS4 auth key. PS4 mode will disconnect after 8 minutes.</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isConnected && !isCheckingStatus && authPresent !== null && (
                <Button variant="ghost" size="icon" onClick={checkStatus} title="Refresh status">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {isConnected && authPresent === false && (
                <Button size="sm" onClick={handleOpenSetup}>
                  Set Up
                </Button>
              )}
              {isConnected && authPresent === true && (
                <Button size="sm" variant="destructive" onClick={handleOpenClear}>
                  Remove Key
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup modal */}
      <Dialog open={setupOpen} onOpenChange={(open) => { if (!open) handleCloseSetup(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Set Up PS4 Authentication</DialogTitle>
            <DialogDescription>
              {step === "select" || step === "error"
                ? "Upload your DS4 credentials to enable full PS4 compatibility."
                : step === "confirm"
                ? "Review and upload to your controller."
                : step === "uploading"
                ? "Please wait while credentials are transferred."
                : "Setup complete."}
            </DialogDescription>
          </DialogHeader>

          <SetupModalContent
            step={step}
            keyPemFile={keyPemFile}
            serialFile={serialFile}
            signatureFile={signatureFile}
            error={setupError}
            generatedData={generatedData}
            onKeyPemChange={setKeyPemFile}
            onSerialChange={setSerialFile}
            onSignatureChange={setSignatureFile}
            onValidate={handleValidate}
            onUpload={handleUpload}
            onBack={() => setStep("select")}
            onClose={handleCloseSetup}
          />
        </DialogContent>
      </Dialog>

      {/* Clear confirmation modal */}
      <Dialog open={clearOpen} onOpenChange={(open) => { if (!open) handleCloseClear(); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remove PS4 Auth Key</DialogTitle>
            <DialogDescription>
              {clearDone
                ? "The controller is rebooting."
                : "This will delete the stored PS4 credentials from the controller and reboot it."}
            </DialogDescription>
          </DialogHeader>

          {clearDone ? (
            <>
              <div className="flex flex-col items-center justify-center py-4 space-y-2 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm text-muted-foreground">
                  Key removed. Reconnect when the controller comes back online.
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseClear}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {clearError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {clearError}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseClear} disabled={isClearing}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleClear} disabled={isClearing}>
                  {isClearing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing...</> : "Remove Key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
