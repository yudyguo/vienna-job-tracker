create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.candidate_facts (
  id text primary key,
  category text not null check (category in ('experience','skill','education','language','award','project')),
  label text not null,
  value text not null,
  evidence text not null,
  verified boolean not null default false,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  company text not null,
  title text not null,
  track text not null check (track in ('design','product')),
  location text not null,
  remote_policy text not null default 'Not specified',
  score smallint not null default 0 check (score between 0 and 100),
  score_components jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','shortlisted','materials_ready','reviewed','applied','interview','task','offer','rejected','archived')),
  language_requirement text not null default 'Not specified',
  salary_min integer,
  salary_max integer,
  currency text,
  years_required numeric,
  employment_type text,
  tags text[] not null default '{}',
  source text not null,
  source_url text,
  published_at timestamptz not null default now(),
  captured_at timestamptz not null default now(),
  summary text not null default '',
  jd_text text,
  match_reasons text[] not null default '{}',
  blockers text[] not null default '{}',
  warnings text[] not null default '{}',
  matched_fact_ids text[] not null default '{}',
  source_language text not null default 'en',
  audit_source text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_score_idx on public.jobs(status, score desc);
create index jobs_published_at_idx on public.jobs(published_at desc);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  source_type text not null,
  source_url text,
  external_id text,
  raw_snapshot jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(job_id, source_type, external_id)
);

create table public.job_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  jd_storage_path text,
  source text not null,
  created_at timestamptz not null default now(),
  unique(job_id, version)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('resume_ats','resume_hallmark','cover_letter')),
  language text not null check (language in ('en','de')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, kind, language)
);

create table public.material_versions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  version integer not null,
  format text not null check (format in ('json','typ','pdf','docx')),
  status text not null default 'draft' check (status in ('draft','reviewed','approved','compile_pending','failed')),
  storage_path text,
  content_json jsonb,
  model text,
  prompt_version text,
  fact_ids text[] not null default '{}',
  generation_metadata jsonb not null default '{}'::jsonb,
  audit_source text not null default 'system',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(material_id, version, format)
);

create index material_versions_material_idx on public.material_versions(material_id, version desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  status text not null default 'reviewed' check (status in ('new','shortlisted','materials_ready','reviewed','applied','interview','task','offer','rejected','archived')),
  applied_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  local_date date not null,
  trigger text not null check (trigger in ('scheduled','manual')),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','skipped')),
  workflow_run_id text,
  discovered integer not null default 0,
  deduplicated integer not null default 0,
  high_score integer not null default 0,
  generated integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index automation_runs_daily_scheduled_idx on public.automation_runs(local_date) where trigger = 'scheduled';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  kind text not null,
  recipient text,
  subject text,
  status text not null default 'pending',
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  account_email text,
  scopes text[] not null default '{}',
  encrypted_refresh_token text,
  token_iv text,
  token_tag text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ip_created_idx on public.login_attempts(ip_hash, created_at desc);

create trigger candidate_facts_updated_at before update on public.candidate_facts for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger materials_updated_at before update on public.materials for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();
create trigger oauth_connections_updated_at before update on public.oauth_connections for each row execute function public.set_updated_at();

alter table public.candidate_facts enable row level security;
alter table public.jobs enable row level security;
alter table public.job_sources enable row level security;
alter table public.job_versions enable row level security;
alter table public.materials enable row level security;
alter table public.material_versions enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.automation_runs enable row level security;
alter table public.notifications enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.login_attempts enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-materials', 'job-materials', false, 10485760, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','application/json'])
on conflict (id) do update set public = false;

insert into public.candidate_facts (id, category, label, value, evidence, verified, source) values
('fact-years-4','experience','Product design experience','4+ years','Product and UX design across consumer health and B2B systems.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-wocute-growth','experience','Wocute growth','+40% daily active users; +31% retention','Research-led product releases for a women''s health product.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-tencent-delivery','experience','Tencent delivery','50+ features','Delivered platform features from definition through launch and iteration.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-alipay-research','experience','Alipay internal platform research','Research, workflow redesign, QA and launch support','Redesigned merchant workflows for an insurance platform.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-job-tracker','project','AI job application tracker','Event model, confidence states and human review workflow','Independent product project built in Vienna in 2026.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-product-skills','skill','Product practice','Discovery, requirements, workflow mapping, experimentation, stakeholder communication, usability testing','Skills and background section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-technical-skills','skill','Technical collaboration','REST APIs, Django/DRF, HTML/CSS, React, Git/GitHub','Technical skills section.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf'),
('fact-language-german','language','German','Conversational','Language section; do not treat as C1/C2 evidence.',true,'Yadi_Guo_UIUX_CV_Hallmark.pdf')
on conflict (id) do update set label = excluded.label, value = excluded.value, evidence = excluded.evidence, verified = excluded.verified, source = excluded.source;
