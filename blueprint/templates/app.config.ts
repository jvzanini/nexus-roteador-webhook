// Template: App Config — Identidade centralizada da plataforma
// Substituir os valores marcados com ← ao criar nova plataforma

export const APP_CONFIG = {
  // === Identidade ===
  name: "{{APP_NAME}}",              // ← Nome da plataforma (ex: "Nexus CRM")
  shortName: "{{SHORT_NAME}}",       // ← Nome curto (ex: "CRM")
  description: "{{DESCRIPTION}}",    // ← Descrição (ex: "Gestão de clientes")
  domain: "{{DOMAIN}}",              // ← Domínio (ex: "crm.nexusai360.com")

  // === Visual ===
  logo: "/logo.png",                 // ← Caminho do logo em public/
  brandDark: "/marca-dark.png",      // ← Marca para dark mode
  brandLight: "/marca-light.png",    // ← Marca para light mode

  // === Email ===
  emailFrom: '{{APP_NAME}} <noreply@{{EMAIL_DOMAIN}}>',  // ← From address
  emailDomain: "{{EMAIL_DOMAIN}}",   // ← Domínio de email (ex: "nexusai360.com")

  // === Deploy ===
  registry: "{{REGISTRY}}",          // ← Registry Docker (ex: "ghcr.io/jvzanini")
  projectSlug: "{{PROJECT_SLUG}}",   // ← Slug (ex: "nexus-crm")
  network: "{{NETWORK}}",            // ← Rede Docker (ex: "rede_nexusAI")

  // === Módulos habilitados ===
  features: {
    multiTenant: false,               // ← Empresas e workspaces
    notifications: false,             // ← Feed de notificações
    auditLog: false,                  // ← Registro de ações
    realtime: false,                  // ← SSE + Redis Pub/Sub
    encryption: false,                // ← AES-256-GCM
    toast: true,                      // ← Toast notifications (recomendado)
    dashboard: false,                 // ← Painel com métricas
    queue: false,                     // ← BullMQ worker
    settings: false,                  // ← Config globais
  },
} as const;

export type AppConfig = typeof APP_CONFIG;
