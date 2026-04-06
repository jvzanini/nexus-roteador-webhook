'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col items-center justify-center overflow-hidden lg:flex">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-[#09090b] to-purple-950" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[600px] w-[600px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-purple-600/8 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[100px]" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Centered logo + text */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Logo with glow ring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' as const }}
          className="relative"
        >
          {/* Animated glow ring */}
          <motion.div
            className="absolute -inset-4 rounded-3xl"
            animate={{
              boxShadow: [
                '0 0 40px 8px rgba(139,92,246,0.25)',
                '0 0 60px 16px rgba(139,92,246,0.40)',
                '0 0 40px 8px rgba(139,92,246,0.25)',
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut' as const,
            }}
          />
          <Image
            src="/logo-nexus-ai.png"
            alt="Nexus AI"
            width={120}
            height={120}
            className="relative rounded-2xl"
            priority
          />
        </motion.div>

        {/* Brand name */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' as const }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold text-white tracking-tight">Nexus AI</h1>
          <p className="text-base text-zinc-400 mt-2">Roteador de Webhooks</p>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.0 }}
        className="absolute bottom-8 z-10"
      >
        <p className="text-xs text-zinc-600">
          NexusAI360 &copy; {new Date().getFullYear()}. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}
