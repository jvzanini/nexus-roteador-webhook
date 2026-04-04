import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Esqueci minha senha | Nexus Roteador Webhook',
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-white">
          Esqueci minha senha
        </h1>
        <p className="mt-2 text-zinc-400">
          Esta funcionalidade sera implementada na Fase 3.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </Button>
        </Link>
      </div>
    </div>
  );
}
