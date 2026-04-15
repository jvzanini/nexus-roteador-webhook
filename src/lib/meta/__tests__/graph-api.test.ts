import {
  getPhoneNumber,
  subscribeFields,
  subscribeApp,
  unsubscribeApp,
  listSubscribedApps,
  listSubscriptions,
  MetaApiError,
  serializeErrorSafe,
} from "../graph-api";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  process.env.META_GRAPH_API_URL = "https://graph.facebook.com";
  process.env.META_API_VERSION = "v20.0";
});

describe("graph-api.getPhoneNumber", () => {
  it("retorna shape parseado em 200 OK", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        id: "123",
        display_phone_number: "+55 11 9999-0000",
        verified_name: "Nexus",
        quality_rating: "GREEN",
      }),
      { status: 200 }
    ));
    const r = await getPhoneNumber("123", "TOKEN");
    expect(r).toEqual({
      id: "123",
      displayPhoneNumber: "+55 11 9999-0000",
      verifiedName: "Nexus",
      qualityRating: "GREEN",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v20.0/123?fields=display_phone_number,verified_name,quality_rating"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer TOKEN" }),
      })
    );
  });
});

describe("graph-api — erros", () => {
  it("joga MetaApiError em 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 100, error_subcode: 33, message: "fail", fbtrace_id: "abc" } }),
      { status: 400 }
    ));
    await expect(getPhoneNumber("x", "t")).rejects.toMatchObject({
      name: "MetaApiError",
      status: 400,
      code: 100,
      subcode: 33,
      message: "fail",
      fbtraceId: "abc",
    });
  });

  it("faz 1 retry em 5xx e sucede", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ id: "1", display_phone_number: "x", verified_name: "y" }),
        { status: 200 }
      ));
    const r = await getPhoneNumber("1", "t");
    expect(r.id).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não retry em 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 190, message: "expired" } }),
      { status: 401 }
    ));
    await expect(getPhoneNumber("1", "t")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeFields / subscribeApp / unsubscribeApp", () => {
  it("POSTa callback_url, verify_token, fields (CSV), object", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await subscribeFields("APPID", {
      object: "whatsapp_business_account",
      callbackUrl: "https://x.com/webhook/abc",
      verifyToken: "vt",
      fields: ["messages", "message_echoes"],
    }, "TOKEN");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v20.0/APPID/subscriptions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      object: "whatsapp_business_account",
      callback_url: "https://x.com/webhook/abc",
      verify_token: "vt",
      fields: "messages,message_echoes",
    });
  });

  it("subscribeApp POSTa em /{waba}/subscribed_apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await subscribeApp("WABA", "T");
    expect(fetchMock.mock.calls[0][0]).toContain("/v20.0/WABA/subscribed_apps");
  });

  it("unsubscribeApp DELETE em /{waba}/subscribed_apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await unsubscribeApp("WABA", "T");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("listSubscribedApps / listSubscriptions", () => {
  it("parseia lista de apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: [{ whatsapp_business_api_data: { id: "APPID", name: "Nexus" } }] }),
      { status: 200 }
    ));
    const r = await listSubscribedApps("WABA", "T");
    expect(r).toEqual([{ appId: "APPID", name: "Nexus" }]);
  });

  it("parseia subscriptions (com fallback para fields undefined)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: [
          { object: "whatsapp_business_account", callback_url: "https://x/w/k", fields: [{ name: "messages" }] },
          { object: "whatsapp_business_account", callback_url: "https://x/w/z" },
        ],
      }),
      { status: 200 }
    ));
    const r = await listSubscriptions("APPID", "T");
    expect(r).toEqual([
      { object: "whatsapp_business_account", callbackUrl: "https://x/w/k", fields: ["messages"] },
      { object: "whatsapp_business_account", callbackUrl: "https://x/w/z", fields: [] },
    ]);
  });
});

describe("serializeErrorSafe", () => {
  it("allowlist campos e trunca a 500 chars", () => {
    const err = new MetaApiError({
      status: 400,
      code: 190,
      message: "x".repeat(1000),
      fbtraceId: "zzz",
    });
    const s = serializeErrorSafe(err);
    expect(s.length).toBeLessThanOrEqual(500);
    const obj = JSON.parse(s.endsWith("...") ? s.slice(0, -3) + '"}' : s);
    expect(Object.keys(obj).sort()).toEqual(expect.arrayContaining(["code", "fbtraceId", "message", "status"]));
  });

  it("lida com erro não-MetaApi", () => {
    const s = serializeErrorSafe(new Error("boom"));
    const obj = JSON.parse(s);
    expect(obj.message).toBe("boom");
  });
});
