import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { DeviceProvider } from "@/context/DeviceContext";
import { HeaderConnectionStatus } from "@/components/connection/HeaderConnectionStatus";
import { FirmwareUpdatePanel } from "@/components/connection/FirmwareUpdatePanel";
import { FirmwareUpdateModal } from "@/components/connection/FirmwareUpdateModal";
import { ConfigurationTab } from "@/components/configuration/ConfigurationTab";
import { LiveMonitorTab } from "@/components/monitor/LiveMonitorTab";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useDevice } from "@/context/DeviceContext";
import { initializeHelpContent } from "@/lib/help-content";
import { Activity, ChevronRight } from "lucide-react";

// Initialize help content
initializeHelpContent();

function ConfigurePageContent() {
  const { t } = useTranslation("pages");
  const { isConnected, config } = useDevice();
  const showZhongTaiko = isConnected && isZhongTaiko(config.edition);
  const [searchParams, setSearchParams] = useSearchParams();
  const advancedMode = searchParams.get("advanced") === "true";
  // Old ?tab=monitor links still land on the monitor, opened
  const monitorLinked = searchParams.get("tab") === "monitor";
  const [monitorOpen, setMonitorOpen] = useState(monitorLinked);

  const handleAdvancedModeChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set("advanced", "true");
    } else {
      newParams.delete("advanced");
    }
    setSearchParams(newParams);
  };

  return (
    <div className="configure-page min-h-svh flex flex-col w-full serif-body">
      <FirmwareUpdateModal />
      <header className="border-b w-full">
        <div className="grid grid-cols-[1fr_auto] sm:flex min-h-18 items-center justify-between gap-4 sm:gap-8 px-4 md:px-8 py-3 w-full">
          <Link to="/" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-4">
            <img src="/itaiko.png" className="pixelated drag-none w-28 sm:w-36 h-auto" alt="ITAIKO" />
          </Link>
          <div className="sm:ml-auto">
            <LanguageSwitcher />
          </div>
          <div className="col-span-2 flex justify-end"><HeaderConnectionStatus /></div>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 w-full max-w-5xl mx-auto pt-8 sm:pt-10 pb-12 sm:pb-16 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="display-font text-4xl sm:text-5xl leading-none">
            {t("landing.cta.configure")}
          </h1>
          <div className="flex items-center gap-3">
            <Label htmlFor="advanced-mode" className="text-sm text-muted-foreground">{t("configure.advanced.label")}</Label>
            <Switch id="advanced-mode" checked={advancedMode} onCheckedChange={handleAdvancedModeChange} />
          </div>
        </div>

        <FirmwareUpdatePanel />
        <ConfigurationTab />

        {/* Debug tool: tucked behind advanced mode, and only streams while open */}
        {(advancedMode || monitorLinked) && (
          <details
            open={monitorOpen}
            onToggle={(e) => setMonitorOpen(e.currentTarget.open)}
            className="group rounded-2xl border bg-foreground/[0.03]"
          >
            <summary className="flex items-center gap-2 px-5 py-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-muted-foreground hover:text-foreground">
              <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden />
              <Activity size={16} aria-hidden />
              <span className="text-sm font-medium">{t("configure.tabs.monitor")}</span>
            </summary>
            {monitorOpen && <div className="px-5 pb-5"><LiveMonitorTab /></div>}
          </details>
        )}
      </main>
      <footer className="seigaiha-footer border-t py-5 flex justify-center">
        <Link to="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-4">
          <img src="/itaiko.png" alt="ITAIKO" className="pixelated drag-none w-24 h-auto" />
        </Link>
      </footer>
    </div>
  );
}

export function ConfigurePage() {
  return (
    <DeviceProvider>
      <ConfigurePageContent />
    </DeviceProvider>
  );
}
