-- Batimento do worker: permite mostrar no dashboard se a automação está de pé.
alter table settings add column if not exists worker_last_tick_at timestamptz;

-- A mesma pessoa em várias campanhas é consultada o tempo todo (aviso de
-- duplicidade); e o feed de atividade filtra por lead.
create index if not exists campaign_leads_lead_idx on campaign_leads (lead_id);
create index if not exists automation_logs_lead_idx on automation_logs (lead_id, created_at desc);
