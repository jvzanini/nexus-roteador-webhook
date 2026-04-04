'use client';

import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { CompanyCard } from './company-card';

interface CompanyListProps {
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
    _count: { memberships: number };
    credential: { id: string } | null;
  }>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

export function CompanyList({ companies }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
          <Building2 className="h-7 w-7 text-zinc-500" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-1">
          Nenhuma empresa cadastrada
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Crie sua primeira empresa para comecar a configurar o roteamento de webhooks.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {companies.map((company) => (
        <motion.div key={company.id} variants={itemVariants}>
          <CompanyCard company={company} />
        </motion.div>
      ))}
    </motion.div>
  );
}
