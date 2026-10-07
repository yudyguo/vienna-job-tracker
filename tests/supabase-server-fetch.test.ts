import { describe, expect, it, vi } from "vitest";
import { createSupabaseServerFetch } from "@/lib/supabase/server-fetch";

function response() {
  return new Response("ok", { status: 200 });
}

describe("Supabase server fetch", () => {
  it("sends a new secret key only through the apikey header", async () => {
    const secret = "sb_secret_test-value";
    const baseFetch = vi.fn(async () => response()) as unknown as typeof fetch;
    const serverFetch = createSupabaseServerFetch(secret, baseFetch);

    await serverFetch("https://example.supabase.co/rest/v1/jobs", {
      headers: { apikey: secret, authorization: `Bearer ${secret}` },
    });

    const request = vi.mocked(baseFetch).mock.calls[0];
    const headers = new Headers(request[1]?.headers);
    expect(headers.get("apikey")).toBe(secret);
    expect(headers.has("authorization")).toBe(false);
  });

  it("preserves a real user JWT in the Authorization header", async () => {
    const secret = "sb_secret_test-value";
    const baseFetch = vi.fn(async () => response()) as unknown as typeof fetch;
    const serverFetch = createSupabaseServerFetch(secret, baseFetch);

    await serverFetch("https://example.supabase.co/rest/v1/jobs", {
      headers: { apikey: secret, authorization: "Bearer real.user.jwt" },
    });

    const request = vi.mocked(baseFetch).mock.calls[0];
    expect(new Headers(request[1]?.headers).get("authorization")).toBe("Bearer real.user.jwt");
  });

  it("does not alter legacy service-role JWT behavior", async () => {
    const legacyKey = "eyJlegacy.service.role";
    const baseFetch = vi.fn(async () => response()) as unknown as typeof fetch;
    const serverFetch = createSupabaseServerFetch(legacyKey, baseFetch);

    await serverFetch("https://example.supabase.co/rest/v1/jobs", {
      headers: { apikey: legacyKey, authorization: `Bearer ${legacyKey}` },
    });

    const request = vi.mocked(baseFetch).mock.calls[0];
    expect(new Headers(request[1]?.headers).get("authorization")).toBe(`Bearer ${legacyKey}`);
  });
});
