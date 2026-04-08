import { useEffect, useState } from "react";
import { useDevice } from "@/context/DeviceContext";
import { Button } from "@/components/ui/button";
import { AlertCircle, Skull } from "lucide-react";
import { toast } from "sonner";
import { EmergencyRecoveryModal } from "./EmergencyRecoveryModal";

export function HeaderConnectionStatus() {
  const {
    status,
    error,
    isSupported,
    isConnected,
    requestPort,
    connect,
    disconnect,
    config,
  } = useDevice();

  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleConnect = async () => {
    if (isConnected) {
      await disconnect();
    } else {
      const port = await requestPort();
      if (port) {
        await connect();
      }
    }
  };

  if (!isSupported) {
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive font-medium">
            {isFirefox ? "Firefox requires an extension for WebSerial" : "WebSerial not supported"}
          </span>
        </div>
        {isFirefox && (
          <a 
            href="https://addons.mozilla.org/en-US/firefox/addon/webserial-for-firefox/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline max-w-[200px] text-right leading-tight"
          >
            To configure your drum with Firefox, please install the WebSerial extension
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isConnected && config.firmwareVersion && (
        <span className="text-xs text-muted-foreground font-mono">
          v{config.firmwareVersion}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setRecoveryModalOpen(true)}
        title="Emergency Recovery"
        className="h-8 w-8 text-destructive hover:text-destructive"
      >
        <Skull className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleConnect}
        variant={isConnected ? undefined : "default"}
        size="sm"
        disabled={status === "connecting"}
        className={isConnected ? "bg-amber-500 text-black hover:bg-amber-600" : ""}
      >
        {isConnected ? "Disconnect" : "Connect"}
      </Button>

      <EmergencyRecoveryModal
        open={recoveryModalOpen}
        onOpenChange={setRecoveryModalOpen}
      />
    </div>
  );
}
