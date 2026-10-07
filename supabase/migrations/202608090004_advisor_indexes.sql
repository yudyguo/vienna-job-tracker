create index if not exists application_events_application_idx
  on public.application_events (application_id, created_at desc);

create index if not exists notifications_automation_run_idx
  on public.notifications (automation_run_id)
  where automation_run_id is not null;
