# LinkedIn Prospect

Motor interno de prospecção no LinkedIn. Uso pessoal, uma conta, sem billing,
sem multi-tenant, sem CRM.

```
SEARCH → LEAD → QUALIFY → CONNECT → WAIT → MESSAGE → FOLLOW-UP → REPLY → STOP
```

A arquitetura, o modelo de dados e a máquina de estados estão em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · PostgreSQL (Supabase) ·
Playwright · OpenAI · worker Node com cron simples. Sem Redis, sem filas
externas, sem Docker.

## Como rodar

```bash
cp .env.example .env      # ajuste DATABASE_URL, APP_SECRET e ADMIN_PASSWORD
npm install
npm run db:migrate
npm run db:seed           # opcional: campanha e perfil de exemplo
npm run dev               # UI em http://localhost:3000
npm run worker            # em outro terminal: executa a automação
```

Entre em `/login` com a senha de `ADMIN_PASSWORD`.

### Sessão do LinkedIn

```bash
npm run linkedin:login
```

Abre o Chromium com perfil persistente, você faz login **manualmente** (o
sistema nunca guarda usuário e senha) e a sessão fica salva em
`CHROME_PROFILE_DIR` para o worker reutilizar.

## Segurança da operação

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `DRY_RUN` | `true` | Navega, gera mensagens, encontra os botões, mas **não clica no envio final**. |
| `LINKEDIN_ADAPTER` | `mock` | `mock` roda tudo sem abrir browser. `real` usa Playwright. |
| `AI_MODE` | `auto` | Usa OpenAI quando há chave; sem chave, gera mensagens por template. |
| `ENABLE_*` | `true` | Liga/desliga cada etapa (discovery, connections, messages, followups, reply check). |

Além disso: limites diários por campanha, limite de ações por hora, intervalo
aleatório entre ações e o botão **Parar tudo** na barra lateral.

## Comandos

```bash
npm run dev            # UI
npm run worker         # loop de automação
npm run worker:once    # um ciclo só (bom para depurar)
npm run linkedin:login # sessão persistente do LinkedIn
npm run db:migrate     # migrations
npm run check          # lint + typecheck + testes
```
