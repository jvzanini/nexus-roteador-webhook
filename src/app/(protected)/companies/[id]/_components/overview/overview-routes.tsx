"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Route, Circle } from "lucide-react";
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
    <motion.div variants={itemVariants}>
      <Card className="bg-zinc-900 border border-zinc-800 rounded-xl h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Route className="h-4 w-4 text-violet-400" />
            Rotas
            <span className="ml-auto text-xs text-zinc-500">
              {activeRoutes}/{totalRoutes} ativas
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma rota configurada</p>
          ) : (
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {routes.map((route) => (
                <div key={route.id} className="flex items-center gap-2 text-sm">
                  <Circle
                    className={`h-2 w-2 fill-current ${route.isActive ? "text-emerald-400" : "text-zinc-600"}`}
                  />
                  <span className={route.isActive ? "text-zinc-300" : "text-zinc-500"}>
                    {route.name}
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
