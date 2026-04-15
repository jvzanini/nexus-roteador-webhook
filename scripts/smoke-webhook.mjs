#!/usr/bin/env node
/**
 * Smoke de trafego sintetico: envia callbacks Meta-shaped HMAC-assinados
 * para o endpoint de webhook. Usado em staging para validar cutover do
 * pipeline @nexusai360/webhook-routing.
 *
 * Variaveis:
 *   WEBHOOK_URL       endpoint alvo (default http://localhost:3000/api/webhook/key1)
 *   META_APP_SECRET   segredo HMAC (default "test_secret")
 *   SMOKE_INTERVAL_MS intervalo entre POSTs em ms (default 30000)
 */
import { createHmac, randomUUID } from "node:crypto";

const URL = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhook/key1";
const SECRET = process.env.META_APP_SECRET ?? "test_secret";
const INTERVAL_MS = Number(process.env.SMOKE_INTERVAL_MS ?? 30_000);

function sign(body) {
  return (
    "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex")
  );
}

function makeMessagesPayload() {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_SMOKE",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+5511999999999",
                phone_number_id: "PNID",
              },
              messages: [
                {
                  id: `wamid.smoke.${randomUUID()}`,
                  type: "text",
                  from: "5511888888888",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: "smoke" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

async function send(body) {
  try {
    const res = await fetch(URL, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
    });
    console.log(
      `[smoke] ${new Date().toISOString()} status=${res.status} body=${await res.text()}`,
    );
  } catch (e) {
    console.error(`[smoke] ${new Date().toISOString()} FAIL ${e?.message ?? e}`);
  }
}

console.log(`[smoke] sending to ${URL} every ${INTERVAL_MS}ms`);
await send(makeMessagesPayload());
setInterval(() => {
  send(makeMessagesPayload());
}, INTERVAL_MS);
