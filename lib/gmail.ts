import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { RawJob } from "@/lib/jobs/ingest";
import { parseAlertJobSummary, parseGmailPayload, parseMailboxAddress, type GmailPayloadPart } from "@/lib/email/parser";

export class GmailReconnectRequiredError extends Error {
  constructor() {
    super("Gmail authorization expired. Reconnect Gmail in Settings.");
    this.name = "GmailReconnectRequiredError";
  }
}

function stateKey() {
  if (!env.SESSION_SIGNING_KEY) throw new Error("SESSION_SIGNING_KEY is not configured.");
  return new TextEncoder().encode(env.SESSION_SIGNING_KEY);
}

function encryptionKey() {
  if (!env.GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = /^[a-f0-9]{64}$/i.test(env.GMAIL_TOKEN_ENCRYPTION_KEY) ? Buffer.from(env.GMAIL_TOKEN_ENCRYPTION_KEY, "hex") : Buffer.from(env.GMAIL_TOKEN_ENCRYPTION_KEY, "base64url");
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes.");
  return key;
}

export async function createGmailState() {
  return new SignJWT({ purpose: "gmail-oauth" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(stateKey());
}

export async function verifyGmailState(token: string) {
  try { const { payload } = await jwtVerify(token, stateKey(), { algorithms: ["HS256"] }); return payload.purpose === "gmail-oauth"; }
  catch { return false; }
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

function decryptToken(encrypted: string, iv: string, tag: string) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function redirectUri() {
  if (!env.APP_URL) throw new Error("APP_URL is not configured.");
  return new URL("/api/gmail/callback", env.APP_URL).toString();
}

export function gmailAuthorizationUrl(state: string) {
  if (!env.GMAIL_CLIENT_ID) throw new Error("GMAIL_CLIENT_ID is not configured.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send", state }).toString();
  return url.toString();
}

async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GMAIL_CLIENT_ID ?? "", client_secret: env.GMAIL_CLIENT_SECRET ?? "", redirect_uri: redirectUri(), grant_type: "authorization_code" }) });
  if (!response.ok) throw new Error(`Gmail token exchange failed with ${response.status}.`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>;
}

async function profile(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Could not read Gmail profile (${response.status}).`);
  return response.json() as Promise<{ emailAddress: string }>;
}

export async function saveGmailConnection(code: string) {
  const tokens = await exchangeCode(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Reconnect with consent.");
  const account = await profile(tokens.access_token);
  if (env.GMAIL_OWNER_EMAIL && account.emailAddress.toLowerCase() !== env.GMAIL_OWNER_EMAIL.toLowerCase()) throw new Error("Connected Gmail account does not match GMAIL_OWNER_EMAIL.");
  const token = encryptToken(tokens.refresh_token);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("oauth_connections").upsert({ provider: "gmail", account_email: account.emailAddress, scopes: tokens.scope.split(" "), encrypted_refresh_token: token.encrypted, token_iv: token.iv, token_tag: token.tag, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), metadata: { sendOnlyToSelf: true, allowedLabels: ["Job Alerts", "Job Applications"], connectionStatus: "active", connectedAt: new Date().toISOString(), lastErrorAt: null } }, { onConflict: "provider" });
  if (error) throw new Error(error.message);
  return account.emailAddress;
}

export async function gmailAccess() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("oauth_connections").select("account_email,encrypted_refresh_token,token_iv,token_tag,metadata").eq("provider", "gmail").maybeSingle();
  if (!data?.encrypted_refresh_token || !data.token_iv || !data.token_tag) return null;
  const refreshToken = decryptToken(data.encrypted_refresh_token, data.token_iv, data.token_tag);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.GMAIL_CLIENT_ID ?? "", client_secret: env.GMAIL_CLIENT_SECRET ?? "", grant_type: "refresh_token" }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (response.status === 400 && payload.error === "invalid_grant") {
      const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
      await supabase.from("oauth_connections").update({ metadata: { ...metadata, connectionStatus: "reauthorization_required", lastErrorAt: new Date().toISOString(), lastErrorCode: "invalid_grant" } }).eq("provider", "gmail");
      throw new GmailReconnectRequiredError();
    }
    throw new Error(`Gmail refresh failed with ${response.status}.`);
  }
  const token = await response.json() as { access_token: string };
  return { accessToken: token.access_token, email: String(data.account_email) };
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPayloadPart;
  historyId?: string;
}

export type GmailAccessContext = { accessToken: string; email: string };

function headersOf(message: GmailMessage) {
  const headers = message.payload?.headers ?? [];
  const get = (name: string) => headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return { subject: get("Subject"), from: get("From"), to: get("To"), messageId: get("Message-ID") };
}

async function gmailRequest<T>(auth: { accessToken: string }, url: URL | string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${auth.accessToken}` } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { errors?: Array<{ reason?: string }>; status?: string } } | null;
    const reason = payload?.error?.errors?.[0]?.reason ?? payload?.error?.status;
    throw new Error(`Gmail API request failed with ${response.status}${reason ? ` (${reason})` : ""}.`);
  }
  return response.json() as Promise<T>;
}

export async function listGmailMessages(query: string, maxResults = 100) {
  const auth = await gmailAccess();
  if (!auth) return { auth: null, messages: [] as Array<{ id: string; threadId?: string }>, resultSizeEstimate: 0 };
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query);
  const messages: Array<{ id: string; threadId?: string }> = [];
  let pageToken: string | undefined;
  let resultSizeEstimate = 0;
  do {
    listUrl.searchParams.set("maxResults", String(Math.min(500, maxResults - messages.length)));
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken); else listUrl.searchParams.delete("pageToken");
    const list = await gmailRequest<{ messages?: Array<{ id: string; threadId?: string }>; resultSizeEstimate?: number; nextPageToken?: string }>(auth, listUrl);
    messages.push(...(list.messages ?? []));
    resultSizeEstimate = list.resultSizeEstimate ?? resultSizeEstimate;
    pageToken = list.nextPageToken;
  } while (pageToken && messages.length < maxResults);
  return { auth, messages: messages.slice(0, maxResults), resultSizeEstimate };
}

export async function fetchGmailMessageWithAuth(auth: GmailAccessContext, id: string, format: "metadata" | "full") {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", format);
  if (format === "metadata") {
    for (const header of ["Subject", "From", "To", "Date", "Message-ID"]) url.searchParams.append("metadataHeaders", header);
  }
  return gmailRequest<GmailMessage>(auth, url);
}

export async function fetchGmailMessage(id: string, format: "metadata" | "full" = "full") {
  const auth = await gmailAccess();
  if (!auth) return null;
  return fetchGmailMessageWithAuth(auth, id, format);
}

export async function fetchGmailMessageMetadata(ids: string[]) {
  const auth = await gmailAccess();
  if (!auth) return [];
  const results: GmailMessage[] = [];
  for (let index = 0; index < ids.length; index += 12) {
    const batch = await Promise.all(ids.slice(index, index + 12).map((id) => fetchGmailMessageWithAuth(auth, id, "metadata")));
    results.push(...batch);
  }
  return results;
}

export function parseGmailMessage(message: GmailMessage) {
  const headers = headersOf(message);
  const sender = parseMailboxAddress(headers.from);
  const parsed = parseGmailPayload(message.payload ?? {});
  return { ...headers, sender, ...parsed };
}

export function gmailMessageToAlertJob(message: GmailMessage): RawJob | null {
  const parsed = parseGmailMessage(message);
  if (parsed.text.length < 30) return null;
  const senderIdentity = [parsed.sender.name, parsed.sender.email].filter(Boolean).join(" ");
  const alert = parseAlertJobSummary(parsed.subject, senderIdentity, parsed.text, parsed.links);
  return {
    title: alert.title,
    company: alert.company,
    location: alert.location,
    jdText: alert.summaryText,
    jdQuality: "summary",
    parserVersion: parsed.parserVersion,
    source: "gmail_job_alert",
    sourceUrl: alert.sourceUrl,
    externalId: message.id,
    publishedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
  };
}

export async function fetchGmailAlertJobs(): Promise<RawJob[]> {
  const listed = await listGmailMessages('label:"Job Alerts" newer_than:7d', 50);
  if (!listed.auth) return [];
  const jobs: RawJob[] = [];
  for (const item of listed.messages) {
    const message = await fetchGmailMessage(item.id, "full");
    if (!message) continue;
    const job = gmailMessageToAlertJob(message);
    if (job) jobs.push(job);
  }
  return jobs;
}

export async function sendGmailDigest(subject: string, body: string) {
  const auth = await gmailAccess();
  if (!auth) return { skipped: true };
  if (env.GMAIL_OWNER_EMAIL && auth.email.toLowerCase() !== env.GMAIL_OWNER_EMAIL.toLowerCase()) throw new Error("Digest recipient is not the configured owner.");
  const raw = Buffer.from(`To: ${auth.email}\r\nFrom: ${auth.email}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`).toString("base64url");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${auth.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ raw }) });
  if (!response.ok) throw new Error(`Gmail send failed with ${response.status}.`);
  return { skipped: false };
}
