import { Suspense } from 'react';
import { LoginBranding } from '@/components/login/login-branding';
import { ResetPasswordForm } from './reset-password-form';

export const metadata = {
  title: 'Redefinir senha | Nexus Roteador Webhook',
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-1/2 lg:block">
        <LoginBranding />
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
