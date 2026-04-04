"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { isHeaderAllowed } from "@/lib/constants/header-whitelist";

export interface HeaderEntry {
  key: string;
  value: string;
}

interface RouteHeaderFieldsProps {
  headers: HeaderEntry[];
  onChange: (headers: HeaderEntry[]) => void;
  disabled?: boolean;
  maxHeaders?: number;
}

export function RouteHeaderFields({
  headers,
  onChange,
  disabled = false,
  maxHeaders = 20,
}: RouteHeaderFieldsProps) {
  const addHeader = useCallback(() => {
    if (headers.length >= maxHeaders) return;
    onChange([...headers, { key: "", value: "" }]);
  }, [headers, onChange, maxHeaders]);

  const removeHeader = useCallback(
    (index: number) => {
      onChange(headers.filter((_, i) => i !== index));
    },
    [headers, onChange]
  );

  const updateHeader = useCallback(
    (index: number, field: "key" | "value", newValue: string) => {
      const updated = headers.map((h, i) =>
        i === index ? { ...h, [field]: newValue } : h
      );
      onChange(updated);
    },
    [headers, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Headers Customizados</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addHeader}
          disabled={disabled || headers.length >= maxHeaders}
          className="text-xs"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar header
        </Button>
      </div>

      <AnimatePresence mode="popLayout">
        {headers.map((header, index) => {
          const isBlocked = header.key.trim() !== "" && !isHeaderAllowed(header.key);
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-start gap-2"
            >
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="X-Custom-Header"
                  value={header.key}
                  onChange={(e) => updateHeader(index, "key", e.target.value)}
                  disabled={disabled}
                  className={isBlocked ? "border-destructive" : ""}
                />
                {isBlocked && (
                  <p className="text-xs text-destructive">
                    Header &quot;{header.key}&quot; eh bloqueado pelo sistema
                  </p>
                )}
              </div>
              <div className="flex-1">
                <Input
                  placeholder="valor"
                  value={header.value}
                  onChange={(e) => updateHeader(index, "value", e.target.value)}
                  disabled={disabled}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHeader(index)}
                disabled={disabled}
                className="mt-0.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {headers.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border/50 rounded-lg">
          Nenhum header customizado. Clique em &quot;Adicionar header&quot; para incluir.
        </p>
      )}

      {headers.length >= maxHeaders && (
        <p className="text-xs text-muted-foreground">
          Limite de {maxHeaders} headers atingido.
        </p>
      )}
    </div>
  );
}
