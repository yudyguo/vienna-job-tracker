import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("signed admin session", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SESSION_SIGNING_KEY", "a".repeat(64));
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts an intact token and rejects tampering", async () => {
    const { createSessionToken, verifySessionToken } = await import("@/lib/auth");
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
    const parts = token.split(".");
    const payload = `${parts[1]?.slice(0, 3)}${parts[1]?.[3] === "x" ? "y" : "x"}${parts[1]?.slice(4)}`;
    expect(await verifySessionToken(`${parts[0]}.${payload}.${parts[2]}`)).toBe(false);
  });

  it("normalizes an env-file hash copied into a hosting dashboard", async () => {
    const { normalizePasswordHash } = await import("@/lib/auth");
    expect(normalizePasswordHash('"scrypt\\$salt\\$hash"')).toBe("scrypt$salt$hash");
    expect(normalizePasswordHash("scrypt$salt$hash")).toBe("scrypt$salt$hash");
  });
});
