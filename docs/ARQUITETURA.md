# Arquitetura

Sistema interno de prospecção no LinkedIn. Uma pessoa, uma conta, um motor:

```
SEARCH → LEAD → QUALIFY → CONNECT → WAIT → MESSAGE → FOLLOW-UP → REPLY → STOP
```

## Visão geral

```
┌──────────────────────────────────────────────┐
│ Next.js (App Router) — UI + Server Actions   │  lê e escreve o banco.
│ /login /dashboard /campaigns /leads          │  NUNCA executa automação.
│ /inbox /activity /settings                   │
└──────────────────┬───────────────────────────┘
                   │ SQL (pg)
┌──────────────────▼───────────────────────────┐
│ PostgreSQL (Supabase)                        │  única fonte de verdade.
└──────────────────▲───────────────────────────┘
                   │ claim (FOR UPDATE SKIP LOCKED)
┌──────────────────┴───────────────────────────┐
│ Worker (npm run worker) — processo separado  │
│  discovery → qualify → connect →             │
│  check connections → messages → followups →  │
│  check replies                               │
└───────┬────────────────────────┬─────────────┘
        │ LinkedInAdapter         │ camada de IA
┌───────▼─────────┐      ┌────────▼──────────┐
│ Real (Playwright)│      │ OpenAI ou mock    │
│ Mock (memória)   │      │ qualify + mensagens│
└───────┬─────────┘      └───────────────────┘
        │ Chromium com perfil persistente
    LinkedIn
```

Duas regras que sustentam o resto:

1. **A UI não executa automação.** Ela só muda linhas no banco (`status`,
   `next_action_at`). Quem abre browser é o worker. Dá para reiniciar
   qualquer um dos dois a qualquer momento sem perder estado.
2. **Nenhum estado vive só na memória.** Toda ação vira timestamp no banco
   antes de qualquer coisa depender dela.

## Modelo de dados

| Tabela | Papel |
| --- | --- |
| `settings` | Linha única: perfil de comunicação + kill switch global. |
| `campaigns` | Busca, ICP, limites diários, status. |
| `campaign_steps` | A sequência (4 passos configuráveis). |
| `leads` | A **pessoa**. `linkedin_url` normalizada é UNIQUE global. |
| `campaign_leads` | A **inscrição** da pessoa numa campanha: todo o estado da sequência. |
| `lead_messages` | Mensagens geradas/enviadas + respostas recebidas. |
| `automation_logs` | Tudo que a automação fez, com metadata e screenshot em falhas. |

Não existe tabela `users`: a autenticação é uma conta admin única com a senha
no `.env` e um cookie assinado. Também não existe tabela de contadores
diários — os limites são calculados a partir de `automation_logs`, com índice
em `(action, status, created_at)`.

Separar `leads` de `campaign_leads` resolve duas exigências de uma vez:
nunca duplicar uma pessoa, e conseguir **mostrar** quando alguém já foi
abordado em outra campanha (`findDuplicateEnrollments`).

## Máquina de estados

O coração é `lib/engine/state-machine.ts`, uma função **pura**:

```ts
project({ facts, sequence, qualificationThreshold, now }) → {
  status, nextAction, nextActionAt, reason
}
```

O `status` é uma **projeção** dos fatos persistidos (timestamps, score,
flags) — nunca uma variável mutada por conta própria. Grava-se o fato,
o status é recalculado. Isso elimina estado inconsistente depois de um
restart ou de uma falha no meio de uma ação.

Precedência das regras (a ordem importa e é coberta por testes):

```
resposta > sequência interrompida > erro/retries > qualificação >
convite > aceite > primeira mensagem > follow-up 1 > follow-up 2
```

```
discovered ──qualify──▶ rejected (score < threshold)  ─▶ FIM
     │
     ▼ ready_for_connection
send_connection_request ─▶ connection_requested ──check (6/6h)──▶ connected
     │                              │                                │
     │ (já era conexão)             └── 30 dias sem aceite ─▶ completed
     └──────────────────────────────────────▶ ready_for_first_message
                                                 ▼ send_first_message
                                       waiting_followup_1 ─▶ send_followup_1
                                                 ▼
                                       waiting_followup_2 ─▶ send_followup_2 ─▶ completed

qualquer estado + replied_at  ─▶ replied → NO_ACTION (terminal)
qualquer estado + 3 falhas    ─▶ error   → NO_ACTION (revisão manual)
```

Pausa de campanha, kill switch, feature flags e limites diários **não**
entram na projeção: são portões de execução (`worker/limits.ts`,
`lib/engine/rate-limit.ts`), não estado do lead.

## Fluxo completo de um lead

1. `processDiscovery` abre a URL de busca (ou monta uma a partir do texto) e
   extrai nome, URL, headline, empresa e localização.
2. `upsertLeadAndEnroll` normaliza a URL; se a pessoa já existe, reaproveita.
   Cria a inscrição → `discovered`, `next_action = qualify`.
3. `qualify`: regra barata primeiro (palavras claramente incompatíveis
   rejeitam sem gastar token) → OpenAI com saída estruturada
   `{ qualified, score, reason, segment }`. Abaixo do threshold → `rejected`.
4. `send_connection_request`: gera a nota (IA + perfil de comunicação, com
   limite de caracteres), o adapter confere o estado real no LinkedIn, envia,
   persiste `linkedin_connection_requested_at`.
5. `check_connection`: polling a cada 6h. Aceito → `linkedin_connected_at`,
   agenda a mensagem para `connected_at + delay`. Sem aceite em 30 dias →
   `completed`.
6. `send_first_message`: guard exige `first_message_sent_at IS NULL`.
7. Antes de **cada** follow-up roda `checkReplies`. Resposta → `replied_at`,
   `reply_text`, `sequence_stopped`, e o lead aparece no `/inbox`.
8. Sem resposta → follow-up 1, follow-up 2, `completed`.

## Idempotência

Três camadas, nessa ordem:

1. **Banco**: `leads.linkedin_url` UNIQUE, `campaign_leads (campaign_id, lead_id)`
   UNIQUE, índice único parcial em `lead_messages (campaign_lead_id, kind)`.
2. **Guards** (`lib/engine/guards.ts`): consultam os timestamps antes de agir.
3. **Adapter**: confere o estado real no LinkedIn (já é conexão? convite
   pendente?) antes do clique final.

## Pontos frágeis

| Risco | Mitigação |
| --- | --- |
| Seletores do LinkedIn mudam | `selectors.ts` centralizado, `getByRole`/aria-label antes de CSS; falha → screenshot + HTML + `retry_count`, nunca clique adivinhado |
| Sessão expira / checkpoint | detecção da tela de login → `SessionExpiredError` pausa a automação e loga; `npm run linkedin:login` renova |
| Convite/mensagem duplicados | banco + guards + verificação no LinkedIn |
| "Aceitou?" não é evento | polling com intervalo configurável e prazo de validade |
| Falso negativo em resposta | compara o timestamp da última mensagem recebida com o do último envio; na dúvida, não manda follow-up |
| Bloqueio do LinkedIn | limites configuráveis + intervalo aleatório entre ações + kill switch |
| Crash no meio da ação | o fato só é gravado após confirmação; locks expiram; retomada idempotente |
| Custo de token | pré-filtro por regra; mensagens geradas uma vez e reaproveitadas |
| Ação real indesejada | `DRY_RUN=true` por padrão, bloqueando o clique final dentro do adapter |
| "Parar tudo" religando campanhas erradas | o kill switch marca quem ele pausou (`paused_by_kill_switch`); retomar devolve exatamente essas ao ar |
| Worker caído sem ninguém notar | batimento gravado a cada ciclo em `settings.worker_last_tick_at`, exibido no dashboard |

## Observabilidade

- **Feed de atividade** (`/activity`): toda ação vira uma linha em
  `automation_logs`, com filtros por campanha, ação, status e lead.
  Verificações de aceite sem novidade não são registradas de propósito — só
  mudanças de estado — para o feed continuar legível.
- **Falhas**: gravam `retry_count`, `last_error`, um trecho do HTML e o
  caminho do screenshot (`.data/screenshots`). Depois de 3 falhas o lead vai
  para `error` e espera revisão manual (`Reprocessar` na tela do lead).
- **Batimento do worker**: cada ciclo grava `settings.worker_last_tick_at`. O
  dashboard mostra "worker ativo" ou "worker parado", o que distingue
  "nada aconteceu porque está tudo em dia" de "nada aconteceu porque o
  processo caiu".
- **Limites**: o dashboard e a tela da campanha mostram o uso do dia no
  formato `17 / 20`.

## O que este sistema deliberadamente não tem

Billing, Stripe, times, workspaces, permissões, sequências de e-mail,
enriquecimento externo, telefone, WhatsApp, integração com Sales Navigator,
analytics avançado, scoring sofisticado, webhooks, Redis, microserviços,
Docker, Kubernetes, agentes autônomos e CRM. Menos funcionalidades, mais
confiabilidade.
