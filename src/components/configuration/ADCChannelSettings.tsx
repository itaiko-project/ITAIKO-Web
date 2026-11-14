import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ADCChannels } from "@/types";
import { HelpButton } from "@/components/ui/help-modal";
import { RotateCcw, Wand2 } from "lucide-react";
import { ADCAutoDetect } from "./ADCAutoDetect";

interface ADCChannelSelectProps {
  label: string;
  pad: keyof ADCChannels;
  value: number;
  onChange: (pad: keyof ADCChannels, channel: number) => void;
  disabled?: boolean;
}

function ADCChannelSelect({
  label,
  pad,
  value,
  onChange,
  disabled,
}: ADCChannelSelectProps) {
  const { t } = useTranslation("config");

  const handleValueChange = (valueStr: string) => {
    onChange(pad, parseInt(valueStr, 10));
  };

  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <Select
        value={value.toString()}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-32 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">{t("adcChannels.channel", { n: 0 })}</SelectItem>
          <SelectItem value="1">{t("adcChannels.channel", { n: 1 })}</SelectItem>
          <SelectItem value="2">{t("adcChannels.channel", { n: 2 })}</SelectItem>
          <SelectItem value="3">{t("adcChannels.channel", { n: 3 })}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Basic mode: just auto-detect. Advanced adds the per-pad channel selectors and reset. */
export function ADCChannelSettings({ advanced }: { advanced: boolean }) {
  const { t } = useTranslation("config");
  const { config, updateADCChannel, isConnected, resetADCChannels } = useDevice();
  const adcChannels = config.adcChannels;
  const [detectOpen, setDetectOpen] = useState(false);

  // Don't render if ADC channels aren't supported by the firmware
  if (!adcChannels) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {t(advanced ? "adcChannels.title" : "adcChannels.basicTitle")}
            <HelpButton helpKey="adc-channels" />

          </CardTitle>

          <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setDetectOpen(true)} disabled={!isConnected}>
            <Wand2 aria-hidden />
            {t("adcChannels.autoDetect.button")}
          </Button>
          {advanced && <Button
            variant="ghost"
            size="icon"
            onClick={resetADCChannels}
            disabled={!isConnected}
            title={t("adcChannels.resetTitle")}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>}
          </div>
        </div>
        <CardDescription>
          {t(advanced ? "adcChannels.description" : "adcChannels.basicDescription")}
        </CardDescription>
      </CardHeader>
      {advanced && <CardContent>
        <div className="space-y-3">
          <ADCChannelSelect
            label={t("adcChannels.donLeft")}
            pad="donLeft"
            value={adcChannels.donLeft}
            onChange={updateADCChannel}
            disabled={!isConnected}
          />
          <ADCChannelSelect
            label={t("adcChannels.kaLeft")}
            pad="kaLeft"
            value={adcChannels.kaLeft}
            onChange={updateADCChannel}
            disabled={!isConnected}
          />
          <ADCChannelSelect
            label={t("adcChannels.donRight")}
            pad="donRight"
            value={adcChannels.donRight}
            onChange={updateADCChannel}
            disabled={!isConnected}
          />
          <ADCChannelSelect
            label={t("adcChannels.kaRight")}
            pad="kaRight"
            value={adcChannels.kaRight}
            onChange={updateADCChannel}
            disabled={!isConnected}
          />
        </div>
      </CardContent>}
      <ADCAutoDetect open={detectOpen} onOpenChange={setDetectOpen} />
    </Card>
  );
}
