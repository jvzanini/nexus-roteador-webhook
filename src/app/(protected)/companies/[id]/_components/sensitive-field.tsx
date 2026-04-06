"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealCredentialField } from "@/lib/actions/credential";

interface SensitiveFieldProps {
  label: string;
  maskedValue: string;
  companyId: string;
  fieldName: "metaAppSecret" | "verifyToken" | "accessToken";
}

export function SensitiveField({
  label,
  maskedValue,
  companyId,
  fieldName,
}: SensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (revealed) {
      setRevealed(false);
      setRevealedValue(null);
      return;
    }

    startTransition(async () => {
      const result = await revealCredentialField(companyId, fieldName);
      if (result.success && result.data) {
        setRevealedValue(result.data);
        setRevealed(true);
      }
    });
  }

  async function handleCopy() {
    const valueToCopy = revealedValue ?? maskedValue;
    await navigator.clipboard.writeText(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayValue = revealed && revealedValue ? revealedValue : maskedValue;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
        <code className="text-sm text-foreground/80 truncate flex-1 font-mono">
          {displayValue}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer transition-all duration-200 hover:bg-accent"
            onClick={handleToggle}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            ) : revealed ? (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          {revealed && revealedValue && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer transition-all duration-200 hover:bg-accent"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
