"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { startEmbeddedSignup } from "@/lib/actions/meta-embedded-signup";

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        cb: (resp: { authResponse?: { code?: string }; status: string }) => void,
        opts: {
          config_id: string;
          response_type: string;
          override_default_response_type: boolean;
          extras?: Record<string, unknown>;
        }
      ) => void;
    };
  }
}

interface WASessionData {
  phone_number_id: string;
  waba_id: string;
}

export function EmbeddedSignupButton({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sessionDataRef = useRef<WASessionData | null>(null);

  async function onClick() {
    setLoading(true);
    const messageHandler = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) return;
      try {
        const parsed = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (parsed?.type === "WA_EMBEDDED_SIGNUP" && parsed?.event === "FINISH") {
          sessionDataRef.current = parsed.data;
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("message", messageHandler);

    try {
      const start = await startEmbeddedSignup(companyId);
      if (!start.success) throw new Error(start.error);
      const { appId, configId, state } = start.data!;

      if (!window.FB) throw new Error("LogIn SDK não carregou");
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v20.0" });

      window.FB.login(
        async (resp) => {
          try {
            if (!resp.authResponse?.code) throw new Error("Login cancelado");
            const code = resp.authResponse.code;

            const deadline = Date.now() + 30_000;
            while (!sessionDataRef.current && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 200));
            }
            if (!sessionDataRef.current) throw new Error("Dados Meta não chegaram");

            const { waba_id, phone_number_id } = sessionDataRef.current;
            const res = await fetch("/api/meta/oauth/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId,
                code,
                wabaId: waba_id,
                phoneNumberId: phone_number_id,
                state,
              }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error ?? "Falha");
            toast.success("WhatsApp conectado!");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          } finally {
            window.removeEventListener("message", messageHandler);
            sessionDataRef.current = null;
            setLoading(false);
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        }
      );
    } catch (e) {
      window.removeEventListener("message", messageHandler);
      toast.error(e instanceof Error ? e.message : "Erro");
      setLoading(false);
    }
  }

  return (
    <>
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" />
      <Button onClick={onClick} disabled={loading} variant="default" className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Conectar WhatsApp com LogIn
      </Button>
    </>
  );
}
