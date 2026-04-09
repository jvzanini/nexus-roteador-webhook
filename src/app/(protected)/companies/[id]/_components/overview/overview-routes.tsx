"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Route, Circle } from "lucide-react";
import { TOTAL_EVENTS } from "@/lib/constants/whatsapp-events";
import type { CompanyOverviewData } from "@/lib/actions/dashboard";

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

interface OverviewRoutesProps {
  routes: CompanyOverviewData["routes"];
  activeRoutes: number;
  totalRoutes: number;
}

export function OverviewRoutes({ routes, activeRoutes, totalRoutes }: OverviewRoutesProps) {
  return (
    <motion.div variants={itemVariants} className="h-full">
      <Card className="bg-card border border-border rounded-xl h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-foreground/80 flex items-center gap-2">
            <Route className="h-4 w-4 text-violet-400" />
            Rotas
            <span className="ml-auto text-xs text-muted-foreground">
              {activeRoutes}/{totalRoutes} ativas
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          {routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rota configurada</p>
          ) : (
            <div className="divide-y divide-border h-full overflow-y-auto">
              {routes.map((route) => (
                <div key={route.id} className="flex items-center gap-2 text-sm py-2 first:pt-0 last:pb-0">
                  <Circle
                    className={`h-2 w-2 fill-current shrink-0 ${route.isActive ? "text-emerald-400" : "text-muted-foreground/60"}`}
                  />
                  <span className={`flex-1 truncate ${route.isActive ? "text-foreground/80" : "text-muted-foreground"}`}>
                    {route.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {route.eventCount}/{TOTAL_EVENTS}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
