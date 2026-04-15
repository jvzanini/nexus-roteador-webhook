import { MetaApiError } from "./graph-api";

const DEFAULT_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v20.0";

function baseUrl(): string {
  return `${process.env.META_GRAPH_API_URL ?? DEFAULT_BASE}/${process.env.META_API_VERSION ?? DEFAULT_VERSION}`;
}

function appCreds(): { id: string; secret: string } {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new Error("META_APP_ID / META_APP_SECRET ausentes");
  return { id, secret };
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (res.status >= 400) {
    const e = (json as { error?: { code?: number; message?: string; fbtrace_id?: string; error_subcode?: number } } | null)?.error ?? {};
    throw new MetaApiError({
      status: res.status,
      code: typeof e.code === "number" ? e.code : undefined,
      subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
      message: typeof e.message === "string" ? e.message : `HTTP ${res.status}`,
      fbtraceId: typeof e.fbtrace_id === "string" ? e.fbtrace_id : undefined,
    });
  }
  return json as T;
}

export interface ExchangeCodeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<ExchangeCodeResult> {
  const { id, secret } = appCreds();
  const url = new URL(`${baseUrl()}/oauth/access_token`);
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  const raw = await parseOrThrow<{ access_token: string; token_type?: string; expires_in?: number }>(res);
  return {
    accessToken: raw.access_token,
    tokenType: raw.token_type ?? "bearer",
    expiresIn: raw.expires_in,
  };
}

export interface LongLivedTokenResult {
  accessToken: string;
  expiresIn: number;
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<LongLivedTokenResult> {
  const { id, secret } = appCreds();
  const url = new URL(`${baseUrl()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  const raw = await parseOrThrow<{ access_token: string; expires_in: number }>(res);
  return { accessToken: raw.access_token, expiresIn: raw.expires_in };
}

export async function validateBusinessAccess(
  token: string,
  wabaId: string,
  phoneNumberId: string
): Promise<void> {
  const wabaRes = await fetch(
    `${baseUrl()}/${encodeURIComponent(wabaId)}?fields=id,name`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    }
  );
  await parseOrThrow(wabaRes);

  const phoneRes = await fetch(
    `${baseUrl()}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    }
  );
  await parseOrThrow(phoneRes);
}
