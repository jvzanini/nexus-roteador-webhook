import Link from 'next/link';
import { ArrowLeft, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Esqueci minha senha | Nexus Roteador Webhook',
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700">
            <Webhook className="h-6 w-6 text-blue-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Esqueci minha senha
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Esta funcionalidade sera implementada na Fase 3.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white cursor-pointer transition-all duration-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </Button>
        </Link>
      </div>
    </div>
  );
}
