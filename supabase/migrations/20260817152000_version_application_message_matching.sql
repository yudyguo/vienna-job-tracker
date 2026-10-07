alter table public.application_messages
  add column if not exists matcher_version text not null default 'legacy';

comment on column public.application_messages.matcher_version is
  'Version of the deterministic job/application matching rules used for this message.';
