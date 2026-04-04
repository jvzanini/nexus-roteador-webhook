'use client';

import { motion } from 'framer-motion';
import { Webhook, Zap, Shield, Activity } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-10 lg:flex">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-4 -top-24 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-4 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-blue-600/5 blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Logo e nome */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
            <Webhook className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nexus</h1>
            <p className="text-xs text-zinc-400">Roteador Webhook</p>
          </div>
        </motion.div>
      </motion.div>

      {/* Features */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 space-y-6"
      >
        <motion.div variants={itemVariants}>
          <Feature
            icon={<Zap className="h-5 w-5 text-blue-400" />}
            title="Roteamento Inteligente"
            description="Distribua webhooks da Meta para multiplos destinos com filtro por evento."
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Feature
            icon={<Shield className="h-5 w-5 text-violet-400" />}
            title="Entrega Garantida"
            description="Retry automatico com backoff exponencial e recuperacao de falhas."
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Feature
            icon={<Activity className="h-5 w-5 text-emerald-400" />}
            title="Monitoramento em Tempo Real"
            description="Acompanhe cada entrega com logs detalhados e metricas de desempenho."
          />
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="relative z-10"
      >
        <p className="text-xs text-zinc-500">
          NexusAI360 &copy; {new Date().getFullYear()}. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80 border border-zinc-700/50">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
