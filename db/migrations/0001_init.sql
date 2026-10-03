-- ---------------------------------------------------------------------------
-- Schema inicial do sistema de prospecção.
--
-- Modelo central:
--   leads          = a PESSOA (identidade global, linkedin_url UNIQUE)
--   campaign_leads = a INSCRIÇÃO da pessoa numa campanha (todo o estado da
--                    sequência vive aqui)
--
-- Essa separação garante ao mesmo tempo: (a) nunca duplicar uma pessoa e
-- (b) conseguir mostrar quando alguém já foi abordado em outra campanha.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- Perfil de comunicação + kill switch global. Linha única (id = 1).
create table if not exists settings (
  id                smallint primary key default 1,
  my_name           text not null default '',
  my_company        text not null default '',
  my_role           text not null default '',
  what_i_do         text not null default '',
  target_audience   text not null default '',
  tone_of_voice     text not null default '',
  things_to_avoid   text not null default '',
  automation_paused boolean not null default false,
  paused_reason     text,
  updated_at        timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists campaigns (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  search_query              text,
  linkedin_search_url       text,
  icp_description           text not null default '',
  qualification_threshold   int  not null default 60,
  connection_note_max_chars int  not null default 200,
  daily_connection_limit    int  not null default 20,
  daily_message_limit       int  not null default 30,
  discovery_target          int  not null default 50,
  status                    text not null default 'draft'
                              check (status in ('draft', 'active', 'paused', 'archived')),
  discovery_status          text not null default 'pending'
                              check (discovery_status in ('pending', 'running', 'done', 'failed')),
  discovery_last_run_at     timestamptz,
  discovery_error           text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- A sequência da campanha. "Find lead" e "wait until accepted" são implícitos
-- no motor; aqui ficam apenas os passos que o usuário configura.
-- delay_hours = quanto esperar ANTES de executar o passo.
create table if not exists campaign_steps (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  step_order  int  not null,
  step_type   text not null
                check (step_type in ('connection_request', 'first_message', 'followup_1', 'followup_2')),
  delay_hours int  not null default 0 check (delay_hours >= 0),
  enabled     boolean not null default true,
  unique (campaign_id, step_type),
  unique (campaign_id, step_order)
);

create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  linkedin_url        text not null unique,
  linkedin_public_id  text unique,
  full_name           text not null,
  first_name          text,
  headline            text,
  job_title           text,
  company             text,
  location            text,
  profile_summary     text,
  profile_enriched_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists campaign_leads (
  id                               uuid primary key default gen_random_uuid(),
  campaign_id                      uuid not null references campaigns (id) on delete cascade,
  lead_id                          uuid not null references leads (id) on delete cascade,
  status                           text not null default 'discovered' check (status in (
                                     'discovered', 'qualified', 'rejected', 'ready_for_connection',
                                     'connection_requested', 'waiting_connection', 'connected',
                                     'ready_for_first_message', 'first_message_sent',
                                     'waiting_followup_1', 'followup_1_sent',
                                     'waiting_followup_2', 'followup_2_sent',
                                     'replied', 'interested', 'not_interested', 'completed', 'error')),
  connection_status                text not null default 'unknown'
                                     check (connection_status in ('unknown', 'not_connected', 'pending', 'connected')),
  qualification_score              int,
  qualification_reason             text,
  qualification_segment            text,
  linkedin_connection_requested_at timestamptz,
  linkedin_connected_at            timestamptz,
  first_message_sent_at            timestamptz,
  followup_1_sent_at               timestamptz,
  followup_2_sent_at               timestamptz,
  replied_at                       timestamptz,
  reply_text                       text,
  sequence_stopped                 boolean not null default false,
  interest_status                  text check (interest_status in
                                     ('interested', 'not_interested', 'meeting_scheduled', 'later', 'ignore')),
  next_action                      text,
  next_action_at                   timestamptz,
  retry_count                      int not null default 0,
  last_error                       text,
  last_attempt_at                  timestamptz,
  locked_at                        timestamptz,
  locked_by                        text,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

create index if not exists campaign_leads_due_idx
  on campaign_leads (next_action_at)
  where next_action is not null and next_action <> 'none';

create index if not exists campaign_leads_campaign_status_idx on campaign_leads (campaign_id, status);
create index if not exists campaign_leads_replied_idx on campaign_leads (replied_at desc) where replied_at is not null;

create table if not exists lead_messages (
  id               uuid primary key default gen_random_uuid(),
  campaign_lead_id uuid not null references campaign_leads (id) on delete cascade,
  kind             text not null check (kind in
                     ('connection_note', 'first_message', 'followup_1', 'followup_2', 'inbound_reply')),
  body             text not null,
  generated_at     timestamptz,
  sent_at          timestamptz,
  dry_run          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Idempotência no nível do banco: no máximo uma mensagem de saída por tipo.
create unique index if not exists lead_messages_outbound_unique
  on lead_messages (campaign_lead_id, kind)
  where kind <> 'inbound_reply';

create index if not exists lead_messages_lead_idx on lead_messages (campaign_lead_id, created_at desc);

create table if not exists automation_logs (
  id               bigserial primary key,
  campaign_id      uuid references campaigns (id) on delete set null,
  lead_id          uuid references leads (id) on delete set null,
  campaign_lead_id uuid references campaign_leads (id) on delete set null,
  action           text not null,
  status           text not null check (status in ('success', 'failed', 'skipped', 'info')),
  message          text,
  metadata         jsonb not null default '{}'::jsonb,
  screenshot_path  text,
  created_at       timestamptz not null default now()
);

create index if not exists automation_logs_created_idx on automation_logs (created_at desc);
create index if not exists automation_logs_rate_idx on automation_logs (action, status, created_at desc);
create index if not exists automation_logs_campaign_idx on automation_logs (campaign_id, created_at desc);
