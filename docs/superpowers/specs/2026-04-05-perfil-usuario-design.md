# Perfil de Usuário — Spec v1

## Resumo
Página `/profile` para o usuário gerenciar seus dados pessoais: avatar, nome, e-mail (com verificação), senha e tema.

## Acesso
- Clicar no avatar/nome no rodapé da sidebar abre `/profile`
- Qualquer usuário autenticado acessa (sem restrição de permissão)

## Layout
Página única com seções em cards, estilo visual consistente com a página de Configurações.

### Seção 1 — Avatar e Nome
- Avatar circular mostrando foto (se `avatarUrl` existir) ou inicial do nome
- Botão de upload sobreposto ao avatar (ícone de câmera)
- Upload redimensiona no client via canvas para 128x128, converte para base64 data URL
- Campo de nome editável
- Botão "Salvar" para persistir avatar + nome

### Seção 2 — E-mail
- Campo com email atual (editável)
- Ao alterar, exige senha atual para confirmar identidade
- Fluxo com verificação:
  1. Usuário digita novo email + senha atual → "Alterar e-mail"
  2. Backend valida senha, cria `EmailChangeToken`, envia email para o NOVO endereço via Resend
  3. Email com botão "Confirmar novo e-mail" (template dark premium)
  4. Clique leva para `/verify-email?token=xxx` → email é atualizado
  5. Sessão JWT atualizada no próximo request
- Token expira em 1h, rate limit de 2min entre pedidos
- Não revela se o email já está em uso (segurança)

### Seção 3 — Alterar Senha
- Campos: senha atual, nova senha, confirmar nova senha
- Validação: mínimo 6 caracteres, senhas devem coincidir
- Senha atual obrigatória

### Seção 4 — Tema
- Seletor visual: dark / light / system
- Aplicação imediata ao selecionar (sem botão salvar)
- Persiste no campo `theme` do User

## Modelos de Dados

### EmailChangeToken (novo)
```
id          UUID PK
userId      UUID FK → users
newEmail    String
token       String unique
expiresAt   DateTime
usedAt      DateTime?
createdAt   DateTime
```

## Server Actions
- `updateProfile(name, avatarUrl)` — atualiza nome e avatar
- `changePassword(currentPassword, newPassword)` — valida atual e troca
- `updateTheme(theme)` — aplica tema imediatamente
- `requestEmailChange(newEmail, currentPassword)` — valida e envia verificação
- Rota `/verify-email` — página pública, processa token e atualiza email

## Alterações na Sidebar
- Avatar no rodapé mostra foto (se houver) em vez de apenas inicial
- Área do usuário é clicável e leva para `/profile`

## Rotas Públicas
- `/verify-email` adicionada ao auth.config.ts

## Dependências
- Resend (já configurado)
- Canvas API do browser (redimensionamento de imagem)
- bcryptjs (validação de senha)
