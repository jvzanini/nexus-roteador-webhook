/**
 * Normalizacao multi-evento de callbacks da Meta WhatsApp Cloud API.
 *
 * Um callback da Meta pode conter multiplos itens logicos (ex: 3 mensagens
 * no mesmo POST, ou 2 statuses). Este modulo divide o callback em N eventos
 * normalizados individuais, cada um com eventType e payload isolado.
 *
 * Spec referencia: Secao 2, passo 5 da spec v7.
 */

export interface NormalizedEvent {
  /** Tipo normalizado: messages.text, messages.image, statuses.delivered, account_update, etc. */
  eventType: string;

  /** WABA ID do entry (entry.id) */
  wabaId: string;

  /** Payload isolado do evento individual */
  payload: Record<string, unknown>;
}

interface MetaWebhookPayload {
  object: string;
  entry?: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  field: string;
  value: Record<string, unknown>;
}

interface MetaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  [key: string]: unknown;
}

/**
 * Recebe o callback JSON completo da Meta e retorna array de eventos normalizados.
 *
 * Logica conforme spec v7:
 *   Para cada entry em payload.entry:
 *     Para cada change em entry.changes:
 *       Se change.field == "messages":
 *         Para cada message em change.value.messages (se existir):
 *           -> 1 evento com event_type = "messages.{message.type}"
 *         Para cada status em change.value.statuses (se existir):
 *           -> 1 evento com event_type = "statuses.{status.status}"
 *       Senao (account_update, flows, etc.):
 *         -> 1 evento com event_type = change.field
 */
export function normalizeWebhookPayload(payload: MetaWebhookPayload): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  if (!payload.entry || !Array.isArray(payload.entry)) {
    return events;
  }

  for (const entry of payload.entry) {
    const wabaId = entry.id;

    if (!entry.changes || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (change.field === "messages") {
        // Processar mensagens individuais
        const messages = change.value.messages as MetaMessage[] | undefined;
        const metadata = change.value.metadata;

        if (messages && Array.isArray(messages)) {
          for (const message of messages) {
            const eventType = `messages.${message.type}`;
            events.push({
              eventType,
              wabaId,
              payload: {
                messaging_product: change.value.messaging_product,
                metadata,
                message,
              },
            });
          }
        }

        // Processar statuses individuais
        const statuses = change.value.statuses as MetaStatus[] | undefined;

        if (statuses && Array.isArray(statuses)) {
          for (const status of statuses) {
            const eventType = `statuses.${status.status}`;
            events.push({
              eventType,
              wabaId,
              payload: {
                messaging_product: change.value.messaging_product,
                metadata,
                status,
              },
            });
          }
        }
      } else {
        // Outros fields: account_update, flows, etc.
        events.push({
          eventType: change.field,
          wabaId,
          payload: {
            value: change.value,
          },
        });
      }
    }
  }

  return events;
}
