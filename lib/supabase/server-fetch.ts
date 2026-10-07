/**
 * New Supabase secret keys authenticate through `apikey`; they are not JWTs.
 * supabase-js also mirrors the key into Authorization by default, so remove
 * that exact value before the request reaches Supabase's JWT verifier.
 */
export function createSupabaseServerFetch(secretKey: string, baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (secretKey.startsWith("sb_secret_") && headers.get("authorization") === `Bearer ${secretKey}`) {
      headers.delete("authorization");
    }
    return baseFetch(input, { ...init, headers });
  };
}
