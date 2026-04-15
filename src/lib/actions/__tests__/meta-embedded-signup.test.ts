jest.mock("@/lib/prisma", () => ({
  prisma: { userCompanyMembership: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/redis", () => ({ redis: { set: jest.fn(async () => "OK") } }));

import { startEmbeddedSignup } from "../meta-embedded-signup";
import { getCurrentUser } from "@/lib/auth";
import { redis } from "@/lib/redis";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.META_APP_ID = "APP";
  process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = "CFG";
  process.env.NEXTAUTH_URL = "https://x.com";
});

it("rejeita sem user", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue(null);
  const r = await startEmbeddedSignup(VALID_UUID);
  expect(r.success).toBe(false);
});

it("rejeita sem env", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
  delete process.env.META_APP_ID;
  const r = await startEmbeddedSignup(VALID_UUID);
  expect(r.success).toBe(false);
});

it("happy path persiste state e retorna config", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
  const r = await startEmbeddedSignup(VALID_UUID);
  expect(r.success).toBe(true);
  expect(r.data!.appId).toBe("APP");
  expect(r.data!.configId).toBe("CFG");
  expect(r.data!.state).toMatch(/^[a-f0-9]{48}$/);
  expect(redis.set).toHaveBeenCalledWith(
    expect.stringContaining("meta:oauth:state:u:"),
    expect.stringMatching(/^[a-f0-9]{48}$/),
    "EX",
    600
  );
});
