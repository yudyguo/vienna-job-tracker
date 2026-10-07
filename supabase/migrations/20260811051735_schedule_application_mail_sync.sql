create or replace function public.invoke_vienna_job_tracker_mail_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  shared_secret text;
begin
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'job_tracker_app_url';

  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where name = 'job_tracker_automation_secret';

  if app_url is null or shared_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(app_url, '/') || '/api/automation/mail-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || shared_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.invoke_vienna_job_tracker_mail_sync()
from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'vienna-job-tracker-mail-sync-15m';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'vienna-job-tracker-mail-sync-15m',
  '*/15 * * * *',
  'select public.invoke_vienna_job_tracker_mail_sync();'
);
