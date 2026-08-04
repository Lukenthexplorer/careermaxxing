# Insper News Monitor

Monitor automático de notícias e eventos do Insper: coleta, filtra por relevância com Claude e manda um digest por email — sem precisar rodar nada manualmente.

## Como funciona

```
GitHub Actions (cron)
  → scraper.js       coleta notícias + eventos futuros do site do Insper
  → dedupe.js         descarta URLs já vistas e títulos quase-duplicados
  → feedback.js        lê feedback de "não relevante" (GitHub Issues) de execuções anteriores
  → classifier.js      Claude avalia relevância de cada item (score, motivo, tema)
  → emailer.js          manda o digest por email (Resend) se houver algo com score >= MIN_SCORE
```

- **Fonte dos dados:** a API de busca interna do Insper (`/bin/search/proxy`), acessada via Puppeteer para passar pela proteção anti-bot da Akamai (um `fetch`/`curl` simples é bloqueado; um navegador real não).
- **Persistência:** `data/seen.json` guarda URLs e títulos já processados (retenção de 30 dias) para não repetir notícia. O workflow comita esse cache de volta no repo a cada execução.
- **Agendamento:** GitHub Actions roda nos dias **5, 10, 15, 20, 25 e 30** de cada mês, às 08h (Brasília). Não depende do computador estar ligado.
- **Sem ruído:** só envia email se houver pelo menos um item relevante (configurável, ver abaixo).

## Estrutura

```
index.js              pipeline principal (orquestra tudo)
src/scraper.js         coleta via Puppeteer + API de busca do Insper
src/classifier.js      classificação de relevância via Claude API
src/dedupe.js           dedupe por similaridade de título
src/feedback.js         loop de feedback via GitHub Issues
src/emailer.js          montagem e envio do email (Resend)
data/seen.json          cache de itens já vistos (persistido entre execuções)
data/digest-*.json      histórico dos digests gerados
logs/monitor.log        log de cada execução
.github/workflows/digest.yml   cron do GitHub Actions
```

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha as chaves
node index.js
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | chave da API da Anthropic, usada pra classificar as notícias |
| `RESEND_API_KEY` | não* | chave do [Resend](https://resend.com), usada pra enviar o email |
| `DIGEST_EMAIL_TO` | não* | email de destino do digest |
| `DIGEST_EMAIL_FROM` | não | remetente (default: `onboarding@resend.dev`, domínio de teste do Resend) |
| `GITHUB_REPO` | não | slug `owner/repo` usado pra montar os links de feedback e ler as issues (default: `Lukenthexplorer/careermaxxing`) |
| `MIN_SCORE` | não | score mínimo (0-100) pra um item entrar no digest (default: `60`) |
| `SEND_EMPTY_DIGEST` | não | `true` pra mandar email mesmo quando não há nada relevante (default: `false`, não manda) |

\* sem essas duas, o pipeline roda normalmente mas não envia email — só salva o digest em `data/`.

No GitHub Actions, essas variáveis vêm de **Settings → Secrets and variables → Actions**: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `DIGEST_EMAIL_TO` e `DIGEST_EMAIL_FROM` como *secrets*; `MIN_SCORE` e `SEND_EMPTY_DIGEST` (opcionais) como *variables*. `GITHUB_REPO` e o token de leitura de issues são preenchidos automaticamente pelo próprio workflow.

## Feedback ("não relevante")

Cada item no email tem um link **"Não relevante →"** que abre uma issue pré-preenchida no repositório (label `feedback`). Na próxima execução, o pipeline lê as últimas issues com essa label e passa os títulos rejeitados pro Claude como contexto, calibrando futuras classificações.

## Limitações conhecidas

- **Domínio de email não verificado:** sem verificar um domínio próprio no Resend, só é possível enviar para o email usado no cadastro da conta Resend — não dá pra mandar direto pro email do Insper.
- **Dependente da estrutura do site do Insper:** se a Akamai reforçar a detecção de bot ou a API de busca mudar de formato, o scraper para de funcionar (você recebe um email de alerta automático se o pipeline falhar).
- **Sem fonte de "oportunidades"/vagas:** a página de carreiras do Insper não tem uma API de listagem; o classificador foca em atividades *dentro* do Insper (ligas, workshops, hackathons, palestras) em vez de vagas externas.

## Testar manualmente

```bash
gh workflow run digest.yml --repo Lukenthexplorer/careermaxxing
gh run watch --repo Lukenthexplorer/careermaxxing
```
