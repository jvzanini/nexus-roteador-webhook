import { Suspense } from 'react';
import { LoginBranding } from '@/components/login/login-branding';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata = {
  title: 'Esqueci minha senha | Nexus Roteador Webhook',
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-1/2 lg:block">
        <LoginBranding />
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Suspense>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
