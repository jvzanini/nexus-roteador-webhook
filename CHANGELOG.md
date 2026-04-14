# Changelog

## [PR-A] 2026-04-14 — Helpers via @nexusai360/webhook-routing@0.2.1

### Adicionado
- Dependência `@nexusai360/webhook-routing@0.2.1` via vendor tarball + verify SHA256.
- Peer deps (tambem via vendor tarball): `@nexusai360/types@0.2.0`, `@nexusai360/core@0.2.1`, `@nexusai360/multi-tenant@0.2.1`.
- Script `scripts/verify-vendor.mjs` + `preinstall` hook validando checksums dos tarballs.
- Config Jest: `moduleNameMapper` resolvendo o pacote e subpaths para `dist/*.cjs`.

### Mudanças de comportamento (SSRF — bloqueios novos no egress de webhooks)
- **CGNAT (100.64.0.0/10)** agora bloqueado. Rotas configuradas para esse range passam a falhar.
- **IPv4-mapped IPv6** (`::ffff:a.b.c.d` decimal e `::ffff:hhhh:hhhh` hex) bloqueado quando mapeia para IPv4 privado.
- **Hostnames extras bloqueados:** `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `broadcasthost`.

### Mudanças cosméticas
- Mensagens de erro SSRF agora são códigos estruturados (`private_ipv4`, `non_https_protocol`, `blocked_hostname`, etc.) em vez de strings em português.

### Sem mudanças
- Pipeline de ingest, normalizer, deduplicator, schema Prisma, worker — intactos. Vão ser migrados em PR-B.
