# Vienna Job Desk

A single-user Next.js workbench for a Vienna job search. It imports job alerts and public ATS listings, applies evidence-based filtering and a 100-point score, creates fact-cited application drafts with DeepSeek, and keeps every material version in private Supabase Storage.

The system never submits job applications. A human review is required before use.

## Architecture

- **App:** Next.js 16 App Router + TypeScript
- **Durability:** Vercel Workflow SDK
- **Data and files:** Supabase Postgres + private `job-materials` bucket
- **AI:** DeepSeek server-side only, JSON mode + Zod validation
- **Clock:** Supabase Cron checks the daily job workflow at minute 30 and triggers application-mail sync every 15 minutes

Every external service is optional and configured through environment variables; nothing is baked into the repository.

## Demo mode

With no environment variables set, all data access falls back to the bundled sample data in [`lib/sample-data.ts`](./lib/sample-data.ts) and the dashboard renders the demo notice instead of live data. To view the demo locally, configure only the two authentication variables:

```bash
cp .env.example .env.local
npm run hash-password     # paste the printed hash into ADMIN_PASSWORD_HASH, escaping each $ as \$
openssl rand -hex 32      # paste into SESSION_SIGNING_KEY
npm run dev
```

The `$` escaping is required: Next.js expands unescaped `$` in `.env` files, which would truncate the `scrypt$salt$hash` value.

Without `ADMIN_PASSWORD_HASH` and `SESSION_SIGNING_KEY` the dashboard stays behind the login screen. Supabase, DeepSeek and Gmail can stay unset.

## Deploying your own instance

Never paste a password, API key, OAuth token, or shared secret into chat, Git, a client-side variable, or a log.

### 1. Administrator password

Generate a salted scrypt hash locally. The prompt hides the password and refuses command-line arguments:

```bash
npm run hash-password
```

Copy only the resulting `scrypt$...` hash to Vercel → Project Settings → Environment Variables:

- name: `ADMIN_PASSWORD_HASH`
- environment: Production only
- type: Sensitive

The original password stays only in your memory/password manager.

### 2. Supabase server key

In the Supabase project, open Project Settings → API Keys and create/copy a modern secret key beginning with `sb_secret_`. Add it to Vercel as `SUPABASE_SECRET_KEY`, Production only, Sensitive.

The browser never receives this key. RLS is enabled on every application table, and there are no anonymous policies.

### 3. DeepSeek key

Add `DEEPSEEK_API_KEY` through the Vercel dashboard, Production only, Sensitive. Do not add it to Preview, Build, Supabase, `.env.local`, or any `NEXT_PUBLIC_` variable.

The provider logs model name, duration, prompt version and status only. It does not log Authorization, full prompts, email content or reasoning.

### 4. Daily trigger secret

Generate one random value locally (for example, with a password manager). Store the same value in two places:

1. Vercel Sensitive environment variable `AUTOMATION_SHARED_SECRET`, Production only.
2. Supabase Database → Vault, secret name `job_tracker_automation_secret`.

The installed Cron SQL reads the value from Vault; the Cron definition contains no plaintext secret.

### 5. Optional Gmail OAuth

Create a Google OAuth web client with redirect URL:

```text
https://your-production-domain.example.com/api/gmail/callback
```

Add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_OWNER_EMAIL` in Vercel Production. The app requests only `gmail.readonly` and `gmail.send`. Job discovery reads the `Job Alerts` label. Application tracking scans Inbox metadata, fetches a full body only when the subject/sender/snippet looks job-related, and never changes Gmail state. It stores only cleaned text plus a Gmail link; raw HTML and attachment copies are not retained. Summaries are sent only to the connected account itself. Refresh tokens are AES-GCM encrypted before storage.

### 6. Job sources

Set comma-separated public board identifiers as needed:

- `GREENHOUSE_BOARDS`
- `LEVER_SITES`
- `ASHBY_BOARDS`

LinkedIn is supported only through official Job Alert emails. Do not add a LinkedIn scraper.

After adding or rotating any Vercel variable, redeploy Production. For DeepSeek rotation, deploy and verify the new value before revoking the old key.

## Local checks

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

The production build intentionally uses webpack because Workflow SDK's local-world CLI dependency currently conflicts with Next 16's Turbopack page-data worker. The small `xdg-app-paths` build shim affects only Workflow/Vercel CLI path discovery; it does not handle application data or secrets.

## Material policy

- Automatic materials require a score of 80 or more and no hard blocker.
- A complete JD is required. Alert summaries are capped at 69 until the full JD is pasted and rescored.
- At most three jobs enter the automatic material queue per run.
- German C1/C2, internships/student roles, more than five required years, and out-of-scope locations are blocked.
- Salary below €45k is a warning, not a filter.
- Every experience record, skill, education item, resume bullet and cover-letter paragraph must cite verified CandidateFact IDs.
- A failed/empty/invalid DeepSeek response is retried once; no partial draft is saved.
- ATS resume, Hallmark resume, and cover letter are stored as JSON, Typst, DOCX, and—when WASM compilation succeeds—PDF. A failed PDF compile becomes `compile_pending` without blocking the other formats.

## Data and migrations

Migrations are in [`supabase/migrations`](./supabase/migrations). They create RLS-protected tables, private storage, candidate facts from the two source CVs, and the Supabase Cron gates.

Application email records are idempotent by Gmail message ID. High-confidence acknowledgements, interviews, assignments, offers and explicit rejections update the application board; ambiguous mail is saved for review. Interview/task/offer stages create versioned preparation packs grounded in verified CandidateFact IDs. The system never submits an application or modifies Gmail.
