"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Copy, Check, Users, Key, Route, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyStatusBadge } from "./company-status-badge";

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
    _count: {
      memberships: number;
      routes?: number;
    };
    credential: { id: string } | null;
  };
}

export function CompanyCard({ company }: CompanyCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const webhookPath = `/api/webhook/${company.webhookKey}`;

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${webhookPath}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card
      onClick={() => router.push(`/companies/${company.id}`)}
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all duration-300 rounded-xl cursor-pointer group relative overflow-hidden"
    >
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-blue-600/5 blur-2xl" />
      </div>

      <CardContent className="p-5 relative">
        {/* Header: logo + nome + status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {company.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={`Logo ${company.name}`}
                className="w-11 h-11 rounded-xl object-cover ring-1 ring-zinc-700/50"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-zinc-500" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">
                {company.name}
              </h3>
              <p className="text-xs text-zinc-600 font-mono">/{company.slug}</p>
            </div>
          </div>
          <CompanyStatusBadge isActive={company.isActive} />
        </div>

        {/* Webhook URL */}
        <div
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/40 hover:border-zinc-600 transition-all duration-200 mb-4"
        >
          <code className="text-[11px] text-zinc-500 truncate flex-1 font-mono">
            {webhookPath}
          </code>
          <div className="shrink-0">
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Users className="h-3.5 w-3.5" />
              {company._count.memberships}
            </span>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <Route className="h-3.5 w-3.5" />
              {company._count.routes ?? 0}
            </span>
            <span className="flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" />
              {company.credential ? (
                <span className="text-emerald-500">Ativa</span>
              ) : (
                <span className="text-amber-500">Pendente</span>
              )}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all duration-200" />
        </div>
      </CardContent>
    </Card>
  );
}
