-- UNIQUE constraint em (company_id, dedupe_key) — garante idempotencia do ingest
-- em race conditions (duas requests concorrentes com mesmo dedupe_key colidem no
-- INSERT, resultando em P2002 que o adapter captura e retorna o existing inbound).
--
-- ATENCAO OPERADOR: rodar em ambiente conectado via `npx prisma migrate deploy`.
-- Se existirem duplicatas, aplicar cleanup antes (ver Task B1, Step 2 do plano):
--   DELETE FROM inbound_webhooks
--   WHERE id NOT IN (
--     SELECT MIN(id) FROM inbound_webhooks GROUP BY company_id, dedupe_key
--   );
ALTER TABLE "inbound_webhooks"
  ADD CONSTRAINT "ux_inbound_company_dedupe" UNIQUE ("company_id", "dedupe_key");
