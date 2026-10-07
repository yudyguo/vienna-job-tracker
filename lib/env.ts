import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SIGNING_KEY: z.string().min(32).optional(),
  AUTOMATION_SHARED_SECRET: z.string().min(16).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_FAST_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_QUALITY_MODEL: z.string().default("deepseek-v4-pro"),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  GMAIL_OWNER_EMAIL: z.string().email().optional(),
  GREENHOUSE_BOARDS: z.string().default(""),
  LEVER_SITES: z.string().default(""),
  ASHBY_BOARDS: z.string().default(""),
});

export const env = schema.parse(process.env);

export function integrationStatus() {
  return {
    supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
    deepseek: Boolean(env.DEEPSEEK_API_KEY),
    gmail: Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_TOKEN_ENCRYPTION_KEY),
    automation: Boolean(env.AUTOMATION_SHARED_SECRET),
    authentication: Boolean(env.ADMIN_PASSWORD_HASH && env.SESSION_SIGNING_KEY),
  };
}
