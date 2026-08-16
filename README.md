# Sistema de Gestão de Competições Esportivas Multi-Evento

Este é o repositório da API do sistema de competições dos Jogos Universitários. O projeto é construído em **NestJS**, utilizando **Prisma (PostgreSQL)** como ORM, **Redis** para caching/streams, e **Server-Sent Events (SSE)** para transmissão de eventos em tempo real.

---

## Contrato de integração com a PWA

A API será a fonte de verdade da PWA `pwa-torneios`, sem alteração das páginas existentes. O contrato congelado é o `FrontendState` e a união `Action` do frontend. Toda resposta JSON usa `{ "data": T, "meta"?: object }`; todo erro usa `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId"?: string } }`.

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | autenticar, criar refresh HttpOnly e devolver `{ token, expiresAt, user }` |
| `POST` | `/api/v1/auth/refresh` | rotacionar refresh e devolver nova sessão |
| `POST` | `/api/v1/auth/logout` | revogar refresh e limpar cookie |
| `GET` | `/api/v1/auth/me` | usuário, papel e escopo vigentes |
| `GET` | `/api/v1/editions/:id/snapshot` | snapshot privado compatível com `FrontendState` e `meta.revision` |
| `GET` | `/api/v1/editions/:id/public-snapshot` | snapshot público redigido |
| `POST` | `/api/v1/editions/:id/actions` | executar uma das 32 ações de modo idempotente e transacional |
| `GET` | `/api/v1/editions/:id/stream` | SSE com invalidação `{ editionId, revision }` |
| `GET` | `/api/v1/editions/:id/live` | partidas ao vivo públicas |
| `GET` | `/api/v1/tournaments/:id/bracket` | chaveamento público |
| `GET` | `/api/v1/audit-logs` | auditoria global paginada |
| `GET` | `/api/v1/editions/:id/audit-logs` | auditoria da edição paginada |
| `POST` | `/api/v1/teams/:id/logo-upload-url` | assinar upload WebP no S3/MinIO e devolver `fileKey` imutável |

As ações aceitas são:

| Domínio | Tipos aceitos |
| --- | --- |
| Partida | `match/schedule`, `match/update`, `match/start`, `match/updateClock`, `match/registerEvent`, `match/claimOperator`, `match/releaseOperator`, `match/undoEvent`, `match/finish`, `match/correctResult` |
| Categoria | `category/create`, `category/update`, `category/generateMatches` |
| Modalidade | `discipline/update` |
| Equipe | `team/create`, `team/update` |
| Atleta | `athlete/create`, `athlete/update` |
| Ranking | `ranking/addMetric`, `ranking/updateMetric`, `ranking/removeMetric`, `ranking/addAwards`, `ranking/revokeAward`, `ranking/close`, `ranking/reopen` |
| Competição | `competition/create`, `competition/rename`, `competition/activate` |
| Edição | `edition/create`, `edition/update`, `edition/activate` |
| Staff | `staff/upsert` |

Invariantes da integração:

- `active` pode substituir `:id` e resolve a edição ativa de forma determinística;
- IDs de criação enviados pelo cliente são validados e preservados;
- `Idempotency-Key` é obrigatório em mutações e uma repetição devolve o mesmo recibo;
- autorização, regra esportiva, escrita, auditoria, revisão e recibo pertencem à mesma transação;
- a resposta da ação só sai após classificação e chaveamento estarem consistentes;
- snapshots públicos nunca incluem staff, auditoria, documento de atleta ou preferências do dispositivo;
- SSE apenas invalida a revisão; o cliente recarrega o snapshot autorizado;
- logotipos persistem como `fileKey`; URLs assinadas nunca são armazenadas.

### Baseline antes da integração

Em 2026-08-16, 14 das 18 suítes do backend passaram sem infraestrutura. As quatro suítes de integração restantes exigem PostgreSQL e Redis locais e serão a primeira validação do ambiente integrado na fase 1. Nenhuma falha de regra ou compilação foi identificada nesse baseline.

## 1. Visão Geral para Desenvolvedores

Este projeto é desenvolvido seguindo o princípio **spec-driven** e utiliza agentes autônomos de IA integrados para acelerar a entrega de tarefas. 

*   **Público-Alvo do Backend:** Staff Administradores (autenticados via Bearer JWT com permissões de escopo) e Espectadores Públicos (sem autenticação, com endpoints de alta concorrência).
*   **Convenção de Módulos:** Organização **por domínio** (dentro de `src/`), não por camada técnica. A autorização é escopada por edição ou modalidade, logo a coesão de domínio no mesmo módulo facilita o isolamento de escopo.
*   **Convenção de Nomenclatura:** `*.controller.ts`, `*.service.ts`, `*.module.ts` e DTOs em `dto/*.dto.ts` internos de cada módulo. Os testes unitários/integração (`*.spec.ts`) devem ficar na mesma pasta do arquivo testado.

---

## 2. Diretrizes Arquiteturais Mandatórias (Staff Backend Guidelines)

Para manter a consistência e a performance da plataforma em produção, todos os desenvolvedores (de qualquer nível) devem seguir estas regras:

### 2.1. Concorrência e Transações (Match Events)
*   **Sem Triggers de Banco:** Toda a lógica de negócio de pontuação e incremento de sequência dos eventos (`lastEventSequence`) deve rodar **na aplicação (NestJS)**. Não crie triggers em nível de banco de dados para evitar deadlocks nas transações do ORM.
*   **Lock Pessimista:** Na criação de eventos de partida, é mandatório fazer um `SELECT ... FOR UPDATE` (via Prisma raw queries ou hooks equivalentes de lock) na linha do `Match` antes de computar o próximo incremento de sequência, serializando as requisições concorrentes.

### 2.2. Proteção de Dados (LGPD)
*   **Dados Pessoais de Atletas:** O campo `document` (CPF/RG) do `Athlete` é PII (*Personally Identifiable Information*). 
    *   **Não armazene em texto plano.** Sempre gere e armazene um **Hash Criptográfico unidirecional (SHA-256 + salt/pepper)** para validações de duplicidade no banco (`@@unique`).
    *   Para exibição, trafegue o documento **mascarado** (ex: `***.456.***-**`) nos DTOs padrão. A exibição integral deve ser restrita a administradores reais sob criptografia simétrica (AES-256).

### 2.3. SSE (Server-Sent Events) e Infraestrutura
*   **Uso de HTTP/2:** Devido à limitação de HTTP/1.1 de abrir no máximo 6 conexões persistentes por domínio no navegador, a aplicação de produção **deve rodar sob HTTP/2** para permitir multiplexação de streams.
*   **Configuração de Buffering:** No proxy reverso (Nginx/Traefik), o buffering deve ser desabilitado explicitamente para as rotas `/stream` (`proxy_buffering off;` e header `X-Accel-Buffering: no`), permitindo vazão imediata dos eventos.
*   **Prevenção de Vazamento de Memória:** Ao fechar a conexão SSE (evento `close`), limpe ativamente o `setInterval` do heartbeat e as conexões de escuta/subscrição do Redis.

### 2.4. Cache e Prevenção de Cache Stampede
*   Os endpoints públicos de alta concorrência (`/live`, `/bracket`) utilizam Redis.
*   **Efeito Manada:** Para evitar que o banco sofra picos de carga quando o cache for invalidado em tempo real, utilize a abordagem de **Single Flight** (onde apenas uma requisição faz a query no banco para re-popular o cache, enquanto outras concorrentes aguardam a conclusão) ou **Stale-While-Revalidate**.

### 2.5. Desempate de Classificações (Standings)
*   O recálculo de classificação de fases (`PhaseStanding`) é executado de forma **completa e não-incremental** na finalização de cada partida.
*   A implementação de critérios de tiebreaker dinâmicos (`Phase.config.tiebreakers`) deve seguir o padrão **Comparator Chain** (encadeamento de comparadores puros, avaliando confronto direto (`headToHead`) apenas entre as equipes atualmente empatadas no critério anterior).

---

## 3. Fluxo de Desenvolvimento Automatizado (Ralph Loop & Quality Gate)

Para acelerar o desenvolvimento de forma limpa, utilizamos um pipeline de orquestração local com agentes de IA.

```
                  ┌──────────────────────┐
                  │ ./orchestrate.sh ID  │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Engineer (Local)    │◄──────┐
                  │    ralph-loop.sh     │       │
                  └──────────┬───────────┘       │
                             │ (passa build/test)│
                             ▼                   │ (rejeição +
                  ┌──────────────────────┐       │  RALPH_FEEDBACK)
                  │  Reviewer QA Agent   ├───────┘
                  │  (SOLID/DRY/Docs)    │
                  └──────────┬───────────┘
                             │
                             ▼ (STATUS: APROVADO)
                       [Commit Final]
```

### 3.1. Como rodar uma task do plano:
1. Garanta que você está em uma branch de feature limpa (ex: `git checkout -b ralph/TASK-F02`).
2. Localize a próxima tarefa no checklist de progresso em [`tasks.md`](file:///Users/joaovictor/Documents/Intereng/tasks.md) e o escopo de execução em [`plano-execucao-api-competicoes.md`](file:///Users/joaovictor/Documents/Intereng/plano-execucao-api-competicoes.md).
3. Execute o orquestrador:
   ```bash
   ./orchestrate.sh <TASK_ID> [MAX_CYCLES]
   # Exemplo: ./orchestrate.sh TASK-F02 3
   ```
4. **O que o orquestrador fará:**
   * O **Engineer** implementa a lógica e roda localmente testes/build. Ao passar, faz um commit local.
   * O **Reviewer (Quality Gate)** lê o `git diff` e valida os critérios de qualidade (SOLID, DRY, Docstrings).
   * Se o Reviewer **APROVAR**, o commit é aceito e o ciclo encerra.
   * Se o Reviewer **REJEITAR**, o orquestrador dá um *soft reset* no commit, injeta o feedback na variável `RALPH_FEEDBACK` e aciona o Engineer novamente para correção rápida.

---

## 4. Setup do Ambiente de Desenvolvimento

### Requisitos:
* Node.js v20+
* Docker & Docker Compose (para PostgreSQL e Redis de teste)
* CLI `agy` (ou `gemini` configurada) para automação de IA

### Passos Iniciais:
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicialize o ambiente local com os bancos de dados:
   ```bash
   docker-compose up -d
   ```
3. Configure as variáveis de ambiente no arquivo `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/competitions?schema=public"
   REDIS_URL="redis://localhost:6379"
   ```
4. Aplique as migrações do Prisma:
   ```bash
   npm run prisma:migrate
   ```
5. Para carregar os dados de demonstração somente no ambiente local:
   ```powershell
   $env:SEED_DEMO_DATA='true'
   npm run prisma:seed
   ```
6. Inicie o servidor em modo de desenvolvimento:
   ```bash
   npm run start:dev
   ```

### Banco criado antes das migrations da integração

Instalações locais antigas, criadas com `prisma db push`, possuem as tabelas da baseline, mas não a tabela de histórico do Prisma. Depois de fazer backup, marque somente a baseline como já aplicada e execute a evolução normalmente:

```powershell
npx prisma migrate resolve --applied 20260816140000_baseline --schema schema.prisma
npm run prisma:migrate
```

Não execute `migrate resolve` em banco vazio. Nesse caso, `npm run prisma:migrate` deve aplicar todas as migrations desde a baseline. O seed de demonstração recusa execução em produção e requer `SEED_DEMO_DATA=true` para evitar alterações acidentais.

### Comandos de Teste e Qualidade:
* **Executar Testes:** `npm test`
* **Linter:** `npm run lint`
* **Build de Produção:** `npm run build`
