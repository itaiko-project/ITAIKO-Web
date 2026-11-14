import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Button } from "@/components/ui/button";
import { AlertCircle, Skull } from "lucide-react";
import { toast } from "sonner";
import { EmergencyRecoveryModal } from "./EmergencyRecoveryModal";
import { getUsbModeLabel } from "@/lib/usb-mode";

export function HeaderConnectionStatus() {
  const { t } = useTranslation("connection");
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
            {isFirefox
              ? t("headerConnectionStatus.firefoxExtensionRequired")
              : t("headerConnectionStatus.notSupported")}
          </span>
        </div>
        {isFirefox && (
          <a
            href="https://addons.mozilla.org/en-US/firefox/addon/webserial-for-firefox/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline max-w-[200px] text-right leading-tight"
          >
            {t("headerConnectionStatus.firefoxExtensionLink")}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isConnected && config.usbMode && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t("headerConnectionStatus.deviceMode", {
            mode: getUsbModeLabel(config.usbMode),
          })}
        </span>
      )}
      {isConnected && config.firmwareVersion && (
        <span className="text-xs text-muted-foreground font-mono">
          v{config.firmwareVersion}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setRecoveryModalOpen(true)}
        title={t("headerConnectionStatus.emergencyRecovery")}
        className="h-8 w-8 text-destructive hover:text-destructive"
      >
        <Skull className="h-4 w-4" />
      </Button>
      <Button
        onClick={handleConnect}
        variant={isConnected ? "outline" : "default"}
        size="sm"
        disabled={status === "connecting"}
      >
        {isConnected
          ? t("headerConnectionStatus.disconnect")
          : t("headerConnectionStatus.connect")}
      </Button>

      <EmergencyRecoveryModal
        open={recoveryModalOpen}
        onOpenChange={setRecoveryModalOpen}
      />
    </div>
  );
}
