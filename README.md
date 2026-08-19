# InterEng API

API do sistema de competições do InterEng. O serviço NestJS é a fonte de verdade da PWA `pwa-torneios` e persiste competições, edições, modalidades, equipes, atletas, torneios, partidas, classificações, ranking, staff e auditoria.

## Stack

- **NestJS 11 + TypeScript**;
- **Prisma 5 + PostgreSQL 16**;
- **Redis 7** para cache e streams de revisão;
- **Server-Sent Events (SSE)** para invalidação em tempo real;
- **S3/MinIO** para logotipos de equipes;
- **JWT Bearer + refresh cookie HttpOnly** para sessão;
- **Pino** para logs estruturados.

## Executar na stack integrada

O fluxo recomendado usa o `docker-compose.yml` do repositório irmão `frontend`:

```text
intereng/
├── frontend/
└── backend/
```

No PowerShell:

```powershell
Set-Location ..\frontend
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
curl.exe http://api.localhost/api/v1/health
```

O serviço `api` executa `npm run prisma:migrate` antes de `npm run start:prod`. PostgreSQL, Redis, MinIO, API, PWA e Traefik sobem juntos.

Para popular um ambiente local vazio:

```powershell
docker compose run --rm -e NODE_ENV=development -e SEED_DEMO_DATA=true api npm run prisma:seed
```

O seed é idempotente, exige confirmação explícita e recusa execução em produção. Não o use para restaurar ou sobrescrever dados reais.

## Credenciais da demonstração

| Papel | E-mail | Senha | Escopo |
| --- | --- | --- | --- |
| Super administrador | `super@intereng.com` | `super2026` | global |
| Admin da edição | `ana@ufpe.br` | `intereng2026` | InterEng 2026 |
| Gestor de modalidade | `bruno@ufpe.br` | `futsal2026` | Futsal |

As senhas podem ser substituídas por `SEED_SUPER_ADMIN_PASSWORD`, `SEED_EDITION_ADMIN_PASSWORD` e `SEED_DISCIPLINE_MANAGER_PASSWORD`. Convites novos usam `STAFF_INVITE_PASSWORD`; essa variável é obrigatória em produção.

## Desenvolvimento isolado

Requisitos: Node.js 22+, PostgreSQL, Redis e um endpoint S3 compatível.

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate
$env:SEED_DEMO_DATA='true'
npm run prisma:seed
npm run start:dev
```

O `.env.example` aponta PostgreSQL, Redis e MinIO para `localhost`. Ao usar o Compose, os containers recebem os hosts internos automaticamente.

O Redis do Compose exige senha (`REDIS_PASSWORD`), e a `REDIS_URL` do `.env.example` já a inclui. Se você aponta para um Redis próprio sem autenticação, remova o trecho `:senha@` da URL. As portas do PostgreSQL e do Redis são publicadas apenas em `127.0.0.1`: continuam acessíveis da sua máquina, mas não pela rede.

## Variáveis de ambiente

Obrigatórias para uma implantação real:

- `DATABASE_URL` e `REDIS_URL`;
- `JWT_SECRET` e `JWT_REFRESH_SECRET`;
- `STAFF_INVITE_PASSWORD`;
- `PII_PEPPER` e `PII_ENCRYPTION_KEY` próprios;
- credenciais `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` quando o storage exigir autenticação.

Configuração operacional:

- `PORT`, `CORS_ORIGINS`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`;
- `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`;
- `S3_ENDPOINT`, `S3_PRESIGN_ENDPOINT`, `S3_REGION`, `S3_BUCKET`;
- `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL`, `S3_PRESIGN_TTL_SECONDS`, `S3_MAX_LOGO_BYTES`;
- `REDIS_STREAM_TTL` e `LOG_LEVEL`.

Use segredos fortes, TLS e `COOKIE_SECURE=true` em produção. `S3_PRESIGN_ENDPOINT` deve ser acessível pelo navegador; `S3_ENDPOINT` deve ser acessível pela API.

## Migrações

As migrations ficam em `migrations/` e são aplicadas em ordem:

1. `20260816140000_baseline`;
2. `20260816160000_integration_contract`;
3. `20260816220000_phase_client_id`;
4. `20260816230000_phase5_action_consistency`;
5. `20260817120000_operator_device_lock`.

Banco vazio:

```powershell
npm run prisma:migrate
```

Se um banco legado foi criado com `prisma db push`, faça backup, confirme que a estrutura da baseline já existe e marque **somente** a baseline antes do deploy:

```powershell
npx prisma migrate resolve --applied 20260816140000_baseline --schema schema.prisma
npm run prisma:migrate
```

Não execute `migrate resolve` em banco vazio e não use `prisma db push` como substituto de migrations em ambientes compartilhados.

## Contrato HTTP

Toda resposta JSON usa `{ "data": T, "meta"?: object }`. Erros usam `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId"?: string } }`.

Rotas principais:

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | autenticar e criar refresh HttpOnly |
| `POST` | `/api/v1/auth/refresh` | rotacionar refresh e renovar a sessão |
| `POST` | `/api/v1/auth/logout` | revogar a sessão |
| `GET` | `/api/v1/auth/me` | devolver identidade, papel e escopo |
| `GET` | `/api/v1/editions/:id/snapshot` | snapshot privado com `meta.revision` |
| `GET` | `/api/v1/editions/:id/public-snapshot` | snapshot público redigido e cacheável |
| `POST` | `/api/v1/editions/:id/actions` | executar uma das 32 ações transacionais |
| `GET` | `/api/v1/editions/:id/stream` | SSE `{ editionId, revision }` |
| `GET` | `/api/v1/editions/:id/live` | partidas ao vivo da edição, público e cacheado |
| `GET` | `/api/v1/editions/:id/schedule?date=` | agenda do dia, público e cacheado |
| `GET` | `/api/v1/tournaments/:id/bracket` | chaveamento da categoria, público e cacheado |
| `POST` | `/api/v1/teams/:id/logo-upload-url` | assinar POST WebP direto para S3/MinIO |

A trilha de auditoria não tem rota própria: ela viaja dentro do snapshot privado, em `audit`, já filtrada pelo escopo de quem pediu. É de lá que a tela de atividade do app lê.

`active` pode substituir o ID de edição em todas as rotas de edição acima. Toda mutação exige `Idempotency-Key`; autorização, validação esportiva, escrita, recálculo, auditoria, revisão e recibo pertencem à mesma transação.

O upload aceita apenas WebP no escopo da equipe, usa checksum SHA-256 e limite exato na policy, valida metadados e magic bytes antes de associar o `fileKey` e remove objetos inválidos.

Snapshots públicos não expõem staff, auditoria, documentos de atleta, sessão ou preferências do aparelho. O SSE transporta apenas a revisão; o cliente busca novamente o snapshot autorizado.

## Concorrência e tempo real

- ações da edição usam transação serializável e lock consultivo;
- eventos de partida têm sequência monotônica e operador controlado pelo servidor;
- a revisão aumenta uma única vez por mutação confirmada;
- publicações Redis ocorrem somente após o commit;
- o stream suporta baseline, replay por `Last-Event-ID`, heartbeat, TTL e trim;
- o alias `active` acompanha trocas de edição sem prender o cliente à edição anterior;
- o proxy deve desabilitar buffering de SSE; em produção, prefira HTTP/2.

## Qualidade e validação

```powershell
npx prisma validate --schema schema.prisma
npm run build
npm run lint
```

Os testes de integração existentes precisam de PostgreSQL e Redis. **A aplicação não lê `.env`** — esse arquivo serve só ao Compose —, então `DATABASE_URL` e `REDIS_URL` precisam estar exportadas no ambiente do shell antes de rodar a suíte. Sem elas o código cai nos padrões (`postgres:postgres@localhost:5432` e `redis://localhost:6379` sem senha), que não correspondem ao Redis do Compose depois que ele passou a exigir autenticação.

Aponte sempre para um banco descartável; nunca rode suites com cleanup contra um banco que contenha dados que devam ser preservados. A suíte roda com `maxWorkers: 1` porque as specs de integração compartilham um único banco e limpam tabelas — em paralelo elas se atropelam e falham com violação de chave estrangeira.

Checklist manual mínimo:

1. Login, refresh, logout e escopo dos três papéis.
2. Snapshot privado e público com revisão e ETag.
3. Mutação idempotente, retry e concorrência da mesma chave.
4. Operação de partidas para modalidade com relógio, sem relógio e resultado declarativo.
5. Progressão de grupos, mata-mata, byes, terceiro lugar e correção de resultado.
6. Ranking, retificação auditada e autorização de staff.
7. Upload válido, recusa de tamanho/checksum/formato e URL pública final.
8. SSE, replay, heartbeat, troca de edição ativa e recuperação após falha transitória.
