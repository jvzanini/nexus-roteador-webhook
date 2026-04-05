"use client";

import { useEffect, useRef, useCallback } from "react";
import type { RealtimeEvent } from "@/lib/realtime";

type EventHandler = (event: RealtimeEvent) => void;

export function useRealtime(onEvent: EventHandler) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const connect = useCallback(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent;
        handlerRef.current(event);
      } catch {
        // Ignorar mensagens malformadas
      }
    };

    eventSource.onerror = () => {
      // Reconectar após 5s em caso de erro
      eventSource.close();
      setTimeout(() => {
        connect();
      }, 5000);
    };

    return eventSource;
  }, []);

  useEffect(() => {
    const es = connect();
    return () => es.close();
  }, [connect]);
}
