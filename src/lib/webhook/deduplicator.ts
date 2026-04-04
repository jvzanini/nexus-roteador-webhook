import { createHash } from "crypto";
import { NormalizedEvent } from "./normalizer";

/**
 * Algoritmo de deduplicacao v1 para webhooks da Meta.
 *
 * Spec referencia: Secao 2, passo 6 da spec v7.
 *
 * Formato: dedupe_key = SHA-256("v1:" + wabaId + "|" + eventType + "|" + identifier)
 *
 * Onde identifier eh:
 *   - messages: message.id (wamid unico)
 *   - statuses: status.id + ":" + status.status (distingue sent/delivered/read)
 *   - calls: call.id
 *   - outros: SHA-256 do JSON do trecho change.value (com sorted keys)
 */

const ALGORITHM_VERSION = "v1";

export interface DedupeParams {
  /** WABA ID (entry.id) */
  wabaId: string;

  /** Tipo normalizado do evento (ex: messages.text, statuses.delivered) */
  eventType: string;

  /** message.id para mensagens */
  messageId?: string;

  /** status.id para statuses */
  statusId?: string;

  /** status.status para statuses (sent, delivered, read, failed) */
  statusValue?: string;

  /** call.id para chamadas */
  callId?: string;

  /** Conteudo de fallback para eventos sem ID (sera hasheado) */
  fallbackContent?: Record<string, unknown>;
}

/**
 * Calcula a dedupe_key com algoritmo v1 versionado.
 *
 * @returns SHA-256 hex string (64 caracteres)
 */
export function computeDedupeKey(params: DedupeParams): string {
  const { wabaId, eventType, messageId, statusId, statusValue, callId, fallbackContent } = params;

  let identifier: string;

  if (messageId) {
    // Mensagens: usa message.id diretamente
    identifier = messageId;
  } else if (statusId && statusValue) {
    // Statuses: usa status.id + ":" + status.status
    // Isso distingue sent/delivered/read do mesmo wamid
    identifier = `${statusId}:${statusValue}`;
  } else if (callId) {
    // Chamadas: usa call.id diretamente
    identifier = callId;
  } else if (fallbackContent) {
    // Eventos sem ID: SHA-256 do JSON com sorted keys
    identifier = hashContent(fallbackContent);
  } else {
    throw new Error(
      `computeDedupeKey: nenhum identificador fornecido para evento ${eventType}. ` +
      `Forneca messageId, statusId+statusValue, callId ou fallbackContent.`
    );
  }

  // dedupe_key = SHA-256("v1:" + wabaId + "|" + eventType + "|" + identifier)
  const preimage = `${ALGORITHM_VERSION}:${wabaId}|${eventType}|${identifier}`;
  return sha256(preimage);
}

/**
 * Extrai os parametros de deduplicacao de um evento normalizado.
 * Conveniencia para nao repetir a logica de extracao no handler.
 */
export function extractDedupeParams(event: NormalizedEvent): DedupeParams {
  const params: DedupeParams = {
    wabaId: event.wabaId,
    eventType: event.eventType,
  };

  if (event.eventType.startsWith("messages.") && event.payload.message) {
    params.messageId = (event.payload.message as any).id;
  } else if (event.eventType.startsWith("statuses.") && event.payload.status) {
    const status = event.payload.status as any;
    params.statusId = status.id;
    params.statusValue = status.status;
  } else if (event.eventType.startsWith("calls.") && event.payload.call) {
    params.callId = (event.payload.call as any).id;
  } else {
    params.fallbackContent = event.payload as Record<string, unknown>;
  }

  return params;
}

/**
 * Calcula SHA-256 hex de uma string.
 */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Serializa objeto com sorted keys e calcula SHA-256.
 * Garante determinismo independente da ordem das propriedades.
 */
function hashContent(content: Record<string, unknown>): string {
  const sorted = JSON.stringify(content, Object.keys(content).sort());
  return sha256(sorted);
}
