do $$
begin
  if not exists (select 1 from vault.secrets where name = 'job_tracker_app_url') then
    perform vault.create_secret('https://vienna-job-tracker.vercel.app', 'job_tracker_app_url', 'Production URL for Vienna Job Desk scheduler');
  end if;
end $$;

create or replace function public.invoke_vienna_job_tracker_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  shared_secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'job_tracker_app_url';
  select decrypted_secret into shared_secret from vault.decrypted_secrets where name = 'job_tracker_automation_secret';
  if app_url is null or shared_secret is null then
    return;
  end if;
  perform net.http_post(
    url := app_url || '/api/automation/daily',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || shared_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.invoke_vienna_job_tracker_daily() from public, anon, authenticated;

select cron.schedule(
  'vienna-job-tracker-hourly-gate',
  '30 * * * *',
  'select public.invoke_vienna_job_tracker_daily();'
);
