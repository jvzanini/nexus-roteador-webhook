"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * Inicializa o tema do usuario a partir do banco APENAS uma vez no mount.
 * Depois disso, next-themes cuida do resto via localStorage.
 *
 * Não reagir a mudanças de `theme` prop para evitar flicker quando server
 * component re-renderiza com valor stale do NextAuth JWT.
 */
export function ThemeInitializer({ theme }: { theme: string | null }) {
  const { setTheme } = useTheme();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (theme && !hasInitialized.current) {
      setTheme(theme);
      hasInitialized.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
