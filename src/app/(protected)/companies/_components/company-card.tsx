"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Copy, Check, ExternalLink, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    };
    credential: { id: string } | null;
  };
}

export function CompanyCard({ company }: CompanyCardProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/${company.webhookKey}`;

  async function handleCopyWebhookUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 rounded-xl group">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={`Logo ${company.name}`}
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-zinc-400" />
            </div>
          )}
          <div>
            <Link
              href={`/companies/${company.id}`}
              className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors duration-200 cursor-pointer"
            >
              {company.name}
            </Link>
            <p className="text-xs text-zinc-500 font-mono">/{company.slug}</p>
          </div>
        </div>
        <CompanyStatusBadge isActive={company.isActive} />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Webhook URL */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <code className="text-xs text-zinc-400 truncate flex-1 font-mono">
            {webhookUrl}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 cursor-pointer transition-all duration-200 hover:bg-zinc-700"
            onClick={handleCopyWebhookUrl}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-zinc-400" />
            )}
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {company._count.memberships} membros
          </span>
          <span className="flex items-center gap-1">
            {company.credential ? (
              <span className="text-emerald-400">Credenciais configuradas</span>
            ) : (
              <span className="text-amber-400">Sem credenciais</span>
            )}
          </span>
        </div>

        {/* Link */}
        <Link
          href={`/companies/${company.id}`}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors duration-200 cursor-pointer"
        >
          <ExternalLink className="h-3 w-3" />
          Gerenciar
        </Link>
      </CardContent>
    </Card>
  );
}
