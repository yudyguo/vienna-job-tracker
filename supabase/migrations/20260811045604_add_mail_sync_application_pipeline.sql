alter table public.jobs
  add column jd_quality text not null default 'full'
    check (jd_quality in ('full', 'summary', 'missing')),
  add column parser_version text,
  add column merged_into_job_id uuid references public.jobs(id) on delete set null;

create index jobs_merged_into_job_idx on public.jobs(merged_into_job_id)
  where merged_into_job_id is not null;

alter table public.applications drop constraint if exists applications_status_check;
update public.applications
set status = case
  when status in ('interview', 'task', 'offer', 'rejected', 'archived', 'applied') then status
  else 'needs_match'
end;
alter table public.applications
  alter column status set default 'needs_match',
  add constraint applications_status_check
    check (status in ('needs_match', 'applied', 'interview', 'task', 'offer', 'rejected', 'archived')),
  add column latest_message_at timestamptz,
  add column stage_source text not null default 'manual',
  add column classification_confidence numeric(4,3)
    check (classification_confidence between 0 and 1),
  add column match_confidence numeric(4,3)
    check (match_confidence between 0 and 1),
  add column priority_at timestamptz,
  add column requires_review boolean not null default false;

create index applications_stage_priority_idx
  on public.applications(status, next_action_at, priority_at desc, latest_message_at desc);

create table public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  gmail_message_id text not null unique,
  gmail_thread_id text,
  gmail_url text not null,
  subject text not null,
  sender_name text,
  sender_email text,
  received_at timestamptz not null,
  body_text text not null,
  classification text not null
    check (classification in ('acknowledgement', 'interview', 'task', 'offer', 'rejection', 'next_step', 'other')),
  classification_confidence numeric(4,3) not null
    check (classification_confidence between 0 and 1),
  extracted_company text,
  extracted_title text,
  next_action text,
  next_action_at timestamptz,
  match_confidence numeric(4,3)
    check (match_confidence between 0 and 1),
  requires_review boolean not null default false,
  parser_version text not null,
  created_at timestamptz not null default now()
);

create index application_messages_application_received_idx
  on public.application_messages(application_id, received_at desc);
create index application_messages_review_idx
  on public.application_messages(requires_review, received_at desc)
  where requires_review;

alter table public.application_events
  add column application_message_id uuid references public.application_messages(id) on delete set null,
  add column metadata jsonb not null default '{}'::jsonb;
create index application_events_message_idx on public.application_events(application_message_id)
  where application_message_id is not null;

create table public.preparation_packs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  kind text not null check (kind in ('interview', 'task', 'offer', 'general')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preparation_pack_versions (
  id uuid primary key default gen_random_uuid(),
  preparation_pack_id uuid not null references public.preparation_packs(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft', 'needs_jd', 'failed')),
  content_json jsonb not null default '{}'::jsonb,
  fact_ids text[] not null default '{}',
  model text,
  prompt_version text,
  audit_source text not null default 'system',
  created_at timestamptz not null default now(),
  unique(preparation_pack_id, version)
);
create index preparation_pack_versions_pack_idx
  on public.preparation_pack_versions(preparation_pack_id, version desc);

create table public.gmail_sync_state (
  provider text primary key,
  last_scanned_at timestamptz,
  initial_backfill_completed boolean not null default false,
  last_history_id text,
  updated_at timestamptz not null default now()
);

create table public.mail_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('scheduled', 'manual', 'backfill', 'rebuild')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'skipped')),
  workflow_run_id text,
  scanned integer not null default 0,
  candidates integer not null default 0,
  imported integer not null default 0,
  updated_applications integer not null default 0,
  needs_review integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index mail_sync_runs_started_idx on public.mail_sync_runs(started_at desc);

create table public.ai_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  operation text not null,
  model text not null,
  prompt_version text not null,
  attempt smallint not null check (attempt between 1 and 5),
  status text not null check (status in ('completed', 'failed')),
  error_path text,
  duration_ms integer,
  request_id text,
  token_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_generation_attempts_job_idx on public.ai_generation_attempts(job_id, created_at desc)
  where job_id is not null;
create index ai_generation_attempts_application_idx on public.ai_generation_attempts(application_id, created_at desc)
  where application_id is not null;

create table public.data_rebuild_backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create trigger preparation_packs_updated_at
  before update on public.preparation_packs
  for each row execute function public.set_updated_at();
create trigger gmail_sync_state_updated_at
  before update on public.gmail_sync_state
  for each row execute function public.set_updated_at();

alter table public.application_messages enable row level security;
alter table public.preparation_packs enable row level security;
alter table public.preparation_pack_versions enable row level security;
alter table public.gmail_sync_state enable row level security;
alter table public.mail_sync_runs enable row level security;
alter table public.ai_generation_attempts enable row level security;
alter table public.data_rebuild_backups enable row level security;

revoke all on public.application_messages from anon, authenticated;
revoke all on public.preparation_packs from anon, authenticated;
revoke all on public.preparation_pack_versions from anon, authenticated;
revoke all on public.gmail_sync_state from anon, authenticated;
revoke all on public.mail_sync_runs from anon, authenticated;
revoke all on public.ai_generation_attempts from anon, authenticated;
revoke all on public.data_rebuild_backups from anon, authenticated;
