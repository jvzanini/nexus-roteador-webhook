import type { NormalizedEvent } from "@nexusai360/webhook-routing";

export type { NormalizedEvent };

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: any;
    }>;
  }>;
}

/**
 * Normaliza payload Meta WhatsApp Cloud API em N NormalizedEvent.
 *
 * sourceId = entry.id (WABA ID) com fallback para companyId quando ausente —
 * preserva paridade com o deduplicator legado que usava wabaId (hoje obrigatorio
 * no entry da Meta, mas o fallback evita explosao se a Meta mudar).
 *
 * dedupeIdentifier preserva chaves equivalentes ao computeDedupeKey legado:
 *   - messages: wamid (message.id)
 *   - statuses: `${status.id}:${status.status}` (distingue sent/delivered/read)
 *   - calls: call.id
 *   - errors / outros: null (pacote aplica hashPayloadDeterministic)
 */
export function normalizeWebhookPayload(
  payload: MetaWebhookPayload,
  companyId: string,
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const entry of payload?.entry ?? []) {
    const sourceId = entry.id ?? companyId;
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      // messages
      for (const msg of value.messages ?? []) {
        events.push({
          eventType: `messages.${msg.type ?? "unknown"}`,
          sourceId,
          payload: {
            message: msg,
            contacts: value.contacts,
            metadata: value.metadata,
            messaging_product: value.messaging_product,
          },
          dedupeIdentifier: msg.id ?? null,
        });
      }
      // statuses
      for (const st of value.statuses ?? []) {
        events.push({
          eventType: `statuses.${st.status ?? "unknown"}`,
          sourceId,
          payload: {
            status: st,
            metadata: value.metadata,
            messaging_product: value.messaging_product,
          },
          dedupeIdentifier: st.id && st.status ? `${st.id}:${st.status}` : null,
        });
      }
      // calls
      for (const call of value.calls ?? []) {
        events.push({
          eventType: `calls.${call.event ?? "unknown"}`,
          sourceId,
          payload: { call, metadata: value.metadata },
          dedupeIdentifier: call.id ?? null,
        });
      }
      // errors
      for (const err of value.errors ?? []) {
        events.push({
          eventType: `errors.${err.code ?? "unknown"}`,
          sourceId,
          payload: { error: err, metadata: value.metadata },
          dedupeIdentifier: null,
        });
      }
    }
  }
  return events;
}
