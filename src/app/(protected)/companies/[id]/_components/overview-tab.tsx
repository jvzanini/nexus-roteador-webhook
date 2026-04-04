"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Globe, Key, Users, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OverviewTabProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

export function OverviewTab({ company }: OverviewTabProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhook/${company.webhookKey}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Webhook URL Card */}
      <motion.div variants={itemVariants}>
        <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-400" />
              URL do Webhook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <code className="text-sm text-zinc-200 truncate flex-1 font-mono">
                {webhookUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 cursor-pointer transition-all duration-200 hover:bg-zinc-700"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4 text-zinc-400" />
                )}
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Configure esta URL no painel do Meta App como Webhook Callback URL.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={itemVariants}>
          <Card className="bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {company._count.memberships}
                  </p>
                  <p className="text-xs text-zinc-500">Membros</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-violet-500/10">
                  <Route className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {company._count.routes}
                  </p>
                  <p className="text-xs text-zinc-500">Rotas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all duration-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${company.credential ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                  <Key className={`h-5 w-5 ${company.credential ? "text-emerald-400" : "text-amber-400"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {company.credential ? "Configuradas" : "Pendentes"}
                  </p>
                  <p className="text-xs text-zinc-500">Credenciais Meta</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Info */}
      <motion.div variants={itemVariants}>
        <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-300">
              Informacoes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Slug</span>
              <span className="text-zinc-300 font-mono">/{company.slug}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Webhook Key</span>
              <span className="text-zinc-300 font-mono">{company.webhookKey}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Criada em</span>
              <span className="text-zinc-300">
                {new Date(company.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
