# Ajustes Massivos de UI/UX — Spec

**Data:** 2026-04-05
**Status:** Aprovado (feedback direto do usuario em producao)

---

## Escopo

Correcoes de bugs, ajustes visuais e melhorias de UX reportados apos testes em producao.
**Fora do escopo desta spec:** Integracao com Meta API (webhook auto-config), perfil de usuario, seletor de tema light/dark/system.

---

## Batch 1: Fixes Globais (afetam todas as telas)

### 1.1 Notification Bell — apenas no Dashboard
- Remover o NotificationBell do layout global (`layout.tsx`)
- Adicionar somente na pagina de dashboard (`dashboard/page.tsx` ou `dashboard-content.tsx`)
- Motivo: sobrepoe botoes (ex: "Nova Empresa")

### 1.2 Tabelas — padding e alinhamento
- TODAS as tabelas: aumentar padding horizontal das cells (px-4 minimo ao inves de px-2)
- Colunas centralizadas (`text-center`) exceto Nome e Email (mantém `text-left`)
- Corrigir caracteres especiais: "Acoes" -> "Ações", "Configuracoes" -> "Configurações", etc (usar acentos em todo texto PT-BR visivel ao usuario)

### 1.3 Toast (Sonner) — botao fechar + barra de progresso
- Adicionar `closeButton` ao Toaster global
- Adicionar barra de progresso temporal (duration bar) — sutil, fina, cores do tema

### 1.4 Tooltips nos botoes de acao
- Todos os botoes de icone (editar, excluir, copiar) devem ter `title` com descricao
- Cursor pointer em todos os botoes de acao

---

## Batch 2: Tela de Usuarios (/users) — Redesign

### 2.1 Formulario de criacao
- Remover toggle "Super Admin"
- Adicionar select "Nivel de Acesso" com opcoes baseadas no nivel do usuario logado:
  - Super Admin: pode criar super_admin, company_admin, manager, viewer
  - Admin (company_admin): pode criar company_admin, manager, viewer
- Campo senha com olhinho (ver/ocultar)
- Campo "Confirmar senha" obrigatorio (validacao client-side: senhas iguais)
- Mensagem de erro se senhas nao batem

### 2.2 Formulario de edicao
- Mesmos campos que criacao
- Senha: mostrar senha atual com olhinho (super admin ve senha de todos)
- Confirmar nova senha obrigatorio se alterar senha
- Switch ativo/inativo dentro do dialog de edicao
- Nivel de acesso editavel conforme hierarquia

### 2.3 Controle de acesso na listagem
- Super Admin: ve e edita TODOS os usuarios
- Admin: ve admins (sem editar) + niveis abaixo (edita). NAO ve super admins
- Demais niveis: sem acesso a /users (redirect)
- Super Admin nao pode ser excluido pela plataforma

### 2.4 Tabela
- Colunas centralizadas
- Data com horario (dd/MM/yyyy HH:mm)
- Botao inativar vira lixeirinha (excluir) com dialog de confirmacao estilizado
- Tooltip nos botoes de acao

### 2.5 Server action
- `getUsers()` deve filtrar baseado no nivel do usuario logado
- `deleteUser()` nova action (exclui usuario, nao permite excluir super admin)
- `updateUser()` precisa retornar senha descriptografada para super admin (ou field separado)

---

## Batch 3: Tela de Configuracoes (/settings)

### 3.1 Traducoes
- "Retry de Webhooks" -> "Reenvio de Webhooks" ou "Retentativas de Webhook"
- "exponential" -> "Exponencial", "fixed" -> "Fixo" (nos values do select)
- "Jitter" -> manter mas melhorar descricao

### 3.2 Descricoes melhoradas
- Intervalos: "Tempo entre cada tentativa, separados por virgula (ex: 10, 30, 90 segundos)"
- Jitter: "Adiciona variacao aleatoria ao intervalo para evitar sobrecarga simultanea no destino"
- Estrategia: explicar que Exponencial multiplica os intervalos a cada tentativa (10s, 20s, 40s...) e Fixo usa exatamente os valores informados
- Threshold de falha: "Quantidade de falhas consecutivas de uma mesma rota para disparar alerta"
- Destinatarios: "E-mails ou numeros que receberao alertas (separados por virgula)"

### 3.3 Select component
- Redesenhar: padding interno, alinhamento do texto, border radius consistente
- Texto nao pode ficar colado na borda

### 3.4 Logica de notificacoes
- Nao pode desligar email E whatsapp ao mesmo tempo
- Se desligar um, o outro fica travado como ligado
- Plataforma pode ser desligada independente

### 3.5 Acesso
- Pagina acessivel para admin e super admin (hoje so super admin)

---

## Batch 4: Rotas de Webhook

### 4.1 BUG CRITICO: state vazando entre nova rota e edicao
- Ao abrir "Nova Rota", formulario vem vazio (correto)
- Ao clicar editar uma rota, mostra dados da nova rota vazia (BUG)
- Vice-versa: ao voltar pra "Nova Rota" apos editar, mostra dados da rota editada (BUG)
- Fix: resetar form state corretamente ao alternar entre criar/editar

### 4.2 Excluir vs Desativar
- Lixeirinha = EXCLUIR (nao desativar)
- Adicionar switch liga/desliga inline na rota para ativar/desativar
- Dialog de confirmacao: "Excluir rota" (nao "Desativar rota")
- Tooltip na lixeirinha: "Excluir rota"
- Ao excluir: remover do banco, nao apenas inativar

### 4.3 Validacoes
- URL duplicada entre rotas da mesma empresa: bloquear com mensagem
- Nome duplicado entre rotas da mesma empresa: bloquear com mensagem

### 4.4 Scroll automatico
- Se ao clicar "Criar rota" so faltar selecionar evento: scroll ate a secao de eventos

### 4.5 Icone
- Comentar/arquivar funcionalidade do icone no formulario (manter codigo, ocultar UI)

### 4.6 Contagem de rotas
- Fix: nao contar rotas excluidas na visao geral e na listagem

---

## Batch 5: WhatsApp Cloud (Credenciais)

### 5.1 BUG: olhinho nao revela valor completo
- Ao clicar no olhinho, campo deve mostrar valor descriptografado completo
- Hoje mostra apenas "****...e6d5" mesmo apos clicar

### 5.2 Traducoes
- "Verify Token" -> "Token de Verificacao"
- "Access Token" -> "Token de Acesso"

### 5.3 Descricoes
- Cada campo deve ter descricao abaixo do titulo explicando o que e:
  - Meta App ID: "Identificador do aplicativo no painel Meta for Developers"
  - Meta App Secret: "Chave secreta do aplicativo (nao compartilhe)"
  - Token de Verificacao: "Token usado pela Meta para validar o endpoint do webhook"
  - Token de Acesso: "Token de autorizacao para enviar mensagens via API"
  - Phone Number ID: "ID do numero de telefone na API do WhatsApp Business"
  - WABA ID: "ID da conta comercial do WhatsApp (WhatsApp Business Account)"

---

## Batch 6: Visao Geral (Overview) + Dashboard

### 6.1 Overview — layout
- 4 cards de metricas em UMA linha (grid-cols-4 em desktop, nao 2x2)
- Remover card "URL do Webhook" — mover URL para o header da empresa (tooltip/copy no slug)
- Remover card "Credenciais" (nao agrega informacao util)
- Card "Rotas": altura alinhada com grafico 7 dias (h-full, sem espaco vazio)
- Fix contagem rotas (nao contar excluidas)

### 6.2 Dashboard — visual
- Tooltip do grafico: corrigir fundo branco -> usar bg-zinc-900 border-zinc-700
- Card "Erros Mais Frequentes": altura alinhada com grafico "Entregas por Hora"
- Tabela "Entregas Recentes": aumentar padding das cells
- Select de empresas: substituir select nativo por componente customizado

---

## Batch 7: Membros (aba empresa)

### 7.1 Dialog estilizado
- Substituir `window.confirm` por dialog estilizado (igual ao das rotas)

### 7.2 Select de usuario
- Mostrar "Nome (email)" ao inves de UUID
- Redesenhar select com padding e alinhamento correto

### 7.3 Botao Adicionar
- Padronizar visual com identidade do sistema
- Remover botao X desalinhado

### 7.4 Acesso
- Aba Membros visivel apenas para admin e super admin

### 7.5 Tooltips
- Lixeirinha: tooltip "Remover membro" + cursor pointer

---

## Batch 8: Eventos WhatsApp (visual)

### 8.1 Cores por categoria quando ativo
- Quando desativado: icone cinza, borda cinza, fundo neutro
- Quando ativado: icone colorido (cor da categoria), borda colorida suave, fundo com tint da cor
- Ativar sub-evento deve acender cor do evento pai
- Referencia visual: prints fornecidos pelo usuario (estilo atual da plataforma esta ok, so falta cor)

---

## Prioridade de execucao

1. Batch 1 (globais) — impacta todas as telas
2. Batch 4 (rotas) — tem bugs criticos
3. Batch 2 (usuarios) — redesign completo
4. Batch 5 (credenciais) — bug do olhinho
5. Batch 3 (configuracoes) — traducoes e logica
6. Batch 6 (overview + dashboard) — layout
7. Batch 7 (membros) — fixes menores
8. Batch 8 (eventos) — visual
