alter table public.jobs
  add column if not exists scoring_status text not null default 'completed'
    check (scoring_status in ('queued', 'scoring', 'completed', 'failed')),
  add column if not exists scoring_error text,
  add column if not exists scoring_workflow_run_id text,
  add column if not exists scoring_started_at timestamptz,
  add column if not exists scoring_completed_at timestamptz;

create index if not exists jobs_scoring_status_idx
  on public.jobs (scoring_status, updated_at desc);
