"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  CheckSquare,
  Square,
  MessageSquare,
  CheckCheck,
  Phone,
  UserCog,
  FileText,
  Briefcase,
  ShieldAlert,
  GitBranch,
  Store,
  Users,
  CreditCard,
  MessageCircle,
  History,
  BarChart3,
  Settings,
  Handshake,
  PauseCircle,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iconMap: Record<string, any> = {
  MessageSquare,
  CheckCheck,
  Phone,
  UserCog,
  FileText,
  Briefcase,
  ShieldAlert,
  GitBranch,
  Store,
  Users,
  CreditCard,
  MessageCircle,
  History,
  BarChart3,
  Settings,
  Handshake,
  PauseCircle,
};
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  WHATSAPP_EVENT_CATEGORIES,
  TOTAL_EVENTS,
  CATEGORY_COLOR_MAP,
  type WhatsAppEventCategory,
} from "@/lib/constants/whatsapp-events";

interface EventChecklistProps {
  selectedEvents: string[];
  onChange: (events: string[]) => void;
  disabled?: boolean;
}

export function EventChecklist({
  selectedEvents,
  onChange,
  disabled = false,
}: EventChecklistProps) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(WHATSAPP_EVENT_CATEGORIES.map((c) => c.id))
  );

  const selectedSet = useMemo(() => new Set(selectedEvents), [selectedEvents]);

  const toggleCategory = useCallback((categoryId: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const toggleEvent = useCallback(
    (eventId: string) => {
      if (disabled) return;
      const next = new Set(selectedSet);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      onChange(Array.from(next));
    },
    [selectedSet, onChange, disabled]
  );

  const toggleAllInCategory = useCallback(
    (category: WhatsAppEventCategory) => {
      if (disabled) return;
      const categoryEventIds = category.events.map((e) => e.id);
      const allSelected = categoryEventIds.every((id) => selectedSet.has(id));

      const next = new Set(selectedSet);
      if (allSelected) {
        categoryEventIds.forEach((id) => next.delete(id));
      } else {
        categoryEventIds.forEach((id) => next.add(id));
      }
      onChange(Array.from(next));
    },
    [selectedSet, onChange, disabled]
  );

  const selectAll = useCallback(() => {
    if (disabled) return;
    if (selectedEvents.length === TOTAL_EVENTS) {
      onChange([]);
    } else {
      onChange(
        WHATSAPP_EVENT_CATEGORIES.flatMap((cat) =>
          cat.events.map((e) => e.id)
        )
      );
    }
  }, [selectedEvents.length, onChange, disabled]);

  const getCategorySelectedCount = useCallback(
    (category: WhatsAppEventCategory) => {
      return category.events.filter((e) => selectedSet.has(e.id)).length;
    },
    [selectedSet]
  );

  return (
    <div className="space-y-3">
      {/* Header com contagem global e botao selecionar todos */}
      <div className="flex items-center justify-between">
        <Badge
          variant={selectedEvents.length > 0 ? "default" : "secondary"}
          className="text-sm"
        >
          {selectedEvents.length}/{TOTAL_EVENTS} eventos
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={selectAll}
          disabled={disabled}
          className="text-xs"
        >
          {selectedEvents.length === TOTAL_EVENTS ? (
            <>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Desmarcar todos
            </>
          ) : (
            <>
              <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
              Selecionar todos
            </>
          )}
        </Button>
      </div>

      {/* Categorias colapsaveis */}
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-2">
          {WHATSAPP_EVENT_CATEGORIES.map((category) => {
            const selectedCount = getCategorySelectedCount(category);
            const totalCount = category.events.length;
            const allSelected = selectedCount === totalCount;
            const isOpen = openCategories.has(category.id);
            const isActive = selectedCount > 0;
            const colors = CATEGORY_COLOR_MAP[category.id];

            return (
              <Collapsible
                key={category.id}
                open={isOpen}
                onOpenChange={() => toggleCategory(category.id)}
              >
                <div className={`rounded-lg border overflow-hidden transition-colors ${
                  isActive && colors
                    ? `${colors.border} ${colors.bg}`
                    : "border-border/50 bg-card/50"
                }`}>
                  {/* Header da categoria */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => toggleAllInCategory(category)}
                      disabled={disabled}
                      className="data-[state=checked]:bg-primary"
                    />
                    <CollapsibleTrigger
                      render={
                        <button
                          type="button"
                          className="flex flex-1 items-center justify-between text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
                        />
                      }
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {(() => {
                          const IconComp = iconMap[category.icon];
                          return IconComp ? (
                            <IconComp className={`h-4 w-4 shrink-0 transition-colors ${
                              isActive && colors ? colors.icon : "text-muted-foreground"
                            }`} />
                          ) : null;
                        })()}
                        <div className="flex flex-col items-start min-w-0">
                          <span>{category.label}</span>
                          {category.description && (
                            <span className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">
                              {category.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={selectedCount > 0 ? "default" : "outline"}
                          className="text-xs tabular-nums"
                        >
                          {selectedCount}/{totalCount}
                        </Badge>
                        <motion.div
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                    </CollapsibleTrigger>
                  </div>

                  {/* Lista de eventos */}
                  <AnimatePresence>
                    {isOpen && (
                      <CollapsibleContent>
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-border/30 px-3 py-2 space-y-1">
                            {category.events.map((event) => (
                              <label
                                key={event.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                              >
                                <Checkbox
                                  checked={selectedSet.has(event.id)}
                                  onCheckedChange={() => toggleEvent(event.id)}
                                  disabled={disabled}
                                />
                                <div className="flex flex-col">
                                  <span className="text-foreground">
                                    {event.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {event.id}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </motion.div>
                      </CollapsibleContent>
                    )}
                  </AnimatePresence>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
