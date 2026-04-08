import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceProvider } from "@/context/DeviceContext";
import { HeaderConnectionStatus } from "@/components/connection/HeaderConnectionStatus";
import { FirmwareUpdatePanel } from "@/components/connection/FirmwareUpdatePanel";
import { FirmwareUpdateModal } from "@/components/connection/FirmwareUpdateModal";
import { ConfigurationTab } from "@/components/configuration/ConfigurationTab";
import { LiveMonitorTab } from "@/components/monitor/LiveMonitorTab";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { initializeHelpContent } from "@/lib/help-content";

// Initialize help content
initializeHelpContent();

function ConfigurePageContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "config";
  const advancedMode = searchParams.get("advanced") === "true";

  const onTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams);
  };

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
    <div className="h-screen flex flex-col w-full">
      <FirmwareUpdateModal />
      {/* Header with connection status - fixed height */}
      <header className="border-b w-full flex-shrink-0">
        <div className="flex h-14 items-center justify-between px-4 max-w-5xl mx-auto w-full">
          <Link to="/" className="font-bold text-xl shrink-0">
            <img src="itaiko.png" className="pixelated drag-none" alt="Logo" />
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="advanced-mode" className="text-sm">Advanced</Label>
              <Switch
                id="advanced-mode"
                checked={advancedMode}
                onCheckedChange={handleAdvancedModeChange}
              />
            </div>
            <HeaderConnectionStatus />
          </div>
        </div>
      </header>

      {/* Main Content - scrollable area (overflow hidden when overlay shown) */}
      <div className="flex-1 relative overflow-auto">

        <main className="px-4 w-full max-w-5xl mx-auto py-6">
          <Tabs
            value={currentTab}
            onValueChange={onTabChange}
            className="flex flex-col"
          >
            <FirmwareUpdatePanel />

            {/* Tab Content */}
            <TabsContent value="config" className="mt-0">
              
              <ConfigurationTab />
            </TabsContent>

            <TabsContent value="monitor" className="mt-0">
              <LiveMonitorTab />
            </TabsContent>

            {/* Firmware Update Panel */}

            {/* Tabs at bottom */}
            <TabsList className="grid w-full grid-cols-2 mt-6">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="monitor">Live Monitor</TabsTrigger>
            </TabsList>
          </Tabs>
        </main>
      </div>
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