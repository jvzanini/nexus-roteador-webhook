import { exchangeCode, exchangeForLongLivedToken, validateBusinessAccess } from "../oauth";
import { MetaApiError } from "../graph-api";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  process.env.META_GRAPH_API_URL = "https://graph.facebook.com";
  process.env.META_API_VERSION = "v20.0";
  process.env.META_APP_ID = "APP";
  process.env.META_APP_SECRET = "SECRET";
});

describe("exchangeCode", () => {
  it("GET /oauth/access_token com query params e retorna token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ access_token: "SHORT", token_type: "bearer", expires_in: 3600 }),
      { status: 200 }
    ));
    const r = await exchangeCode("CODE", "https://x.com/cb");
    expect(r).toEqual({ accessToken: "SHORT", tokenType: "bearer", expiresIn: 3600 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v20.0/oauth/access_token");
    expect(url).toContain("client_id=APP");
    expect(url).toContain("client_secret=SECRET");
    expect(url).toContain("code=CODE");
  });

  it("joga MetaApiError em 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 100, message: "bad code" } }),
      { status: 400 }
    ));
    await expect(exchangeCode("x", "y")).rejects.toBeInstanceOf(MetaApiError);
  });

  it("joga Error se META_APP_ID ausente", async () => {
    delete process.env.META_APP_ID;
    await expect(exchangeCode("x", "y")).rejects.toThrow(/META_APP/);
  });
});

describe("exchangeForLongLivedToken", () => {
  it("GET grant_type=fb_exchange_token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ access_token: "LONG", expires_in: 5184000 }),
      { status: 200 }
    ));
    const r = await exchangeForLongLivedToken("SHORT");
    expect(r).toEqual({ accessToken: "LONG", expiresIn: 5184000 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("grant_type=fb_exchange_token");
    expect(url).toContain("fb_exchange_token=SHORT");
  });
});

describe("validateBusinessAccess", () => {
  it("2 calls (WABA + phone) quando ambas 200", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "WABA", name: "x" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "PN", display_phone_number: "+55" }), { status: 200 }));
    await expect(validateBusinessAccess("TOKEN", "WABA", "PN")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falha se WABA não acessível", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 100, message: "no access" } }),
      { status: 403 }
    ));
    await expect(validateBusinessAccess("T", "W", "P")).rejects.toBeInstanceOf(MetaApiError);
  });
});
