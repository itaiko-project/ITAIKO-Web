import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Download } from "lucide-react";

export function FirmwareUpdatePanel() {
  const { t } = useTranslation("connection");
  const { isConnected, firmwareUpdate } = useDevice();
  const { status, latestFirmware, setModalOpen } = firmwareUpdate;

  // Only show if connected and update is available
  const shouldShow = isConnected && status === 'available';

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="z-50 animate-in slide-in-from-top-5 fade-in duration-300">
      <Card className="border-brand/40 bg-brand/10">
        <CardContent className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{t("firmwareUpdatePanel.updateAvailable", { version: latestFirmware?.version })}</span>
          </div>
          <Button
            size="sm"
            onClick={() => setModalOpen(true)}
          >
            <Download className="mr-1.5 h-3 w-3" />
            {t("firmwareUpdatePanel.updateButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
