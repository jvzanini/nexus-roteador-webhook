"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
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
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      <div className="flex items-center gap-2 p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
        <code className="text-sm text-zinc-300 truncate flex-1 font-mono">
          {displayValue}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggle}
            disabled={isPending}
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </Button>
          {revealed && revealedValue && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
