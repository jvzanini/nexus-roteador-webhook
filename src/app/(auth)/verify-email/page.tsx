import { Suspense } from "react";
import { LoginBranding } from "@/components/login/login-branding";
import { VerifyEmailContent } from "./verify-email-content";

export const metadata = {
  title: "Confirmar e-mail | Nexus Roteador Webhook",
};

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <div className="hidden w-1/2 lg:block">
        <LoginBranding />
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Suspense>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
