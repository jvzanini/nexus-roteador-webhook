"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";

// Filtrar apenas componentes de icone (PascalCase, eh componente React)
const ICON_ENTRIES: Array<[string, LucideIcon]> = Object.entries(LucideIcons)
  .filter(
    ([name, component]) =>
      name[0] === name[0].toUpperCase() &&
      name !== "default" &&
      name !== "createLucideIcon" &&
      name !== "Icon" &&
      typeof component === "function" &&
      // Excluir aliases internos
      !name.startsWith("Lucide") &&
      !name.endsWith("Icon")
  ) as Array<[string, LucideIcon]>;

// Icones sugeridos para webhook/integracao (exibidos primeiro)
const SUGGESTED_ICONS = [
  "Webhook",
  "Globe",
  "Send",
  "Zap",
  "Radio",
  "Plug",
  "Link",
  "ArrowRightLeft",
  "RefreshCw",
  "MessageSquare",
  "Bell",
  "Shield",
  "Server",
  "Cloud",
  "Database",
  "Code",
  "Terminal",
  "Bot",
  "Workflow",
  "GitBranch",
];

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  disabled?: boolean;
}

export function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const SelectedIcon = useMemo(() => {
    const entry = ICON_ENTRIES.find(([name]) => name === value);
    return entry ? entry[1] : LucideIcons.Webhook;
  }, [value]);

  const filteredIcons = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) {
      // Sem busca: mostrar sugeridos primeiro, depois o resto
      const suggested = SUGGESTED_ICONS
        .map((name) => ICON_ENTRIES.find(([n]) => n === name))
        .filter(Boolean) as Array<[string, LucideIcon]>;

      const suggestedNames = new Set(SUGGESTED_ICONS);
      const rest = ICON_ENTRIES.filter(([name]) => !suggestedNames.has(name));

      return [...suggested, ...rest];
    }

    return ICON_ENTRIES.filter(([name]) =>
      name.toLowerCase().includes(query)
    );
  }, [search]);

  const handleSelect = useCallback(
    (iconName: string) => {
      onChange(iconName);
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled}
            className="flex items-center gap-2 h-10"
          />
        }
      >
        <SelectedIcon className="h-5 w-5" />
        <span className="text-sm text-muted-foreground">{value || "Escolher icone"}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Escolher icone</DialogTitle>
        </DialogHeader>

        {/* Campo de busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar icone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Grid de icones */}
        <ScrollArea className="h-[320px]">
          <div className="grid grid-cols-8 gap-1 p-1">
            {filteredIcons.slice(0, 200).map(([name, Icon]) => (
              <motion.button
                key={name}
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelect(name)}
                className={`
                  flex items-center justify-center rounded-md p-2.5
                  transition-colors cursor-pointer
                  ${
                    value === name
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }
                `}
                title={name}
              >
                <Icon className="h-5 w-5" />
              </motion.button>
            ))}
          </div>

          {filteredIcons.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Nenhum icone encontrado para &quot;{search}&quot;
            </div>
          )}

          {filteredIcons.length > 200 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              Mostrando 200 de {filteredIcons.length} icones. Refine sua busca.
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
