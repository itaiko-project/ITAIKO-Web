import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Judgment, TosuDebugInfo } from "@/hooks/useGameIntegration";

const JUDGMENT_STYLES: Record<Judgment, { label: string; color: string; rgb: string }> = {
  great: { label: "Great (300)", color: "text-yellow-400", rgb: "255, 215, 0" },
  ok:    { label: "Ok (100)",   color: "text-green-400",  rgb: "100, 200, 100" },
  miss:  { label: "Miss (0)",   color: "text-red-500",    rgb: "255, 30, 30" },
};

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${active ? "bg-green-500" : "bg-muted-foreground/40"}`}
    />
  );
}

function DebugRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function DebugPanel({ debug, isWsConnected }: { debug: TosuDebugInfo; isWsConnected: boolean }) {
  if (!isWsConnected && debug.messageCount === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WebSocket Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <DebugRow label="Messages received" value={debug.messageCount} />
        <DebugRow label="state.name" value={debug.lastStateName || "(empty)"} />
        <DebugRow label="state.number" value={debug.lastStateNumber} />
        {debug.lastHits ? (
          <>
            <div className="border-t border-border pt-2 mt-2 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">play.hits (raw from tosu)</p>
              <DebugRow label="[300]" value={debug.lastHits.raw300} />
              <DebugRow label="[100]" value={debug.lastHits.raw100} />
              <DebugRow label="[0] (miss)" value={debug.lastHits.raw0} />
              <DebugRow label="geki" value={debug.lastHits.geki} />
              <DebugRow label="katu" value={debug.lastHits.katu} />
            </div>
            <div className="border-t border-border pt-2 mt-2 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Computed (used for serial commands)</p>
              <DebugRow label="Great (300 + geki)" value={debug.lastHits.computedGreat} />
              <DebugRow label="Ok (100 + katu)" value={debug.lastHits.computedOk} />
              <DebugRow label="Miss (0)" value={debug.lastHits.computedMiss} />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground italic">No hit data in messages yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export function GameIntegrationTab() {
  const { isConnected, gameIntegration } = useDevice();
  const {
    isWsConnected,
    isTosuModeActive,
    isAutoMode,
    lastJudgment,
    mapState,
    debug,
    connect,
    disconnect,
    setAutoMode,
    enterTosuMode,
    exitTosuMode,
    sendJudgment,
  } = gameIntegration;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot active={isConnected} />
              <span className="text-muted-foreground">ITAIKO drum</span>
            </div>
            <Badge variant={isConnected ? "default" : "outline"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot active={isWsConnected} />
              <span className="text-muted-foreground">tosu WebSocket</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isWsConnected ? "default" : "outline"}>
                {isWsConnected ? "Connected" : "Disconnected"}
              </Badge>
              <Button
                size="sm"
                variant={isWsConnected ? "outline" : "default"}
                onClick={isWsConnected ? disconnect : connect}
              >
                {isWsConnected ? "Disconnect" : "Connect"}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot active={isTosuModeActive} />
              <span className="text-muted-foreground">tosu LED mode</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isTosuModeActive ? "default" : "outline"}>
                {isTosuModeActive ? "Active" : "Inactive"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={!isConnected || !isWsConnected}
                onClick={isTosuModeActive ? exitTosuMode : enterTosuMode}
              >
                {isTosuModeActive ? "Exit" : "Enter"}
              </Button>
            </div>
          </div>

          {isWsConnected && (
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted-foreground">Map state</span>
              <Badge variant="secondary" className="capitalize">
                {mapState}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auto Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-mode"
              checked={isAutoMode}
              onCheckedChange={setAutoMode}
            />
            <Label htmlFor="auto-mode" className="cursor-pointer">
              Auto-enter tosu mode when a map starts
            </Label>
          </div>
          <p className="text-xs text-muted-foreground pl-10">
            When enabled, the drum automatically enters tosu LED mode at the start of a
            Taiko map and returns to normal when the map ends.
          </p>
        </CardContent>
      </Card>

      {/* Judgment Color Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Judgment Colors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(Object.entries(JUDGMENT_STYLES) as [Judgment, typeof JUDGMENT_STYLES[Judgment]][]).map(
              ([key, { label, color, rgb }]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-full border border-white/10"
                      style={{ backgroundColor: `rgb(${rgb})` }}
                    />
                    <span className={color}>{label}</span>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    rgb({rgb})
                  </span>
                </div>
              ),
            )}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full border border-white/10"
                  style={{ backgroundColor: "rgb(80, 80, 80)" }}
                />
                <span className="text-muted-foreground">Pending (no judgment yet)</span>
              </div>
              <span className="text-muted-foreground font-mono text-xs">rgb(80, 80, 80)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Send judgment commands manually to test LED colors without an active osu! session.
            Requires the drum to be in tosu mode.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={!isConnected || !isTosuModeActive}
              className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
              onClick={() => sendJudgment("great")}
            >
              Great (300)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!isConnected || !isTosuModeActive}
              className="border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
              onClick={() => sendJudgment("ok")}
            >
              Ok (100)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!isConnected || !isTosuModeActive}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => sendJudgment("miss")}
            >
              Miss (0)
            </Button>
          </div>
          {lastJudgment && (
            <p className="text-xs text-muted-foreground">
              Last sent:{" "}
              <span className={JUDGMENT_STYLES[lastJudgment].color}>
                {JUDGMENT_STYLES[lastJudgment].label}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <DebugPanel debug={debug} isWsConnected={isWsConnected} />
    </div>
  );
}
