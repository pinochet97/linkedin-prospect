-- Quando conferimos as respostas deste lead pela última vez. Usado para
-- espaçar a varredura da caixa de entrada sem depender de estado em memória.
alter table campaign_leads add column if not exists last_reply_check_at timestamptz;

create index if not exists campaign_leads_reply_check_idx
  on campaign_leads (last_reply_check_at)
  where replied_at is null and first_message_sent_at is not null;
