"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

export function ThemeInitializer({ theme }: { theme: string | null }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
