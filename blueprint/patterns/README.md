# Patterns Arquiteturais

Documentação dos patterns reutilizáveis do Blueprint Nexus AI. Patterns descrevem arquitetura adaptável — o padrão é o mesmo, a implementação muda por plataforma.

## Patterns disponíveis

| Pattern | Descrição | Arquivo |
|---------|-----------|---------|
| Dashboard | Stats cards, gráficos, filtros, tabelas | [dashboard.md](dashboard.md) |
| Queue | BullMQ worker, retry, DLQ | [queue.md](queue.md) |
| Settings | Config globais key-value, admin-only | [settings.md](settings.md) |
| Webhook Routing | Receber, normalizar, dedup, entregar | [webhook-routing.md](webhook-routing.md) |

Cada pattern segue o formato definido na spec (`docs/superpowers/specs/2026-04-07-blueprint-nexus-ai-design.md`, seção 10).
