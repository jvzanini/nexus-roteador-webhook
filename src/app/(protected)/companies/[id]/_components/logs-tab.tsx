"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LogsTabProps {
  companyId: string;
}

export function LogsTab({ companyId }: LogsTabProps) {
  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="p-4 rounded-full bg-zinc-800">
          <FileText className="h-8 w-8 text-zinc-400" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-zinc-200 font-medium">Logs de Webhook</p>
          <p className="text-sm text-zinc-500">
            Visualize todas as requisicoes recebidas e os resultados de roteamento.
          </p>
        </div>
        <Button
          render={<Link href={`/companies/${companyId}/logs`} />}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
        >
          Ver logs completos
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
