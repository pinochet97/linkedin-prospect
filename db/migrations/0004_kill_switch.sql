-- Marca as campanhas que foram pausadas pelo botão "Parar tudo", para que
-- "Retomar automações" devolva exatamente elas ao ar — sem religar campanhas
-- que o usuário tinha pausado à mão.
alter table campaigns add column if not exists paused_by_kill_switch boolean not null default false;
