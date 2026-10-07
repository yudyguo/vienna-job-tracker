alter table public.jobs
  add column listing_status text not null default 'unknown'
    check (listing_status in ('unknown', 'active', 'closed')),
  add column listing_status_source text,
  add column listing_checked_at timestamptz,
  add column listing_closed_at timestamptz;

create index jobs_listing_status_score_idx
  on public.jobs(listing_status, score desc);
