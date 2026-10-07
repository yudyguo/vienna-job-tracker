insert into public.data_rebuild_backups (kind, payload)
select
  'gmail_jobs_before_summary_guard',
  jsonb_build_object(
    'capturedAt', now(),
    'jobs', coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
  )
from public.jobs j
where exists (
  select 1
  from public.job_sources s
  where s.job_id = j.id
    and s.source_type = 'gmail_job_alert'
);

update public.jobs j
set
  jd_quality = 'summary',
  parser_version = coalesce(j.parser_version, 'legacy-gmail-digest'),
  score = least(j.score, 69),
  score_components = j.score_components || jsonb_build_object('qualityCap', 69, 'evidence', 0),
  match_reasons = '{}',
  warnings = array_append(array_remove(j.warnings, 'JD summary only'), 'JD summary only'),
  status = case when j.status = 'shortlisted' then 'new' else j.status end,
  audit_source = 'gmail_summary_guard'
where exists (
  select 1
  from public.job_sources s
  where s.job_id = j.id
    and s.source_type = 'gmail_job_alert'
);
