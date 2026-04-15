#!/usr/bin/env node
// Uso: META_TEST_APP_ID=... META_TEST_WABA_ID=... META_TEST_TOKEN=... META_TEST_CALLBACK=... META_TEST_VERIFY=... node scripts/test-meta-subscribe.mjs

const {
  META_TEST_APP_ID,
  META_TEST_WABA_ID,
  META_TEST_TOKEN,
  META_TEST_CALLBACK,
  META_TEST_VERIFY,
} = process.env;

const missing = [];
if (!META_TEST_APP_ID) missing.push('META_TEST_APP_ID');
if (!META_TEST_WABA_ID) missing.push('META_TEST_WABA_ID');
if (!META_TEST_TOKEN) missing.push('META_TEST_TOKEN');
if (!META_TEST_CALLBACK) missing.push('META_TEST_CALLBACK');
if (!META_TEST_VERIFY) missing.push('META_TEST_VERIFY');
if (missing.length) {
  console.error(`[smoke-meta] Faltam envs: ${missing.join(', ')}`);
  process.exit(2);
}

const base =
  (process.env.META_GRAPH_API_URL ?? 'https://graph.facebook.com') +
  '/' +
  (process.env.META_API_VERSION ?? 'v20.0');

async function call(label, path, init) {
  console.log(`[smoke-meta] → ${label} ${path}`);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${META_TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    console.log(`[smoke-meta]   ${res.status} ${body.slice(0, 300)}`);
    if (res.status >= 400) process.exitCode = 1;
  } catch (e) {
    console.error(`[smoke-meta]   ERRO ${e.message}`);
    process.exitCode = 1;
  }
}

await call('subscribe fields', `/${META_TEST_APP_ID}/subscriptions`, {
  method: 'POST',
  body: JSON.stringify({
    object: 'whatsapp_business_account',
    callback_url: META_TEST_CALLBACK,
    verify_token: META_TEST_VERIFY,
    fields: 'messages',
  }),
});
await call('subscribe app', `/${META_TEST_WABA_ID}/subscribed_apps`, {
  method: 'POST',
});
await call('list subscribed apps', `/${META_TEST_WABA_ID}/subscribed_apps`, {
  method: 'GET',
});
