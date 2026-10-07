create or replace function public.set_job_tracker_automation_secret(secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if secret_value is null or length(secret_value) < 32 then
    raise exception 'Automation secret must contain at least 32 characters';
  end if;

  select id
  into existing_id
  from vault.secrets
  where name = 'job_tracker_automation_secret'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      secret_value,
      'job_tracker_automation_secret',
      'Shared secret for the Vienna Job Tracker mail-sync scheduler',
      null
    );
  else
    perform vault.update_secret(
      existing_id,
      secret_value,
      'job_tracker_automation_secret',
      'Shared secret for the Vienna Job Tracker mail-sync scheduler',
      null
    );
  end if;
end;
$$;

revoke all on function public.set_job_tracker_automation_secret(text) from public, anon, authenticated;
grant execute on function public.set_job_tracker_automation_secret(text) to service_role;
