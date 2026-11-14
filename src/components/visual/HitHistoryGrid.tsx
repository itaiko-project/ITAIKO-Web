import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevice } from "@/context/DeviceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { PAD_COLORS, PAD_NAMES, type PadName } from "@/types";
import { usePadLabels } from "@/i18n/pad-labels";
import { cn } from "@/lib/utils";

const HISTORY_LENGTH = 20;

type HistoryEvent = {
  pads: PadName[];
  id: number;
};

export function HitHistoryGrid() {
  const { t } = useTranslation("monitor");
  const padLabels = usePadLabels();
  const { subscribeHits } = useDevice();
  // History is an array of "events", where each event is a list of pads hit simultaneously
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const seqRef = useRef(0);

  // Record actual input events; visual trigger holds and React batching must not merge hits.
  useEffect(() => subscribeHits(pads => {
    const event = { pads, id: ++seqRef.current };
    setHistory(previous => [...previous, event].slice(-HISTORY_LENGTH));
  }), [subscribeHits]);

  const clearHistory = () => {
      setHistory([]);
      seqRef.current = 0;
  };

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="flex flex-row items-center justify-between py-2 px-0">
        <CardTitle className="text-base">{t("hitHistory.title")}</CardTitle>
        <Button variant="ghost" size="sm" onClick={clearHistory}>
          <Trash2 className="h-4 w-4 mr-2" />
          {t("hitHistory.clear")}
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <div className="min-w-[600px] flex flex-col gap-2">
           {PAD_NAMES.map(padRow => (
             <div key={padRow} className="flex items-center gap-2">
               <div className="w-20 text-xs font-medium text-muted-foreground shrink-0">
                 {padLabels[padRow]}
               </div>
               <div className="flex-1 flex gap-1">
                 {Array.from({ length: HISTORY_LENGTH }).map((_, colIndex) => {
                   const hitEvent = history[colIndex];
                   const isActive = hitEvent?.pads.includes(padRow);
                   
                   return (
                     <div 
                       key={colIndex}
                       className={cn(
                         "h-8 flex-1 rounded-sm border",
                         isActive ? "border-transparent shadow-sm" : "bg-muted/10 border-border/50"
                       )}
                       style={{
                         backgroundColor: isActive ? PAD_COLORS[padRow] : undefined,
                         opacity: isActive ? 1 : undefined,
                         transform: isActive ? "scale(0.95)" : "scale(1)"
                       }}
                     />
                   );
                 })}
               </div>
             </div>
           ))}

           {/* Sequence Numbers */}
           <div className="flex items-center gap-2 mt-1">
             <div className="w-20 shrink-0" /> {/* Spacer for labels */}
             <div className="flex-1 flex gap-1">
                 {Array.from({ length: HISTORY_LENGTH }).map((_, colIndex) => {
                     const event = history[colIndex];
                     return (
                         <div key={colIndex} className="flex-1 text-[9px] text-center text-muted-foreground font-mono">
                             {event ? event.id : ""}
                         </div>
                     );
                 })}
             </div>
           </div>
        </div>
      </CardContent>
    </Card>
  );
}