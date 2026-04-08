# Módulo: Toast

## Resumo
Sistema de notificação visual customizado baseado no Sonner v2 com pilha bottom-up, timers independentes por toast e progress bar animada. O componente substitui o comportamento padrão do Sonner usando um `MutationObserver` que intercepta mudanças no DOM e aplica estilos inline via JavaScript, garantindo controle total sobre posicionamento, animações de entrada/saída e independência de hover entre toasts.

## Dependências
- **Obrigatórias:** nenhuma (módulo independente, puramente UI)
- **Serviços:** nenhum

## Pacotes npm
- `sonner` — versão `^2.0.7`
- `next-themes` — necessário para sincronizar o tema dark/light/system com o Sonner
- `lucide-react` — ícones customizados para cada tipo de toast (success, info, warning, error, loading)

## Schema Prisma
Nenhum. Módulo puramente de interface.

## Variáveis de ambiente
Nenhuma.

## Arquivos a criar
- `src/components/ui/sonner.tsx`

## Componente

### Arquivo: `src/components/ui/sonner.tsx`

O componente `Toaster` é um wrapper do `Sonner` que adiciona três camadas de customização: MutationObserver para controle de layout, estilos inline via JavaScript e configuração declarativa via props.

### Imports necessários

```tsx
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useEffect, useCallback, useRef } from "react"
```

### MutationObserver — controle de layout e animações

O coração da customização é a função `applyStackStyles`, invocada automaticamente pelo `MutationObserver` sempre que o DOM do toaster muda. O observer monitora atributos específicos do Sonner:

```tsx
const observer = new MutationObserver(applyStackStyles)
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-sonner-toast', 'data-mounted', 'data-front', 'data-expanded', 'data-removed', 'data-visible'],
})
```

**Atributos monitorados:**
- `data-sonner-toast` — identifica elementos toast
- `data-mounted` — toast montado no DOM
- `data-front` — toast na frente da pilha
- `data-expanded` — pilha expandida
- `data-removed` — toast marcado para remoção (dispara animação de saída)
- `data-visible` — visibilidade do toast (false = `display: none`)

### Rastreamento de toasts processados

Um `useRef<Set<Element>>` chamado `processedToasts` rastreia quais elementos já receberam animação de entrada. Isso evita reaplicar a animação slide-up em toasts que já estão visíveis quando o observer dispara novamente.

```tsx
const processedToasts = useRef(new Set<Element>())
```

### Pilha bottom-up via flex column-reverse

O `<ol>` do Sonner recebe estilos inline para inverter a ordem visual dos toasts. Novos toasts aparecem embaixo, empurrando os anteriores para cima:

```tsx
const ol = toaster.querySelector('ol') as HTMLElement | null
if (ol) {
  ol.style.setProperty('display', 'flex', 'important')
  ol.style.setProperty('flex-direction', 'column-reverse', 'important')
  ol.style.setProperty('gap', '0', 'important')
  ol.style.setProperty('padding', '0', 'important')
  ol.style.setProperty('pointer-events', 'none', 'important')
}
```

O `pointer-events: none` no `<ol>` é crucial: impede que o hover sobre o container da lista pause todos os toasts simultaneamente (comportamento padrão do Sonner, que usa hover no container pai para pausar timers).

### Timers independentes via pointer-events

Cada `<li>` (toast individual) recebe `pointer-events: auto`, restaurando a interatividade apenas no nível do toast individual:

```tsx
el.style.setProperty('pointer-events', 'auto', 'important')
```

**Resultado:** quando o mouse passa sobre um toast específico, apenas aquele toast pausa seu timer. Os demais continuam contando normalmente.

### Animação de entrada — slide-up com spring

Toasts novos (não presentes no `processedToasts` Set) recebem uma animação de entrada em dois frames:

1. **Frame 1:** posiciona o toast 80px abaixo com opacidade 0, sem transição
2. **Frame 2 (via double `requestAnimationFrame`):** aplica `transform: none` e `opacity: 1` com transição spring

```tsx
if (isNew) {
  processedToasts.current.add(el)
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
}
```

**Curva de animação:** `cubic-bezier(0.21, 1.02, 0.73, 1)` — efeito spring que ultrapassa levemente a posição final antes de assentar.

O double `requestAnimationFrame` garante que o browser processe o estado inicial (translateY + opacity 0) antes de iniciar a transição, evitando que o CSS otimize e pule a animação.

### Animação de saída — colapso suave

Quando `data-removed="true"`, o toast colapsa suavemente:

```tsx
if (isRemoved) {
  el.style.setProperty('transition', 'opacity 0.3s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
  el.style.setProperty('opacity', '0', 'important')
  el.style.setProperty('height', '0', 'important')
  el.style.setProperty('padding-top', '0', 'important')
  el.style.setProperty('padding-bottom', '0', 'important')
  el.style.setProperty('margin', '0', 'important')
  el.style.setProperty('overflow', 'hidden', 'important')
  processedToasts.current.delete(el)
  return
}
```

A animação reduz height, padding e margin para zero enquanto faz fade-out, eliminando o "salto" visual quando um toast desaparece da pilha.

### Estilos base de cada toast

Toasts visíveis recebem:

```tsx
el.style.setProperty('position', 'relative', 'important')
el.style.setProperty('bottom', 'auto', 'important')
el.style.setProperty('left', 'auto', 'important')
el.style.setProperty('right', 'auto', 'important')
el.style.setProperty('height', 'auto', 'important')
el.style.setProperty('overflow', 'hidden', 'important')
el.style.setProperty('margin-bottom', i < toasts.length - 1 ? '10px' : '0', 'important')
el.style.setProperty('margin-top', '0', 'important')
```

O `position: relative` sobrescreve o `position: absolute` padrão do Sonner, permitindo que o flex column-reverse controle o layout.

### Visibilidade dos filhos

Todos os elementos filhos de cada toast recebem `opacity: 1` para garantir visibilidade, sobrescrevendo qualquer estilo de ocultação do Sonner:

```tsx
Array.from(el.children).forEach((child) => {
  ;(child as HTMLElement).style.setProperty('opacity', '1', 'important')
})
```

### Configuração declarativa do Sonner

```tsx
<Sonner
  theme={theme as ToasterProps["theme"]}
  className="toaster group"
  closeButton
  visibleToasts={4}
  gap={12}
  position="bottom-right"
  icons={{
    success: <CircleCheckIcon className="size-4" />,
    info: <InfoIcon className="size-4" />,
    warning: <TriangleAlertIcon className="size-4" />,
    error: <OctagonXIcon className="size-4" />,
    loading: <Loader2Icon className="size-4 animate-spin" />,
  }}
  style={{
    "--normal-bg": "var(--popover)",
    "--normal-text": "var(--popover-foreground)",
    "--normal-border": "var(--border)",
    "--border-radius": "var(--radius)",
  } as React.CSSProperties}
  toastOptions={{
    classNames: {
      toast: "cn-toast",
      title: "!text-sm !font-medium",
      description: "!text-xs !text-muted-foreground",
    },
    duration: 4000,
  }}
/>
```

**Configurações principais:**
- `closeButton` — botão X em cada toast
- `visibleToasts={4}` — máximo 4 toasts visíveis simultaneamente
- `gap={12}` — espaçamento entre toasts (complementado pelo margin-bottom de 10px via JS)
- `position="bottom-right"` — canto inferior direito
- `duration: 4000` — 4 segundos (sincronizado com a animação CSS `toast-shrink`)
- Cores via CSS custom properties do tema (dark/light automaticamente)
- Classe `cn-toast` aplicada a cada toast para targeting via CSS

## CSS necessário

### Arquivo: `src/app/globals.css`

Adicionar o bloco completo abaixo na seção de estilos globais:

```css
/* ===== TOAST NOTIFICATIONS ===== */
/* Posicionamento e visibilidade controlados via JS (sonner.tsx MutationObserver) */

/* Progress bar no rodapé */
[data-sonner-toaster] [data-sonner-toast]::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.5), rgba(168, 85, 247, 0.5));
  border-radius: 0 0 12px 12px;
  animation: toast-shrink 4s linear forwards;
  pointer-events: none;
  z-index: 10;
}

[data-sonner-toaster] [data-sonner-toast]:hover::before {
  animation-play-state: paused;
}

@keyframes toast-shrink {
  from { width: 100%; }
  to { width: 0%; }
}

/* Close button dentro do toast (top-right, circulo com fundo) */
[data-sonner-toaster] [data-sonner-toast] [data-close-button] {
  position: absolute !important;
  top: 6px !important;
  right: 6px !important;
  left: auto !important;
  bottom: auto !important;
  width: 20px !important;
  height: 20px !important;
  min-width: 20px !important;
  min-height: 20px !important;
  padding: 0 !important;
  margin: 0 !important;
  border-radius: 50% !important;
  background: var(--muted) !important;
  border: 1px solid var(--border) !important;
  color: var(--muted-foreground) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  opacity: 0.7 !important;
  cursor: pointer !important;
  z-index: 50 !important;
  transform: none !important;
  inset: auto !important;
  top: 6px !important;
  right: 6px !important;
  transition: opacity 0.15s, background 0.15s !important;
}

[data-sonner-toaster] [data-sonner-toast] [data-close-button]:hover {
  opacity: 1 !important;
  background: var(--accent) !important;
  color: var(--foreground) !important;
}

[data-sonner-toaster] [data-sonner-toast] [data-close-button] svg {
  width: 10px !important;
  height: 10px !important;
}
```

### Detalhes do CSS

**Progress bar (`::before`):**
- Barra de 2px de altura na base do toast
- Gradiente roxo (cor primária Nexus AI): `rgba(124, 58, 237, 0.5)` para `rgba(168, 85, 247, 0.5)`
- Animação `toast-shrink` reduz a largura de 100% para 0% em 4 segundos (linear)
- Duração sincronizada com `duration: 4000` do Sonner
- `animation-play-state: paused` no hover — a barra para quando o mouse está sobre o toast
- `pointer-events: none` — a barra não interfere nos cliques

**Close button (`[data-close-button]`):**
- Posição absoluta no canto superior direito (6px de margem)
- Círculo de 20x20px com fundo `var(--muted)` e borda `var(--border)`
- Ícone SVG de 10x10px
- Opacidade 0.7, aumenta para 1.0 no hover
- No hover, fundo muda para `var(--accent)` e cor para `var(--foreground)`
- Todos os `!important` são necessários para sobrescrever os estilos inline do Sonner

**Por que tantos `!important`:**
O Sonner aplica estilos inline via JavaScript internamente. Para sobrescrever estilos inline, CSS externo precisa de `!important`. Essa é a razão pela qual tanto o CSS quanto o `applyStackStyles` usam `setProperty(..., 'important')` — é uma guerra necessária contra o Sonner padrão.

## Integração (o que muda em arquivos existentes)

| Arquivo | Mudança |
|---------|---------|
| `src/app/layout.tsx` | Importar `Toaster` de `@/components/ui/sonner` e renderizar `<Toaster />` dentro do `<Providers>`, após `{children}` |
| `src/app/globals.css` | Adicionar bloco CSS completo de toast (progress bar, close button, keyframes) |

### Exemplo de integração no layout

```tsx
// src/app/layout.tsx
import { Toaster } from "@/components/ui/sonner"
import { Providers } from "@/components/providers/theme-provider"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
```

O `<Toaster />` deve estar dentro do `<Providers>` (que inclui o `ThemeProvider` do next-themes) para que o hook `useTheme()` funcione corretamente.

## Como usar

Importar `toast` do pacote `sonner` em qualquer Client Component:

```tsx
import { toast } from "sonner"

// Sucesso
toast.success("Rota criada com sucesso")

// Erro
toast.error("Erro ao salvar rota")

// Informação
toast.info("Verificação enviada por e-mail")

// Aviso
toast.warning("Credenciais expiradas")

// Loading (com ícone de spin)
toast.loading("Processando...")

// Com descrição
toast.success("Perfil atualizado", {
  description: "As alterações foram salvas"
})

// Duração customizada (ms)
toast.error("Falha crítica", {
  duration: 8000
})
```

**Observacao:** o import `toast` vem diretamente do pacote `sonner`, nao do componente customizado. O componente `Toaster` apenas configura a renderizacao; a funcao `toast()` e global.

## Referência no Nexus

| Arquivo | Descrição |
|---------|-----------|
| `src/components/ui/sonner.tsx` | Componente Toaster customizado com MutationObserver |
| `src/app/globals.css` | CSS de progress bar, close button e keyframes (linhas 122-188) |
| `src/app/layout.tsx` | Montagem do `<Toaster />` no root layout |

## Customizações por plataforma

| Configuração | Valor | Onde alterar |
|-------------|-------|-------------|
| Duração padrão | 4000ms (4s) | `sonner.tsx` → `toastOptions.duration` |
| Duração da progress bar | 4s | `globals.css` → `animation: toast-shrink 4s` |
| Posição | bottom-right | `sonner.tsx` → `position` prop |
| Máximo visível | 4 toasts | `sonner.tsx` → `visibleToasts` prop |
| Cor da progress bar | Gradiente roxo Nexus AI | `globals.css` → `background: linear-gradient(...)` |
| Cores de fundo/texto/borda | Via CSS variables do tema | `sonner.tsx` → `style` prop |
| Ícones por tipo | Lucide React | `sonner.tsx` → `icons` prop |
| Espaçamento entre toasts | 10px | `sonner.tsx` → `applyStackStyles` margin-bottom |
| Curva de animação entrada | cubic-bezier(0.21, 1.02, 0.73, 1) | `sonner.tsx` → `applyStackStyles` transition |
| Deslocamento de entrada | 80px (translateY) | `sonner.tsx` → `applyStackStyles` |

**Sincronização obrigatória:** a duração do `toastOptions.duration` e da animação CSS `toast-shrink` devem ser iguais para que a progress bar termine exatamente quando o toast desaparece.

## Segurança

N/A — módulo puramente de interface, sem acesso a dados sensíveis, APIs ou banco de dados.
