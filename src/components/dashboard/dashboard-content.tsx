'use client';

import { motion } from 'framer-motion';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface DashboardContentProps {
  userName: string;
  isSuperAdmin?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

const metrics = [
  {
    label: 'Total Webhooks',
    value: '1.248',
    icon: Webhook,
    trend: '+12%',
    trendUp: true,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  {
    label: 'Entregues',
    value: '1.190',
    icon: CheckCircle2,
    trend: '+8%',
    trendUp: true,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
  {
    label: 'Falhas',
    value: '58',
    icon: XCircle,
    trend: '-3%',
    trendUp: false,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
  },
  {
    label: 'Taxa de Sucesso',
    value: '95.3%',
    icon: TrendingUp,
    trend: '+2.1%',
    trendUp: true,
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-400',
  },
];

const recentWebhooks = [
  { id: '1', event: 'messages', route: 'N8N Producao', status: 'delivered' as const, time: '2 min atras', duration: '120ms' },
  { id: '2', event: 'message_status', route: 'Chatwoot', status: 'delivered' as const, time: '5 min atras', duration: '89ms' },
  { id: '3', event: 'messages', route: 'N8N Producao', status: 'failed' as const, time: '8 min atras', duration: '30012ms' },
  { id: '4', event: 'message_status', route: 'Webhook Custom', status: 'delivered' as const, time: '12 min atras', duration: '201ms' },
  { id: '5', event: 'messages', route: 'N8N Producao', status: 'delivered' as const, time: '15 min atras', duration: '156ms' },
  { id: '6', event: 'messages', route: 'Chatwoot', status: 'pending' as const, time: '18 min atras', duration: '-' },
  { id: '7', event: 'message_status', route: 'N8N Producao', status: 'delivered' as const, time: '22 min atras', duration: '98ms' },
  { id: '8', event: 'messages', route: 'Webhook Custom', status: 'delivered' as const, time: '25 min atras', duration: '145ms' },
  { id: '9', event: 'messages', route: 'N8N Producao', status: 'failed' as const, time: '30 min atras', duration: '30001ms' },
  { id: '10', event: 'message_status', route: 'Chatwoot', status: 'delivered' as const, time: '35 min atras', duration: '112ms' },
];

const statusConfig = {
  delivered: { label: 'Entregue', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  failed: { label: 'Falhou', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  pending: { label: 'Pendente', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
};

export function DashboardContent({ userName, isSuperAdmin }: DashboardContentProps) {
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Ola, {userName}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 capitalize">{today}</p>
      </motion.div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <motion.div key={metric.label} variants={itemVariants}>
            <Card className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 rounded-xl cursor-default">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg ${metric.iconBg}`}>
                    <metric.icon className={`h-5 w-5 ${metric.iconColor}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${metric.trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {metric.trendUp ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {metric.trend}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-white tabular-nums">{metric.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">{metric.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Recent Webhooks */}
      <motion.div variants={itemVariants}>
        <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                Webhooks Recentes
              </CardTitle>
              <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700">
                Ultimas 24h
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-b-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-500 text-xs font-medium h-9">Evento</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-medium h-9">Rota</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-medium h-9">Status</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Duracao</TableHead>
                    <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentWebhooks.map((webhook) => {
                    const status = statusConfig[webhook.status];
                    return (
                      <TableRow key={webhook.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="font-mono text-xs border-zinc-700 text-zinc-300">
                            {webhook.event}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-400 py-2.5">{webhook.route}</TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className={`text-xs ${status.className}`}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-zinc-500 py-2.5">{webhook.duration}</TableCell>
                        <TableCell className="text-right text-xs text-zinc-500 py-2.5">
                          <span className="flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" />
                            {webhook.time}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
