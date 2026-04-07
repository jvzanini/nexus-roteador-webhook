"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useEffect, useCallback } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  const applyStackStyles = useCallback(() => {
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (!toaster) return

    // Forcar <ol> como flex column-reverse (mais recente embaixo)
    const ol = toaster.querySelector('ol') as HTMLElement | null
    if (ol) {
      ol.style.setProperty('display', 'flex', 'important')
      ol.style.setProperty('flex-direction', 'column-reverse', 'important')
      ol.style.setProperty('gap', '12px', 'important')
    }

    // Forcar cada toast como position relative, sem transform, com conteudo visivel
    toaster.querySelectorAll<HTMLElement>('[data-sonner-toast]').forEach((el) => {
      const isRemoved = el.getAttribute('data-removed') === 'true'
      const isVisible = el.getAttribute('data-visible') !== 'false'

      if (isRemoved) {
        el.style.setProperty('opacity', '0', 'important')
        el.style.setProperty('height', '0', 'important')
        el.style.setProperty('padding', '0', 'important')
        el.style.setProperty('margin', '0', 'important')
        el.style.setProperty('overflow', 'hidden', 'important')
        return
      }

      if (!isVisible) {
        el.style.setProperty('display', 'none', 'important')
        return
      }

      el.style.setProperty('position', 'relative', 'important')
      el.style.setProperty('bottom', 'auto', 'important')
      el.style.setProperty('transform', 'none', 'important')
      el.style.setProperty('height', 'auto', 'important')
      el.style.setProperty('opacity', '1', 'important')
      el.style.setProperty('overflow', 'hidden', 'important')

      // Forcar conteudo visivel em todos os filhos
      Array.from(el.children).forEach((child) => {
        ;(child as HTMLElement).style.setProperty('opacity', '1', 'important')
      })
    })
  }, [])

  useEffect(() => {
    // Aplicar imediatamente
    applyStackStyles()

    // Observar mudancas no DOM (novos toasts, mudancas de atributos)
    const observer = new MutationObserver(applyStackStyles)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sonner-toast', 'data-mounted', 'data-front', 'data-expanded', 'data-removed', 'data-visible'],
    })

    return () => observer.disconnect()
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
        duration: 4000,
      }}
      {...props}
    />
  )
}

export { Toaster }
