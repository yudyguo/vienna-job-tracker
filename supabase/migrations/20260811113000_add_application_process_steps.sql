create table public.application_process_steps (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  application_message_id uuid references public.application_messages(id) on delete set null,
  application_event_id uuid references public.application_events(id) on delete set null,
  kind text not null check (kind in (
    'applied', 'screening', 'interview', 'final_interview', 'task',
    'offer', 'rejection', 'status_change', 'other'
  )),
  round_number smallint check (round_number is null or round_number between 1 and 20),
  title text not null,
  occurred_at timestamptz not null,
  scheduled_at timestamptz,
  source text not null default 'system',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index application_process_steps_message_uidx
  on public.application_process_steps(application_message_id)
  where application_message_id is not null;

create unique index application_process_steps_event_uidx
  on public.application_process_steps(application_event_id)
  where application_event_id is not null;

create index application_process_steps_application_time_idx
  on public.application_process_steps(application_id, occurred_at desc, scheduled_at desc);

create index application_process_steps_upcoming_idx
  on public.application_process_steps(scheduled_at)
  where scheduled_at is not null;

create trigger application_process_steps_updated_at
  before update on public.application_process_steps
  for each row execute function public.set_updated_at();

alter table public.application_process_steps enable row level security;
revoke all on public.application_process_steps from anon, authenticated;
grant select, insert, update, delete on public.application_process_steps to service_role;

insert into public.application_process_steps (
  application_id,
  application_message_id,
  kind,
  round_number,
  title,
  occurred_at,
  scheduled_at,
  source,
  metadata
)
select
  message.application_id,
  message.id,
  case
    when message.classification = 'acknowledgement' then 'applied'
    when message.classification = 'task' then 'task'
    when message.classification = 'offer' then 'offer'
    when message.classification = 'rejection' then 'rejection'
    when message.classification = 'interview' and concat(message.subject, ' ', message.next_action) ~* '(final|finale|finalrunde|letzte runde)' then 'final_interview'
    when message.classification = 'interview' and concat(message.subject, ' ', message.next_action) ~* '(screen|erstgespräch|telefoninterview|phone interview|intro call|kennenlernen)' then 'screening'
    when message.classification = 'interview' then 'interview'
    else 'other'
  end,
  case
    when concat(message.subject, ' ', message.next_action) ~* '(1st|first|erste[rsn]?|erstgespräch)' then 1
    when concat(message.subject, ' ', message.next_action) ~* '(2nd|second|zweite[rsn]?)' then 2
    when concat(message.subject, ' ', message.next_action) ~* '(3rd|third|dritte[rsn]?)' then 3
    when concat(message.subject, ' ', message.next_action) ~* '(4th|fourth|vierte[rsn]?)' then 4
    else null
  end,
  message.subject,
  message.received_at,
  message.next_action_at,
  'gmail_backfill',
  jsonb_build_object(
    'classification', message.classification,
    'confidence', message.classification_confidence,
    'requiresReview', message.requires_review
  )
from public.application_messages message
where message.classification <> 'other'
on conflict (application_message_id) where application_message_id is not null do nothing;

insert into public.application_process_steps (
  application_id,
  application_event_id,
  kind,
  title,
  occurred_at,
  source,
  notes,
  metadata
)
select
  event.application_id,
  event.id,
  case
    when event.to_status = 'applied' then 'applied'
    when event.to_status = 'interview' then 'interview'
    when event.to_status = 'task' then 'task'
    when event.to_status = 'offer' then 'offer'
    when event.to_status = 'rejected' then 'rejection'
    else 'status_change'
  end,
  concat(coalesce(event.from_status, '未设置'), ' → ', event.to_status),
  event.created_at,
  event.source,
  event.note,
  event.metadata
from public.application_events event
where event.application_message_id is null
on conflict (application_event_id) where application_event_id is not null do nothing;
