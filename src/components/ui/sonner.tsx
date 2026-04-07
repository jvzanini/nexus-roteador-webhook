"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, toast as sonnerToast, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useEffect, useCallback, useRef } from "react"

interface ToastTimer {
  remaining: number
  startTime: number
  timeout: ReturnType<typeof setTimeout> | null
}

const TOAST_DURATION = 4000

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const processedToasts = useRef(new Set<string>())
  const toastTimers = useRef(new Map<string, ToastTimer>())
  const listenersAttached = useRef(new Set<string>())

  // Iniciar timer individual para um toast
  const startTimer = useCallback((toastId: string, remaining?: number) => {
    const timer = toastTimers.current.get(toastId)
    const timeLeft = remaining ?? timer?.remaining ?? TOAST_DURATION

    // Limpar timer anterior se existir
    if (timer?.timeout) clearTimeout(timer.timeout)

    const startTime = Date.now()
    const timeout = setTimeout(() => {
      sonnerToast.dismiss(toastId)
      toastTimers.current.delete(toastId)
    }, timeLeft)

    toastTimers.current.set(toastId, { remaining: timeLeft, startTime, timeout })
  }, [])

  // Pausar timer individual
  const pauseTimer = useCallback((toastId: string) => {
    const timer = toastTimers.current.get(toastId)
    if (!timer || !timer.timeout) return

    clearTimeout(timer.timeout)
    const elapsed = Date.now() - timer.startTime
    const remaining = Math.max(0, timer.remaining - elapsed)
    toastTimers.current.set(toastId, { remaining, startTime: 0, timeout: null })
  }, [])

  const applyStackStyles = useCallback(() => {
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (!toaster) return

    // Forcar <ol> como flex column-reverse (mais recente embaixo, antigos sobem)
    const ol = toaster.querySelector('ol') as HTMLElement | null
    if (ol) {
      ol.style.setProperty('display', 'flex', 'important')
      ol.style.setProperty('flex-direction', 'column-reverse', 'important')
      ol.style.setProperty('gap', '0', 'important')
      ol.style.setProperty('padding', '0', 'important')
    }

    const toasts = toaster.querySelectorAll<HTMLElement>('[data-sonner-toast]')
    toasts.forEach((el, i) => {
      const isRemoved = el.getAttribute('data-removed') === 'true'
      const isVisible = el.getAttribute('data-visible') !== 'false'
      const toastId = el.getAttribute('data-sonner-toast') || ''

      // Toast removido: colapsa suave
      if (isRemoved) {
        el.style.setProperty('transition', 'opacity 0.3s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
        el.style.setProperty('opacity', '0', 'important')
        el.style.setProperty('height', '0', 'important')
        el.style.setProperty('padding-top', '0', 'important')
        el.style.setProperty('padding-bottom', '0', 'important')
        el.style.setProperty('margin', '0', 'important')
        el.style.setProperty('overflow', 'hidden', 'important')
        processedToasts.current.delete(toastId)
        listenersAttached.current.delete(toastId)
        if (toastTimers.current.has(toastId)) {
          const timer = toastTimers.current.get(toastId)
          if (timer?.timeout) clearTimeout(timer.timeout)
          toastTimers.current.delete(toastId)
        }
        return
      }

      // Toast invisivel
      if (!isVisible) {
        el.style.setProperty('display', 'none', 'important')
        return
      }

      // Estilos base do toast
      el.style.setProperty('position', 'relative', 'important')
      el.style.setProperty('bottom', 'auto', 'important')
      el.style.setProperty('left', 'auto', 'important')
      el.style.setProperty('right', 'auto', 'important')
      el.style.setProperty('height', 'auto', 'important')
      el.style.setProperty('overflow', 'hidden', 'important')
      el.style.setProperty('margin-bottom', i < toasts.length - 1 ? '10px' : '0', 'important')
      el.style.setProperty('margin-top', '0', 'important')

      // Animacao de entrada para novos toasts
      const isNew = !processedToasts.current.has(toastId)
      if (isNew && toastId) {
        processedToasts.current.add(toastId)
        // Slide-up
        el.style.setProperty('transform', 'translateY(80px)', 'important')
        el.style.setProperty('opacity', '0', 'important')
        el.style.setProperty('transition', 'none', 'important')

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.setProperty('transition', 'transform 0.35s cubic-bezier(0.21, 1.02, 0.73, 1), opacity 0.25s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
            el.style.setProperty('transform', 'none', 'important')
            el.style.setProperty('opacity', '1', 'important')
          })
        })

        // Iniciar timer independente para este toast
        startTimer(toastId)
      } else {
        el.style.setProperty('transform', 'none', 'important')
        el.style.setProperty('opacity', '1', 'important')
        el.style.setProperty('transition', 'transform 0.35s cubic-bezier(0.21, 1.02, 0.73, 1), opacity 0.25s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
      }

      // Listeners de hover individuais (pausar apenas ESTE toast)
      if (toastId && !listenersAttached.current.has(toastId)) {
        listenersAttached.current.add(toastId)

        el.addEventListener('mouseenter', () => {
          pauseTimer(toastId)
          // Pausar progress bar deste toast
          const before = el.querySelector('::before') // nao funciona, usar class
          el.classList.add('toast-hovered')
        })

        el.addEventListener('mouseleave', () => {
          startTimer(toastId)
          el.classList.remove('toast-hovered')
        })
      }

      // Conteudo visivel em todos os filhos
      Array.from(el.children).forEach((child) => {
        ;(child as HTMLElement).style.setProperty('opacity', '1', 'important')
      })
    })
  }, [startTimer, pauseTimer])

  useEffect(() => {
    applyStackStyles()

    const observer = new MutationObserver(applyStackStyles)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sonner-toast', 'data-mounted', 'data-front', 'data-expanded', 'data-removed', 'data-visible'],
    })

    return () => {
      observer.disconnect()
      // Limpar todos os timers
      toastTimers.current.forEach((timer) => {
        if (timer.timeout) clearTimeout(timer.timeout)
      })
    }
  }, [applyStackStyles])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      visibleToasts={4}
      gap={12}
      position="bottom-right"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-muted-foreground",
        },
        duration: Infinity, // Desabilitar timer do Sonner, usar timers proprios
      }}
      {...props}
    />
  )
}

export { Toaster }
