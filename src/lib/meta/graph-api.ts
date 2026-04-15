const DEFAULT_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v20.0";
const TIMEOUT_MS = 8_000;

function baseUrl(): string {
  const root = process.env.META_GRAPH_API_URL ?? DEFAULT_BASE;
  const version = process.env.META_API_VERSION ?? DEFAULT_VERSION;
  return `${root}/${version}`;
}

export interface MetaApiErrorInit {
  status: number;
  code?: number;
  subcode?: number;
  message: string;
  fbtraceId?: string;
}

export class MetaApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  fbtraceId?: string;

  constructor(init: MetaApiErrorInit) {
    super(init.message);
    this.name = "MetaApiError";
    this.status = init.status;
    this.code = init.code;
    this.subcode = init.subcode;
    this.fbtraceId = init.fbtraceId;
  }
}

const ALLOWED_ERROR_FIELDS = ["status", "code", "subcode", "fbtraceId", "message"] as const;

export function serializeErrorSafe(err: unknown): string {
  const obj: Record<string, unknown> = {};
  if (err instanceof MetaApiError) {
    for (const k of ALLOWED_ERROR_FIELDS) {
      const v = (err as unknown as Record<string, unknown>)[k];
      if (v !== undefined) obj[k] = v;
    }
  } else if (err instanceof Error) {
    obj.message = err.message;
  } else {
    obj.message = "Erro desconhecido";
  }
  let s = JSON.stringify(obj);
  if (s.length > 500) s = s.slice(0, 497) + "...";
  return s;
}

async function doFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return doFetch(url, init, attempt + 1);
    }
    return res;
  } catch (e) {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return doFetch(url, init, attempt + 1);
    }
    throw e;
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (res.status >= 400) {
    const e =
      (json as {
        error?: {
          code?: number;
          error_subcode?: number;
          message?: string;
          fbtrace_id?: string;
        };
      } | null)?.error ?? {};
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

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface PhoneNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string;
}

export async function getPhoneNumber(phoneNumberId: string, token: string): Promise<PhoneNumber> {
  const res = await doFetch(
    `${baseUrl()}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
    { method: "GET", headers: authHeaders(token) }
  );
  const raw = await parseOrThrow<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating?: string;
  }>(res);
  return {
    id: raw.id,
    displayPhoneNumber: raw.display_phone_number,
    verifiedName: raw.verified_name,
    qualityRating: raw.quality_rating,
  };
}

export interface SubscribeFieldsInput {
  object: string;
  callbackUrl: string;
  verifyToken: string;
  fields: string[];
}

export async function subscribeFields(
  appId: string,
  input: SubscribeFieldsInput,
  token: string
): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(appId)}/subscriptions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      object: input.object,
      callback_url: input.callbackUrl,
      verify_token: input.verifyToken,
      fields: input.fields.join(","),
    }),
  });
  await parseOrThrow(res);
}

export async function subscribeApp(wabaId: string, token: string): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: authHeaders(token),
  });
  await parseOrThrow(res);
}

export async function unsubscribeApp(wabaId: string, token: string): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await parseOrThrow(res);
}

export interface SubscribedApp {
  appId: string;
  name?: string;
}

export async function listSubscribedApps(wabaId: string, token: string): Promise<SubscribedApp[]> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const raw = await parseOrThrow<{
    data: Array<{ whatsapp_business_api_data?: { id: string; name?: string } }>;
  }>(res);
  return (raw.data ?? [])
    .map((d) => d.whatsapp_business_api_data)
    .filter((d): d is { id: string; name?: string } => !!d)
    .map((d) => ({ appId: d.id, name: d.name }));
}

export interface Subscription {
  object: string;
  callbackUrl: string;
  fields: string[];
}

export async function listSubscriptions(appId: string, token: string): Promise<Subscription[]> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(appId)}/subscriptions`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const raw = await parseOrThrow<{
    data: Array<{ object: string; callback_url: string; fields?: Array<{ name: string }> }>;
  }>(res);
  return (raw.data ?? []).map((s) => ({
    object: s.object,
    callbackUrl: s.callback_url,
    fields: (s.fields ?? []).map((f) => f.name),
  }));
}
