'use client';

import { motion } from 'framer-motion';
import { Webhook, Zap, Shield } from 'lucide-react';

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-10 lg:flex">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-4 -top-24 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-4 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-3xl" />
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
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Webhook className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Nexus</h1>
            <p className="text-xs text-zinc-400">Roteador Webhook</p>
          </div>
        </div>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        className="relative z-10 space-y-6"
      >
        <div className="space-y-4">
          <Feature
            icon={<Zap className="h-5 w-5 text-blue-400" />}
            title="Roteamento Inteligente"
            description="Distribua webhooks da Meta para multiplos destinos com filtro por evento."
          />
          <Feature
            icon={<Shield className="h-5 w-5 text-violet-400" />}
            title="Entrega Garantida"
            description="Retry automatico com backoff exponencial e recuperacao de falhas."
          />
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
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
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800/80">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
