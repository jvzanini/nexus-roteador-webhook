'use client';

import { motion } from 'framer-motion';
import { Webhook, Zap, Shield, Activity, ArrowRight } from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' as const },
  },
};

const features = [
  {
    icon: Zap,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    title: 'Roteamento Inteligente',
    description: 'Distribua webhooks da Meta para multiplos destinos com filtro granular por evento.',
  },
  {
    icon: Shield,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10 border-violet-500/20',
    title: 'Entrega Garantida',
    description: 'Retry automatico com backoff exponencial e recuperacao de falhas.',
  },
  {
    icon: Activity,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    title: 'Monitoramento em Tempo Real',
    description: 'Acompanhe cada entrega com logs detalhados e metricas de desempenho.',
  },
];

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden p-12 lg:flex">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[#09090b]" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[600px] w-[600px] rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-[0_0_24px_rgba(37,99,235,0.4)]">
            <Webhook className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nexus</h1>
            <p className="text-xs text-zinc-500">Roteador Webhook</p>
          </div>
        </div>
      </motion.div>

      {/* Hero content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 space-y-10"
      >
        <motion.div variants={itemVariants} className="space-y-4">
          <h2 className="text-4xl font-bold text-white tracking-tight leading-tight">
            Roteie webhooks da Meta
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
              com inteligencia.
            </span>
          </h2>
          <p className="text-base text-zinc-400 max-w-md leading-relaxed">
            Receba, filtre e distribua eventos do WhatsApp Cloud API para multiplos destinos com confiabilidade e controle total.
          </p>
        </motion.div>

        {/* Features */}
        <div className="space-y-4">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${feature.bgColor}`}>
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-200">{feature.title}</p>
                  <ArrowRight className="h-3 w-3 text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </div>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="relative z-10"
      >
        <p className="text-xs text-zinc-600">
          NexusAI360 &copy; {new Date().getFullYear()}. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}
