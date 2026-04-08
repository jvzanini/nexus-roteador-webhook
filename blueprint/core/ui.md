# Sistema de UI/Visual -- Nexus Roteador Webhook

Referencia completa do sistema visual: design tokens, temas, layouts, componentes e animacoes.

**Arquivos-chave:**
- `src/app/globals.css` -- todas as CSS custom properties
- `src/components/providers/theme-provider.tsx` -- ThemeProvider (next-themes)
- `src/components/providers/theme-initializer.tsx` -- aplica tema salvo do usuario
- `src/app/(protected)/layout.tsx` -- layout protegido com sidebar
- `src/components/layout/sidebar.tsx` -- sidebar de navegacao
- `src/components/ui/` -- componentes base (shadcn/ui)

---

## 1. Design Tokens

Todas as cores sao definidas como CSS custom properties em `src/app/globals.css`. O Tailwind consome essas variaveis via `@theme inline` no mesmo arquivo.

### 1.1 Background e Foreground

| Variavel        | Light     | Dark      | Uso                              |
|-----------------|-----------|-----------|----------------------------------|
| `--background`  | `#fafafa` | `#09090b` | Fundo geral da aplicacao         |
| `--foreground`  | `#18181b` | `#fafafa` | Texto principal                  |

### 1.2 Card

| Variavel            | Light     | Dark      | Uso                          |
|---------------------|-----------|-----------|------------------------------|
| `--card`            | `#ffffff` | `#18181b` | Fundo de cards e containers  |
| `--card-foreground` | `#18181b` | `#fafafa` | Texto dentro de cards        |

### 1.3 Popover

| Variavel               | Light     | Dark      | Uso                          |
|------------------------|-----------|-----------|------------------------------|
| `--popover`            | `#ffffff` | `#18181b` | Fundo de popovers e dropdowns|
| `--popover-foreground` | `#18181b` | `#fafafa` | Texto em popovers            |

### 1.4 Primary (cor da marca -- violet)

| Variavel               | Light     | Dark      | Uso                                 |
|------------------------|-----------|-----------|-------------------------------------|
| `--primary`            | `#6d28d9` | `#7c3aed` | Cor principal (botoes, links, accent)|
| `--primary-foreground` | `#ffffff` | `#ffffff` | Texto sobre primary                 |

### 1.5 Secondary

| Variavel                  | Light     | Dark      | Uso                          |
|---------------------------|-----------|-----------|------------------------------|
| `--secondary`             | `#f4f4f5` | `#27272a` | Fundo de elementos secundarios|
| `--secondary-foreground`  | `#18181b` | `#fafafa` | Texto sobre secondary        |

### 1.6 Muted

| Variavel              | Light     | Dark      | Uso                              |
|-----------------------|-----------|-----------|----------------------------------|
| `--muted`             | `#f4f4f5` | `#27272a` | Fundo de areas desabilitadas/muted|
| `--muted-foreground`  | `#71717a` | `#a1a1aa` | Texto secundario, placeholders   |

### 1.7 Accent

| Variavel              | Light     | Dark      | Uso                              |
|-----------------------|-----------|-----------|----------------------------------|
| `--accent`            | `#f4f4f5` | `#27272a` | Fundo de hover em menus/items    |
| `--accent-foreground` | `#18181b` | `#fafafa` | Texto sobre accent               |

### 1.8 Destructive

| Variavel        | Light     | Dark      | Uso                              |
|-----------------|-----------|-----------|----------------------------------|
| `--destructive` | `#ef4444` | `#ef4444` | Acoes destrutivas (excluir, erro)|

### 1.9 Border, Input e Ring

| Variavel   | Light     | Dark      | Uso                              |
|------------|-----------|-----------|----------------------------------|
| `--border` | `#e4e4e7` | `#27272a` | Bordas de cards, separadores     |
| `--input`  | `#e4e4e7` | `#27272a` | Bordas de inputs                 |
| `--ring`   | `#6d28d9` | `#7c3aed` | Focus ring (mesma cor do primary)|

### 1.10 Sidebar (8 variaveis)

| Variavel                       | Light     | Dark      | Uso                              |
|--------------------------------|-----------|-----------|----------------------------------|
| `--sidebar`                    | `#ffffff` | `#09090b` | Fundo da sidebar                 |
| `--sidebar-foreground`         | `#18181b` | `#fafafa` | Texto na sidebar                 |
| `--sidebar-primary`            | `#6d28d9` | `#7c3aed` | Cor primaria da sidebar (links ativos)|
| `--sidebar-primary-foreground` | `#ffffff` | `#ffffff` | Texto sobre sidebar-primary      |
| `--sidebar-accent`             | `#f4f4f5` | `#27272a` | Fundo hover de items da sidebar  |
| `--sidebar-accent-foreground`  | `#18181b` | `#fafafa` | Texto sobre sidebar-accent       |
| `--sidebar-border`             | `#e4e4e7` | `#27272a` | Borda da sidebar (border-right)  |
| `--sidebar-ring`               | `#6d28d9` | `#7c3aed` | Focus ring dentro da sidebar     |

### 1.11 Charts (5 cores para Recharts)

| Variavel    | Light     | Dark      | Uso                              |
|-------------|-----------|-----------|----------------------------------|
| `--chart-1` | `#7c3aed` | `#7c3aed` | Cor principal dos graficos (violet-600)|
| `--chart-2` | `#8b5cf6` | `#8b5cf6` | Segunda cor (violet-500)         |
| `--chart-3` | `#22c55e` | `#22c55e` | Terceira cor (green-500)         |
| `--chart-4` | `#f97316` | `#f97316` | Quarta cor (orange-500)          |
| `--chart-5` | `#a855f7` | `#a855f7` | Quinta cor (purple-500)          |

### 1.12 Escala de Radius

Valor base: `--radius: 0.75rem` (12px)

| Token         | Calculo                        | Valor resultante |
|---------------|--------------------------------|------------------|
| `--radius-sm` | `calc(var(--radius) * 0.6)`    | 0.45rem (7.2px)  |
| `--radius-md` | `calc(var(--radius) * 0.8)`    | 0.60rem (9.6px)  |
| `--radius-lg` | `var(--radius)`                | 0.75rem (12px)   |
| `--radius-xl` | `calc(var(--radius) * 1.4)`    | 1.05rem (16.8px) |
| `--radius-2xl`| `calc(var(--radius) * 1.8)`    | 1.35rem (21.6px) |
| `--radius-3xl`| `calc(var(--radius) * 2.2)`    | 1.65rem (26.4px) |
| `--radius-4xl`| `calc(var(--radius) * 2.6)`    | 1.95rem (31.2px) |

### 1.13 Fontes

Definidas via `@theme inline`:
- `--font-sans` -- fonte principal (Geist Sans, carregada via Next.js)
- `--font-mono` -- `var(--font-geist-mono)` (Geist Mono)
- `--font-heading` -- `var(--font-sans)` (mesma fonte do corpo)

### 1.14 Layer base

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

Todos os elementos herdam `border-color: var(--border)` e `outline-color: var(--ring)/50%`.

---

## 2. Como trocar a identidade visual

Para mudar a cor primaria de violet (`#7c3aed` dark / `#6d28d9` light) para outra cor:

### Passo a passo

**1. Trocar `--primary` (light e dark mode) em `globals.css`:**
```css
:root {
  --primary: #NOVA_COR_LIGHT;
}
.dark {
  --primary: #NOVA_COR_DARK;
}
```

**2. Trocar `--ring` (mesma cor do primary):**
```css
:root {
  --ring: #NOVA_COR_LIGHT;
}
.dark {
  --ring: #NOVA_COR_DARK;
}
```

**3. Trocar `--sidebar-primary` e `--sidebar-ring`:**
```css
:root {
  --sidebar-primary: #NOVA_COR_LIGHT;
  --sidebar-ring: #NOVA_COR_LIGHT;
}
.dark {
  --sidebar-primary: #NOVA_COR_DARK;
  --sidebar-ring: #NOVA_COR_DARK;
}
```

**4. Trocar `--chart-1` (cor principal dos graficos):**
```css
:root {
  --chart-1: #NOVA_COR_DARK;
}
.dark {
  --chart-1: #NOVA_COR_DARK;
}
```

**5. No `src/components/login/login-content.tsx`, trocar classes violet-\*:**
- `focus:border-violet-500` para `focus:border-NOVA-500`
- `focus:ring-violet-500/50` para `focus:ring-NOVA-500/50`
- `from-violet-600 to-purple-600` para as novas cores do gradiente
- `hover:from-violet-500 hover:to-purple-500` para as novas cores hover
- `hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]` para o novo rgba
- `hover:text-violet-400` para `hover:text-NOVA-400`
- `rgba(124, 58, 237, ...)` na animacao boxShadow do logo

**6. No `src/components/layout/sidebar.tsx`, trocar violet-500:**
- `text-violet-500` (item ativo) para `text-NOVA-500`
- `border-violet-500` (borda esquerda ativa) para `border-NOVA-500`

**7. No `src/app/(auth)/login/page.tsx`, trocar cores do background:**
- `from-violet-950/80` para `from-NOVA-950/80`
- `to-purple-950/60` para ajustar conforme a nova paleta
- `bg-violet-600/8` nos blur circles

**8. Repetir para todas as paginas de auth** (forgot-password, reset-password, verify-email) que usam o mesmo padrao de background e classes violet-\*.

**9. Trocar progress bar do toast em globals.css:**
```css
background: linear-gradient(90deg, rgba(NOVA_R, NOVA_G, NOVA_B, 0.5), rgba(NOVA_R2, NOVA_G2, NOVA_B2, 0.5));
```

---

## 3. Tema dark/light/system

### 3.1 ThemeProvider (`src/components/providers/theme-provider.tsx`)

O componente `Providers` envolve toda a aplicacao (no root layout) com dois providers:

```tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </SessionProvider>
  );
}
```

- **`attribute="class"`** -- o tema e aplicado adicionando a classe `dark` no `<html>`. Sem a classe, vale o light mode.
- **`defaultTheme="dark"`** -- dark mode e o padrao para novos usuarios.
- **`enableSystem`** -- respeita `prefers-color-scheme` quando o usuario escolhe "sistema".
- **`disableTransitionOnChange`** -- evita flash de transicao ao trocar tema.
- **`SessionProvider`** -- envolve o NextThemesProvider para acesso a sessao NextAuth em toda a arvore.

### 3.2 ThemeInitializer (`src/components/providers/theme-initializer.tsx`)

Componente renderizado dentro do layout protegido que sincroniza o tema salvo no banco com o next-themes:

```tsx
export function ThemeInitializer({ theme }: { theme: string | null }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
```

- Recebe o campo `theme` do model User (via sessao JWT).
- No `useEffect`, chama `setTheme()` para aplicar a preferencia salva.
- Renderiza `null` (nenhum DOM visual).
- Usado no `src/app/(protected)/layout.tsx`:
  ```tsx
  <ThemeInitializer theme={(session.user as any)?.theme ?? null} />
  ```

### 3.3 Como funciona o fluxo

1. Usuario faz login. O JWT contem o campo `theme` do model User.
2. O layout protegido extrai `theme` da sessao e passa ao `ThemeInitializer`.
3. `ThemeInitializer` chama `setTheme()` do next-themes, que aplica/remove a classe `dark` no `<html>`.
4. As CSS variables de `:root` (light) ou `.dark` (dark) entram em vigor.
5. Quando o usuario muda o tema na pagina de perfil, a Server Action salva no banco e o estado local atualiza via `setTheme()`.

### 3.4 Variaveis por tema

- **Light mode**: variaveis definidas em `:root` (sem classe `.dark`)
- **Dark mode**: variaveis definidas em `.dark`
- O seletor custom `@custom-variant dark (&:is(.dark *))` permite usar `dark:` como utility no Tailwind.

---

## 4. Layout protegido

Arquivo: `src/app/(protected)/layout.tsx`

### 4.1 Estrutura

```tsx
<div className="flex h-screen overflow-hidden bg-background">
  <ThemeInitializer theme={...} />
  <Sidebar user={user} />
  <main className="flex-1 overflow-y-auto">
    <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
      {children}
    </div>
  </main>
</div>
```

### 4.2 Comportamento

- **Container raiz**: `flex h-screen overflow-hidden` -- ocupa toda a viewport, sem scroll no body.
- **Sidebar**: componente a esquerda (w-60 = 240px), ocupa a altura total.
- **Main**: `flex-1 overflow-y-auto` -- ocupa o espaco restante, scroll vertical proprio.
- **Conteudo**: centralizado com `max-w-7xl` (1280px), padding responsivo.

### 4.3 Padding responsivo do conteudo

| Breakpoint       | Padding horizontal | Padding top | Padding bottom |
|------------------|--------------------|-------------|----------------|
| Mobile (< 640px) | `px-4` (16px)     | `pt-16` (64px, espaco para botao hamburger) | `pb-8` (32px) |
| Tablet (>= 640px)| `px-6` (24px)     | `pt-8` (32px) | `pb-8` (32px) |
| Desktop (>= 1024px)| `px-8` (32px)  | `pt-8` (32px) | `pb-8` (32px) |

### 4.4 Autenticacao

O layout e um Server Component que chama `auth()` do NextAuth. Se nao ha sessao, redireciona para `/login`. Extrai do JWT: `name`, `email`, `platformRole`, `isSuperAdmin`, `avatarUrl`, `theme`.

### 4.5 Sidebar (`src/components/layout/sidebar.tsx`)

**Desktop (>= 1024px / `lg`):**
- `<aside className="hidden w-60 shrink-0 lg:block">` -- visivel, largura fixa 240px.

**Mobile (< 1024px):**
- Sidebar oculta. Botao hamburger fixo no canto superior esquerdo:
  ```tsx
  <div className="fixed top-4 left-4 z-50 lg:hidden">
    <Button variant="ghost" size="icon" className="h-11 w-11 bg-card border border-border ...">
      {mobileOpen ? <X /> : <Menu />}
    </Button>
  </div>
  ```
- Ao abrir: backdrop `bg-black/60 backdrop-blur-sm` + sidebar desliza da esquerda com animacao spring.

**Conteudo da sidebar:**
1. **Logo** -- `logo-nexus-ai.png` 40x40 com shadow violet + titulo "Nexus AI" + subtitulo "Roteador Webhook"
2. **Menu de navegacao** -- items dinamicos via `getNavItems(platformRole)`, cada um com icone Lucide + label. Item ativo: `text-violet-500` com `border-l-2 border-violet-500`.
3. **Secao inferior** -- area do usuario (avatar/inicial + nome + role) com link para `/profile`, e botao "Sair" com icone `LogOut`.

**Animacao dos items do menu:**
```tsx
<motion.div
  initial={{ opacity: 0, x: -12 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.2, delay: index * 0.05 }}
>
```

**Animacao da sidebar mobile (overlay):**
```tsx
// Backdrop
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2 }}
  className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
/>

// Sidebar panel
<motion.aside
  initial={{ x: -256 }}
  animate={{ x: 0 }}
  exit={{ x: -256 }}
  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
  className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
/>
```

---

## 5. Paginas de autenticacao

Todas as paginas de auth compartilham o mesmo padrao visual: fundo gradient escuro com blur circles, conteudo centralizado, footer com copyright.

### 5.1 Login (`/login`)

**Arquivos:** `src/app/(auth)/login/page.tsx` + `src/components/login/login-content.tsx`

**Background (page.tsx):**
- Gradiente: `bg-gradient-to-br from-violet-950/80 via-[#09090b] to-purple-950/60`
- Blur circle esquerdo: `h-[300px] w-[300px] sm:h-[500px] sm:w-[500px] rounded-full bg-violet-600/8 blur-[100px] sm:blur-[120px]` posicionado `-left-32 -top-32`
- Blur circle direito: `h-[250px] w-[250px] sm:h-[400px] sm:w-[400px] rounded-full bg-purple-600/8 blur-[100px] sm:blur-[120px]` posicionado `-bottom-32 -right-32`
- Dot pattern: `radial-gradient(rgba(255,255,255,.3) 1px, transparent 1px)` com `backgroundSize: 28px 28px` e `opacity-[0.02]`

**Conteudo centralizado (login-content.tsx):**
- Container: `max-w-md px-6 py-12`
- Animacao de entrada: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' as const }}`

**Logo animado:**
- Imagem `logo-nexus-ai.png` 88x88, `rounded-[22%]`
- Glow pulsante via Framer Motion:
  ```tsx
  animate={{
    boxShadow: [
      '0 0 30px rgba(124, 58, 237, 0.12)',
      '0 0 50px rgba(124, 58, 237, 0.2)',
      '0 0 30px rgba(124, 58, 237, 0.12)',
    ],
  }}
  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
  ```

**Titulo:**
- `<h1>` "Nexus AI" -- `text-2xl font-bold text-white tracking-tight`
- Subtitulo "Roteador de Webhooks" -- `text-sm text-zinc-500 mt-1`

**Formulario:**
- Campos: e-mail e senha, ambos com `h-12 rounded-xl`
- Input email: `border-zinc-800 bg-zinc-900/80 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50`
- Input senha: mesmo estilo + botao toggle Eye/EyeOff posicionado `absolute right-3.5 top-1/2`
- Link "Esqueci minha senha": `text-zinc-500 hover:text-violet-400`
- Botao submit: `h-12 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold` com hover glow `hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]`
- Estado loading: icone `Loader2 animate-spin` + texto "Entrando..."
- Estado normal: icone `ArrowRight` + texto "Entrar"

**Erro:**
- Alerta animado: `rounded-xl border border-red-900/50 bg-red-950/30 p-3.5 text-sm text-red-400` com icone `AlertCircle`

**Footer:**
- `text-xs text-zinc-600` -- "NexusAI360 (c) {ano}. Todos os direitos reservados."

### 5.2 Esqueci minha senha (`/forgot-password`)

**Arquivo:** `src/app/(auth)/forgot-password/page.tsx` + `forgot-password-form.tsx`

**Background:** mesmo padrao das paginas auth, com gradiente `from-violet-950 via-[#0a0a0f] to-purple-950` e tres blur circles (esquerdo, direito e central).

**Formulario (estado inicial):**
- Icone central: `Mail` em container `h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20`
- Titulo: "Esqueci minha senha" -- `text-2xl font-bold`
- Subtitulo: "Informe seu e-mail para receber o link de redefinicao"
- Campo e-mail: `h-12 rounded-xl border-border bg-card/80`
- Botao: mesmo gradiente violet do login, texto "Enviar link de redefinicao"
- Link: "Voltar ao login" com `ArrowLeft`

**Estado de sucesso (apos envio):**
- Icone: `CheckCircle2` em container emerald (`bg-emerald-500/10 border-emerald-500/20`)
- Titulo: "Verifique seu e-mail"
- Mensagem com o email digitado em bold
- Info: "O link expira em 1 hora. Verifique tambem a pasta de spam."
- Botao ghost: "Voltar ao login"

### 5.3 Redefinir senha (`/reset-password`)

**Arquivo:** `src/app/(auth)/reset-password/page.tsx` + `reset-password-form.tsx`

**Background:** identico ao forgot-password.

**Token invalido (sem `?token=` na URL):**
- Icone: `AlertCircle` em container red (`bg-red-500/10 border-red-500/20`)
- Titulo: "Link invalido"
- Botao gradiente: "Solicitar novo link" (leva para `/forgot-password`)

**Formulario (com token valido):**
- Icone central: `KeyRound` em container violet
- Titulo: "Redefinir senha"
- Subtitulo: "Escolha uma nova senha para sua conta"
- Campos: nova senha (com toggle Eye/EyeOff) + confirmar senha, ambos `h-12 rounded-xl`
- Validacao client-side: senhas devem coincidir, minimo 6 caracteres
- Botao: gradiente violet, texto "Redefinir senha"
- Link: "Voltar ao login"

**Estado de sucesso:**
- Icone: `CheckCircle2` em container emerald
- Titulo: "Senha redefinida"
- Mensagem: "Sua senha foi alterada com sucesso."
- Botao gradiente: "Ir para o login"

### 5.4 Verificar e-mail (`/verify-email`)

**Arquivo:** `src/app/(auth)/verify-email/page.tsx` + `verify-email-content.tsx`

**Background:** identico as demais paginas auth.

**Verificacao automatica:** ao carregar a pagina, o `useEffect` extrai o `token` da URL e chama `confirmEmailChange(token)`. Tres estados possiveis:

**Estado loading:**
- Icone: `Loader2 animate-spin` em container violet
- Titulo: "Verificando..."
- Mensagem: "Confirmando seu novo e-mail, aguarde um momento."

**Estado sucesso:**
- Icone: `CheckCircle2` em container emerald
- Titulo: "E-mail confirmado"
- Mensagem: "Seu e-mail foi alterado com sucesso. Faca login novamente com o novo endereco."
- Botao gradiente: "Ir para o login"

**Estado erro:**
- Icone: `AlertCircle` em container red
- Titulo: "Erro na verificacao"
- Mensagem: erro retornado pela action
- Botao gradiente: "Voltar ao perfil" (leva para `/profile`)

---

## 6. Componentes base

Todos os componentes vem do shadcn/ui configurado com `@base-ui/react`. Localizados em `src/components/ui/`.

**REGRA IMPORTANTE:** O shadcn/ui neste projeto usa `render` prop para composicao, NAO `asChild`. Nunca usar `asChild` em nenhum componente.

### 6.1 Button (`button.tsx`)

Baseado em `@base-ui/react/button`. Usa `class-variance-authority` para variantes.

**Variantes de estilo:**
| Variante      | Aparencia                                                    |
|---------------|--------------------------------------------------------------|
| `default`     | `bg-primary text-primary-foreground` (fundo violet, texto branco) |
| `outline`     | `border-border bg-background hover:bg-muted` (fundo transparente, borda) |
| `secondary`   | `bg-secondary text-secondary-foreground` (fundo cinza claro/escuro) |
| `ghost`       | Sem fundo, `hover:bg-muted` (aparece fundo apenas no hover)  |
| `destructive` | `bg-destructive/10 text-destructive` (fundo vermelho sutil, texto vermelho) |
| `link`        | `text-primary underline-offset-4 hover:underline` (apenas texto com underline) |

**Variantes de tamanho:**
| Tamanho    | Altura  | Uso                          |
|------------|---------|------------------------------|
| `default`  | `h-8`   | Botoes padrao                |
| `xs`       | `h-6`   | Botoes compactos             |
| `sm`       | `h-7`   | Botoes pequenos              |
| `lg`       | `h-9`   | Botoes grandes               |
| `icon`     | `size-8` | Apenas icone (quadrado)     |
| `icon-xs`  | `size-6` | Icone compacto              |
| `icon-sm`  | `size-7` | Icone pequeno               |
| `icon-lg`  | `size-9` | Icone grande                |

**Recursos globais:** focus ring via `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`, `disabled:opacity-50`, `active:translate-y-px` (feedback de clique).

### 6.2 Custom Select (`custom-select.tsx`)

Select personalizado com dropdown animado. Preferir este ao select nativo do shadcn.

**Interface de opcoes:**
```tsx
interface SelectOption {
  value: string;
  label: string;
  description?: string;  // texto secundario abaixo do label
  icon?: React.ReactNode; // icone ao lado do label
}
```

**Props:**
```tsx
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  renderTrigger?: (option, open, toggle) => React.ReactNode;
}
```

**Comportamento:**
- Dropdown posicionado via `position: fixed` calculando o `getBoundingClientRect()` do trigger
- Largura minima: `Math.max(rect.width, 280)` -- nunca menor que 280px
- Fecha ao clicar fora (mousedown listener)
- Animacao: `initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}` com `duration: 0.15`
- Item selecionado: icone `Check` na direita + `bg-accent/50`
- Z-index do dropdown: `z-[100]`

### 6.3 Demais componentes

| Componente       | Arquivo              | Uso principal                                       |
|------------------|----------------------|-----------------------------------------------------|
| `Input`          | `input.tsx`          | Campos de texto. Focus ring violet por padrao.       |
| `Label`          | `label.tsx`          | Labels de formularios.                              |
| `Card`           | `card.tsx`           | Container com sombra para secoes de conteudo.       |
| `Dialog`         | `dialog.tsx`         | Modais de formularios (criar/editar).               |
| `AlertDialog`    | `alert-dialog.tsx`   | Modais de confirmacao (excluir, acoes destrutivas). |
| `Table`          | `table.tsx`          | Tabelas de dados (empresas, rotas, logs, membros).  |
| `Select`         | `select.tsx`         | Select nativo shadcn (usar CustomSelect quando possivel).|
| `Badge`          | `badge.tsx`          | Labels de status (ativo/inativo, roles, metodos HTTP).|
| `Tabs`           | `tabs.tsx`           | Navegacao por abas (pagina de empresa: 5 tabs).     |
| `Switch`         | `switch.tsx`         | Toggle booleano (ativar/desativar).                 |
| `Textarea`       | `textarea.tsx`       | Campos de texto multiline.                          |
| `Calendar`       | `calendar.tsx`       | Seletor de data (usado em filtros).                 |
| `ScrollArea`     | `scroll-area.tsx`    | Area com scroll customizado.                        |
| `Collapsible`    | `collapsible.tsx`    | Secoes expansiveis/colapsaveis.                     |
| `Popover`        | `popover.tsx`        | Popover para conteudo flutuante (filtros, datepicker).|
| `Checkbox`       | `checkbox.tsx`       | Checkbox padrao.                                    |
| `Sonner`         | `sonner.tsx`         | Toast customizado com MutationObserver (ver secao Toast).|

---

## 7. Animacoes

Todas as animacoes usam **Framer Motion**. Padroes recorrentes:

### 7.1 Container stagger

Usado para animar listas de items com delay progressivo:

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
} as const;
```

### 7.2 Item fade-in

Cada item dentro de um container stagger:

```tsx
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
} as const;
```

### 7.3 Fade-in com slide (paginas/secoes)

```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: 'easeOut' as const }}
>
```

### 7.4 Slide lateral (sidebar items)

```tsx
<motion.div
  initial={{ opacity: 0, x: -12 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.2, delay: index * 0.05 }}
>
```

### 7.5 Spring (sidebar mobile)

```tsx
transition={{ type: 'spring', damping: 25, stiffness: 200 }}
```

### 7.6 Dropdown (custom select, popovers)

```tsx
<motion.div
  initial={{ opacity: 0, y: -4 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
  transition={{ duration: 0.15 }}
>
```

### 7.7 Glow pulsante (logo login)

```tsx
animate={{
  boxShadow: [
    '0 0 30px rgba(124, 58, 237, 0.12)',
    '0 0 50px rgba(124, 58, 237, 0.2)',
    '0 0 30px rgba(124, 58, 237, 0.12)',
  ],
}}
transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
```

### 7.8 Regras obrigatorias

- **Timing:** 150-500ms. Dropdowns: 150ms. Transicoes de pagina: 500ms. Items de lista: 200ms.
- **Easing:** usar `'easeOut' as const` ou `'easeInOut'` como string. Para spring: `{ damping: 25, stiffness: 200 }`.
- **OBRIGATORIO:** usar `as const` em objetos de variants que contem `ease`. Sem isso, o TypeScript infere o tipo errado e o Framer Motion gera erro.
- **AnimatePresence:** sempre envolver elementos que usam `exit` com `<AnimatePresence>`.

---

## 8. Responsividade

### 8.1 Breakpoints

| Nome     | Largura   | Tailwind prefix | Uso                              |
|----------|-----------|-----------------|----------------------------------|
| Mobile   | < 640px   | (default)       | Layout single-column             |
| Tablet   | >= 640px  | `sm:`           | Padding maior, grids 2-col       |
| Desktop  | >= 1024px | `lg:`           | Sidebar visivel, grids 3-4 col   |
| Wide     | >= 1280px | `xl:`           | Max-width do conteudo (7xl=1280px)|

### 8.2 Sidebar

- **< 1024px (mobile/tablet):** sidebar oculta via `hidden lg:block`. Botao hamburger fixo `top-4 left-4 z-50`.
- **>= 1024px (desktop):** sidebar visivel, largura fixa `w-60` (240px), `shrink-0`.
- **Overlay mobile:** backdrop `bg-black/60 backdrop-blur-sm` + sidebar desliza com spring animation.

### 8.3 Conteudo principal

```tsx
<div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
```

| Breakpoint | px     | pt     | Nota                                    |
|------------|--------|--------|-----------------------------------------|
| Mobile     | 16px   | 64px   | pt-16 para nao cobrir o botao hamburger |
| sm (640px) | 24px   | 32px   | Padding normal                          |
| lg (1024px)| 32px   | 32px   | Sidebar ocupa espaco, mais padding      |

### 8.4 Tabelas

Tabelas em mobile usam scroll horizontal. O container da tabela tem `overflow-x-auto` para permitir rolagem lateral em telas pequenas sem quebrar o layout.

### 8.5 Paginas de auth

- Background blurs responsivos no login: `h-[300px] w-[300px] sm:h-[500px] sm:w-[500px]` -- menores em mobile.
- Container de formulario: `max-w-md px-6` -- nunca ultrapassa 448px, com padding lateral de 24px.
- Logo mobile nas paginas forgot/reset/verify: `lg:hidden` -- aparece apenas quando nao ha sidebar.

### 8.6 Grids de cards (dashboard)

Os cards do dashboard usam grid responsivo:
- Mobile: `grid-cols-1` (empilhado)
- Tablet: `grid-cols-2` (2 colunas)
- Desktop: `grid-cols-3` ou `grid-cols-4` (3-4 colunas)

---

## 9. Sistema de Toast

Implementacao customizada do Sonner v2 em `src/components/ui/sonner.tsx` com MutationObserver.

### 9.1 Estilo visual

- **Pilha bottom-up:** flex `column-reverse` no `<ol>` do Sonner, `position: relative` nos toasts
- **Timers independentes:** `pointer-events: none` no `<ol>`, `pointer-events: auto` em cada `<li>`
- **Progress bar:** pseudo-elemento `::before` com animacao `toast-shrink` de 4s (gradiente violet)
- **Pausa no hover:** `animation-play-state: paused` apenas no toast sob o mouse (nao afeta outros)

### 9.2 Botao fechar

Posicionado `top: 6px, right: 6px`, circulo 20x20px com fundo `var(--muted)`, borda `var(--border)`, SVG 10x10px. Opacidade 0.7 normal, 1.0 no hover.

### 9.3 Progress bar CSS

```css
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

@keyframes toast-shrink {
  from { width: 100%; }
  to { width: 0%; }
}
```
