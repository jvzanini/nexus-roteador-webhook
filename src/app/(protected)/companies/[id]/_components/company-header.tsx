'use client';

import { motion } from 'framer-motion';
import { Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CompanyStatusBadge } from "../../_components/company-status-badge";
import { EditCompanyDialog } from "./edit-company-dialog";

interface CompanyHeaderProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
  };
}

export function CompanyHeader({ company }: CompanyHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* Breadcrumb */}
      <Link
        href="/companies"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-200 w-fit cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para empresas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {company.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={`Logo ${company.name}`}
              className="w-14 h-14 rounded-xl object-cover border border-zinc-800"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-zinc-400" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {company.name}
              </h1>
              <CompanyStatusBadge isActive={company.isActive} />
            </div>
            <p className="text-sm text-zinc-500 mt-0.5 font-mono">/{company.slug}</p>
          </div>
        </div>

        <EditCompanyDialog company={company} />
      </div>
    </motion.div>
  );
}
