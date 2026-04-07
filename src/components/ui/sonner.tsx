"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useEffect } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // Forcar estilos de empilhamento no container <ol> do Sonner via JS
  // porque CSS externo nao consegue sobrescrever os inline styles do Sonner
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const toaster = document.querySelector('[data-sonner-toaster]')
      if (!toaster) return
      const ol = toaster.querySelector('ol')
      if (ol) {
        ol.style.display = 'flex'
        ol.style.flexDirection = 'column-reverse'
        ol.style.gap = '12px'
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    // Aplicar imediatamente tambem
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (toaster) {
      const ol = toaster.querySelector('ol') as HTMLElement | null
      if (ol) {
        ol.style.display = 'flex'
        ol.style.flexDirection = 'column-reverse'
        ol.style.gap = '12px'
      }
    }

    return () => observer.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      expand
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
        style: {
          position: 'relative',
          bottom: 'auto',
          transform: 'none',
          height: 'auto',
          opacity: 1,
        } as React.CSSProperties,
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
