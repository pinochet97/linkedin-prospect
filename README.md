# LinkedIn Prospect

Motor interno de prospecção no LinkedIn. Uso pessoal, uma conta, sem billing,
sem multi-tenant, sem CRM.

```
SEARCH → LEAD → QUALIFY → CONNECT → WAIT → MESSAGE → FOLLOW-UP → REPLY → STOP
```

A arquitetura, o modelo de dados, a máquina de estados e os pontos frágeis
estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · PostgreSQL (Supabase) ·
Playwright · OpenAI · worker Node com loop simples. Sem Redis, sem fila
externa, sem Docker.

## Como rodar

```bash
cp .env.example .env      # ajuste DATABASE_URL, APP_SECRET e ADMIN_PASSWORD
npm install
npx playwright install chromium
npm run db:migrate
npm run db:seed           # opcional: campanha e perfil de exemplo
npm run dev               # UI em http://localhost:3000
npm run worker            # em outro terminal: executa a automação
```

Entre em `/login` com a senha de `ADMIN_PASSWORD`.

### Ver o sistema funcionando sem tocar no LinkedIn

```bash
npm run demo
```

Cria uma campanha de demonstração e roda o motor inteiro contra o LinkedIn
simulado — descoberta, qualificação, convite, aceite, mensagem, follow-up e
resposta. Nenhum acesso ao LinkedIn real.

### Sessão do LinkedIn

```bash
npm run linkedin:login
```

Abre o Chromium com perfil persistente, você faz login **manualmente** (o
sistema nunca guarda usuário e senha) e a sessão fica salva em
`CHROME_PROFILE_DIR` para o worker reutilizar. Quando a sessão expira, o
worker pausa a automação sozinho e registra o motivo — é só rodar este
comando de novo e despausar.

## Ligando a automação com segurança

Três chaves, nesta ordem. Cada passo só depois de conferir o anterior:

| Passo | `.env` | O que acontece |
| --- | --- | --- |
| 1. Simulação | `LINKEDIN_ADAPTER=mock` | Nenhum browser abre. Serve para validar campanha, ICP, sequência e limites. |
| 2. Ensaio real | `LINKEDIN_ADAPTER=real`, `DRY_RUN=true`, `HEADLESS=false` | O browser abre e você **assiste**: perfil, modal de convite, nota escrita, composer preenchido. O clique final não acontece. |
| 3. Produção | `LINKEDIN_ADAPTER=real`, `DRY_RUN=false` | Ações reais, dentro dos limites configurados. |

> **DRY_RUN avança o estado do lead de propósito** — só assim dá para ver a
> sequência inteira (convite → aceite → mensagem → follow-up) sem esperar
> dias. Os registros ficam marcados como `dry run` na UI e nos logs. Depois do
> ensaio, use uma campanha nova para a rodada real; a mesma pessoa pode ser
> inscrita de novo e o sistema avisa que ela já apareceu em outra campanha.

Outras chaves de segurança:

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `AI_MODE` | `auto` | Usa OpenAI quando há chave; sem chave, gera mensagens por template. |
| `ENABLE_DISCOVERY` … `ENABLE_REPLY_CHECK` | `true` | Liga/desliga cada etapa para testar parte por parte. |
| `ACTIONS_PER_HOUR` | `20` | Ritmo global. |
| `MIN/MAX_ACTION_DELAY_MS` | `4000` / `12000` | Intervalo aleatório entre ações. |
| `CONNECTION_CHECK_INTERVAL_HOURS` | `6` | De quanto em quanto tempo conferir o aceite. |
| `CONNECTION_EXPIRE_DAYS` | `30` | Quando desistir de um convite não aceito. |

Limites diários de convites e mensagens são por campanha (na tela da
campanha), e o botão **Parar tudo** na barra lateral pausa todas as campanhas
sem apagar nada.

## Telas

| Tela | O que mostra |
| --- | --- |
| `/dashboard` | Números gerais, ações de hoje, uso dos limites, atividade recente e se o worker está de pé. |
| `/campaigns` | Criar, iniciar, pausar e arquivar campanhas. |
| `/campaigns/[id]` | Status, ICP, sequência, performance, leads e atividade da campanha. |
| `/leads` e `/leads/[id]` | Base de leads, linha do tempo, mensagens geradas/enviadas e logs. Avisa quando a pessoa está em mais de uma campanha. |
| `/inbox` | Quem respondeu (a sequência já parou) e classificação: interessado, não interessado, reunião marcada, depois, ignorar. |
| `/activity` | Feed de tudo que a automação fez, com filtros. |
| `/settings` | Perfil de comunicação usado pela IA e estado do ambiente. |

## Comandos

```bash
npm run dev            # UI
npm run worker         # loop de automação
npm run worker:once    # um ciclo só (bom para depurar)
npm run demo           # roda o motor inteiro contra o LinkedIn simulado
npm run linkedin:login # sessão persistente do LinkedIn
npm run db:migrate     # migrations
npm run check          # lint + typecheck + testes
```

## Testes

`npm run check` roda lint, typecheck e a suíte. Os testes cobrem o que não
depende do LinkedIn:

- máquina de estados, próxima ação e timing da sequência;
- resposta interrompendo a sequência (inclusive com follow-up agendado);
- idempotência (nunca dois convites, nunca duas mensagens do mesmo tipo);
- deduplicação de perfis e normalização de URL;
- limites diários e ritmo horário;
- parsers de busca, de perfil e de detecção de resposta;
- helpers de seleção rodando em Chromium real contra HTML de exemplo;
- um teste ponta a ponta que roda o worker de verdade contra o LinkedIn
  simulado, da descoberta ao follow-up 2.

Os testes que precisam de Postgres ou de Chromium se ignoram sozinhos quando
o recurso não está disponível.
