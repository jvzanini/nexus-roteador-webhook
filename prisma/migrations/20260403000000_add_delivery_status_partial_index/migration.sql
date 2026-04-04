-- Índice parcial para orphan-recovery e queries de status não-terminal
CREATE INDEX IF NOT EXISTS idx_delivery_status
  ON route_deliveries (status, next_retry_at, created_at)
  WHERE status IN ('pending', 'delivering', 'retrying');

-- Índice parcial para InboundWebhook com processing_status não-terminal
CREATE INDEX IF NOT EXISTS idx_inbound_processing
  ON inbound_webhooks (processing_status)
  WHERE processing_status != 'processed';
