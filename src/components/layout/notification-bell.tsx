"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, XCircle, AlertTriangle, Info, CheckCheck } from "lucide-react";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/lib/actions/notifications";
import type { NotificationItem } from "@/lib/actions/notifications";

// --- Helpers ---

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const typeConfig = {
  error: { icon: XCircle, color: "text-red-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400" },
  info: { icon: Info, color: "text-violet-400" },
} as const;

const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -4,
    transition: { duration: 0.1, ease: [0.4, 0, 0.2, 1] as const },
  },
} as const;

// --- Component ---

export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Real-time: atualiza contagem ao receber notificacao nova
  useRealtime(useCallback((event) => {
    if (event.type === "notification:new") {
      getUnreadCount().then(setUnreadCount);
      if (isOpen) {
        getNotifications().then((result) => {
          setNotifications(result.items);
          setUnreadCount(result.unreadCount);
        });
      }
    }
  }, [isOpen]));

  // Polling: busca contagem de nao lidas a cada 30s
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Busca notificacoes quando abre o dropdown
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getNotifications();
      setNotifications(result.items);
      setUnreadCount(result.unreadCount);
    } catch {
      // silencioso
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handlers
  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleItemClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      try {
        await markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, isRead: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // silencioso
      }
    }
    setIsOpen(false);
    router.push(notification.link);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silencioso
    }
  };

  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 cursor-pointer hover:bg-accent hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badgeText}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-border bg-card shadow-xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                Notificações
              </h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <CheckCheck className="mr-1 size-3.5" />
                  Marcar todas como lidas
                </Button>
              )}
            </div>

            {/* List */}
            <ScrollArea className="max-h-80">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-5 animate-spin rounded-full border-2 border-border border-t-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Bell className="mb-2 size-6" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.map((notification) => {
                    const config = typeConfig[notification.type];
                    const Icon = config.icon;

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleItemClick(notification)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-all duration-200 cursor-pointer hover:bg-accent/50 ${
                          !notification.isRead
                            ? "border-l-2 border-l-violet-500 bg-accent/20"
                            : "border-l-2 border-l-transparent"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex-shrink-0 ${config.color}`}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={`truncate text-sm font-medium ${
                                notification.isRead
                                  ? "text-muted-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {notification.title}
                            </p>
                            <span className="flex-shrink-0 text-xs text-muted-foreground">
                              {timeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {notification.message}
                          </p>
                          {notification.companyName && (
                            <p className="mt-1 text-xs text-muted-foreground/60">
                              {notification.companyName}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
