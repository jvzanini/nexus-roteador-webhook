import { Suspense } from 'react';
import { LoginBranding } from '@/components/login/login-branding';
import { LoginForm } from '@/components/login/login-form';

export const metadata = {
  title: 'Login | Nexus Roteador Webhook',
  description: 'Acesse o painel do Nexus Roteador Webhook',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Lado esquerdo — Branding (hidden no mobile) */}
      <div className="hidden w-1/2 lg:block">
        <LoginBranding />
      </div>

      {/* Lado direito — Formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
