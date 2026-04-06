# Sistema de Permissoes em Duas Camadas — Spec

## Resumo

Redesenhar o sistema de permissoes da plataforma Nexus AI para ter duas camadas independentes:
1. **Nivel de plataforma** (`User.platformRole`) — define acesso global (sidebar, /users, /settings)
2. **Papel na empresa** (`UserCompanyMembership.role`) — define acesso dentro de cada empresa especifica

## Modelo de Dados

### Novo enum PlatformRole

```prisma
enum PlatformRole {
  super_admin
  admin
  manager
  viewer
}
```

### User model — novo campo

```prisma
model User {
  // ... campos existentes
  platformRole  PlatformRole  @default(viewer) @map("platform_role")
  isSuperAdmin  Boolean       @default(false) @map("is_super_admin")
  // isSuperAdmin mantido por compatibilidade, derivado: true quando platformRole === super_admin
}
```

### CompanyRole enum — adicionar super_admin

```prisma
enum CompanyRole {
  super_admin
  company_admin
  manager
  viewer
}
```

## Regras de Propagacao

| Mudanca na plataforma | Efeito nas empresas |
|---|---|
| Promovido a super_admin | Auto-vinculado a TODAS empresas como super_admin |
| Rebaixado DE super_admin para outro nivel | Todas memberships mudam para o novo nivel |
| Qualquer nivel → viewer | Todas memberships mudam para viewer |
| admin → manager | NAO muda memberships |
| manager → admin | NAO muda memberships |
| Ao criar nova empresa | Super admins sao auto-vinculados como super_admin |

## Restricoes de Papel na Empresa

| Nivel plataforma | Papeis permitidos na empresa | Ao vincular |
|---|---|---|
| super_admin | super_admin (fixo) | Automatico, sem select |
| admin | company_admin, manager, viewer | Select com 3 opcoes |
| manager | company_admin, manager, viewer | Select com 3 opcoes |
| viewer | viewer (fixo) | Automatico como viewer, sem select |

## Sidebar

| Nivel plataforma | Dashboard | Empresas | Usuarios | Configuracoes |
|---|---|---|---|---|
| super_admin | Sim | Sim (todas) | Sim | Sim |
| admin | Sim | Sim (vinculadas) | Sim | Nao |
| manager | Sim | Sim (vinculadas) | Nao | Nao |
| viewer | Sim | Sim (vinculadas) | Nao | Nao |

## Pagina /usuarios — Permissoes

| Acao | super_admin | admin |
|---|---|---|
| Ver pagina | Sim | Sim |
| Criar usuarios | Todos niveis | admin e abaixo |
| Editar usuarios | Todos exceto si mesmo | admin e abaixo, exceto super_admin |
| Excluir usuarios | Todos exceto si mesmo | admin e abaixo, exceto super_admin |
| Inativar super admin | Outro super admin apenas | Nao |

## Dentro da Empresa — Permissoes por Papel

| Acao | super_admin | company_admin | manager | viewer |
|---|---|---|---|---|
| Editar empresa | Sim | Sim | Nao | Nao |
| Excluir empresa | Sim (plataforma super_admin) | Nao | Nao | Nao |
| Credenciais WhatsApp (ver mascarado) | Sim | Sim | Sim | Sim |
| Credenciais WhatsApp (revelar/editar) | Sim | Sim | Nao | Nao |
| Rotas webhook (CRUD) | Sim | Sim | Sim | Nao |
| Rotas webhook (ver) | Sim | Sim | Sim | Sim |
| Logs | Sim | Sim | Sim | Sim |
| Membros: adicionar | Sim | Sim | Nao | Nao |
| Membros: mudar papel | Sim | Sim | Nao | Nao |
| Membros: remover | Sim (exceto si mesmo) | Sim (exceto super_admin) | Nao | Nao |

## Migration

1. Adicionar enum PlatformRole
2. Adicionar super_admin ao CompanyRole
3. Adicionar campo platformRole ao User (default: viewer)
4. Migrar dados existentes:
   - isSuperAdmin=true → platformRole=super_admin
   - Tem membership company_admin → platformRole=admin
   - Tem membership manager → platformRole=manager
   - Todos os outros → platformRole=viewer
5. Sincronizar isSuperAdmin com platformRole
