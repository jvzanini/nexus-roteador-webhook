"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearch } from "@/components/layout/search-context";
import {
  Search,
  Loader2,
  Building2,
  Route,
  FileText,
  User,
} from "lucide-react";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "company" | "route" | "log" | "user";
  meta?: string;
}

interface SearchResponse {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

const ICON_MAP = {
  company: Building2,
  route: Route,
  log: FileText,
  user: User,
} as const;

const GROUP_LABELS = {
  companies: "Empresas",
  routes: "Rotas",
  logs: "Logs",
  users: "Usuários",
} as const;

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen, closeSearch } = useSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup do debounce e abort no unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  // Busca com debounce + abort
  const search = useCallback((term: string) => {
    // Limpa debounce anterior
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Menos de 2 chars — limpa resultados
    if (term.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      // Cancela request anterior
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term.trim())}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setResults(null);
          setLoading(false);
          return;
        }
        const data: SearchResponse = await res.json();
        setResults(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    search(value);
  }

  function handleSelect(href: string) {
    closeSearch();
    setQuery("");
    setResults(null);
    // Se já estamos na mesma base path (ex: /companies/xxx), forçar navegação completa
    // para garantir que ?tab= funcione (router.push não re-renderiza tabs)
    const currentPath = window.location.pathname;
    const targetPath = href.split("?")[0];
    if (currentPath === targetPath && href.includes("?")) {
      window.location.href = href;
    } else {
      router.push(href);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setResults(null);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }

  const hasResults = results && (
    results.companies.length > 0 ||
    results.routes.length > 0 ||
    results.logs.length > 0 ||
    results.users.length > 0
  );

  const totalResults = results
    ? results.companies.length + results.routes.length + results.logs.length + results.users.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-[10%] left-1/2 -translate-x-1/2 translate-y-0 max-w-[calc(100%-2rem)] sm:max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 sm:top-[12%]"
      >
        <Command
          className="rounded-2xl overflow-hidden"
          shouldFilter={false}
          loop
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            {loading ? (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <Command.Input
              value={query}
              onValueChange={handleQueryChange}
              placeholder="Buscar empresas, rotas, logs..."
              className="flex-1 bg-transparent py-4 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {query.length > 0 && (
              <kbd className="text-[10px] text-muted-foreground bg-muted/50 border border-border rounded px-1.5 py-0.5 font-mono">
                ESC
              </kbd>
            )}
          </div>

          {/* Resultados */}
          <Command.List className="max-h-[480px] overflow-y-auto overscroll-contain">
            {/* Estado vazio: sem query */}
            {query.trim().length < 2 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Digite para buscar...
              </div>
            )}

            {/* Estado: sem resultados */}
            {query.trim().length >= 2 && !loading && results && !hasResults && (
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum resultado para &ldquo;{query}&rdquo;
              </Command.Empty>
            )}

            {/* Grupos de resultados */}
            {results && hasResults && (
              <>
                {(["companies", "routes", "logs", "users"] as const).map((group) => {
                  const items = results[group];
                  if (items.length === 0) return null;

                  return (
                    <Command.Group
                      key={group}
                      heading={
                        <span className="text-xs font-medium text-muted-foreground px-4 py-2 block">
                          {GROUP_LABELS[group]} ({items.length})
                        </span>
                      }
                    >
                      {items.map((item) => {
                        const Icon = ICON_MAP[item.type];
                        return (
                          <Command.Item
                            key={`${item.type}-${item.id}`}
                            value={`${item.type}-${item.id}`}
                            onSelect={() => handleSelect(item.href)}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer text-sm transition-none data-[selected=true]:bg-accent/50 hover:bg-accent/50"
                          >
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                            </div>
                            {item.meta && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 border border-border rounded px-2 py-0.5 shrink-0">
                                {(item.type === "route" || item.type === "log") && (
                                  <Building2 className="h-3 w-3" />
                                )}
                                {item.meta}
                              </span>
                            )}
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  );
                })}
              </>
            )}
          </Command.List>

          {/* Footer com contagem */}
          {results && hasResults && (
            <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{totalResults} resultado{totalResults !== 1 ? "s" : ""}</span>
              <span>
                <kbd className="bg-muted/50 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
                {" "}navegar{" "}
                <kbd className="bg-muted/50 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↵</kbd>
                {" "}abrir
              </span>
            </div>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
