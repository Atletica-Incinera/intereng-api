# Plano de Execução — API do Sistema de Gestão de Competições

Baseado em `schema.prisma` e `PRD-api-sistema-competicoes.md`. Este documento não repete "o quê" — trata de "como", "em que ordem" e "como isso se encaixa no ralph loop e no orchestrate.sh".

---

## Seção 1 — Tasks de Fundação

Critério para uma task entrar aqui: se duas tasks de feature forem implementadas em paralelo por agentes diferentes sem essa peça definida antes, elas vão divergir de forma que só aparece na integração (formato de erro diferente, guard reimplementado três vezes, AuditLog preenchido de jeitos diferentes).

### TASK-F01 — Estrutura de módulos e convenções de nomenclatura

**Decisão**: módulos por **domínio**, não por camada, espelhando os agrupamentos do próprio schema (comentários `GLOBAIS` vs `ESCOPADAS POR EDIÇÃO` já indicam os limites certos). Camada por domínio é a escolha certa aqui porque a autorização (F09) é por edição/modalidade — organizar por camada (`controllers/`, `services/`) espalharia a lógica de escopo em vez de encapsulá-la.

```
src/
  auth/                    # TASK-01
  competitions/            # TASK-02 (Competition + CompetitionEdition)
  disciplines/             # TASK-03 (Discipline + EditionDiscipline)
  catalog/                 # TASK-04 (Team + Athlete — nome "catalog" porque
                            #   são as duas entidades globais de cadastro amplo)
  edition-rosters/         # TASK-05
  edition-staff-roles/     # TASK-06
  tournaments/             # TASK-07
  phases/                  # TASK-08 (Phase + Group + GroupEntry — ficam juntos
                            #   porque Group não existe fora de uma Phase)
  tournament-entries/      # TASK-09
  matches/                 # TASK-10
  match-events/            # TASK-11
  realtime/                # TASK-12 (consome eventos de matches/match-events,
                            #   não duplica lógica de domínio)
  standings/                # TASK-13
  audit-logs/               # TASK-14 (leitura; a escrita mora em common/audit)
  public/                   # TASK-15 (agregações somente-leitura, sem entidade própria)
  common/
    filters/                # F02
    interceptors/           # F02, F04
    dto/                    # F03
    events/                 # F06
    audit/                  # F08
    guards/ decorators/      # F09
    redis/                   # F05
    validation/              # F07
  test/
    factories/               # F10
```

**Convenção de arquivos**: `*.controller.ts`, `*.service.ts`, `*.module.ts`, DTOs em `dto/*.dto.ts` dentro de cada módulo (não em `common/dto` — só o que é genérico fica em common). Testes colocados junto do arquivo testado (`*.spec.ts`), não em pasta espelhada — mais fácil pro Ralph loop achar o teste ao corrigir o código do lado.

**Critério de aceite**: `nest new` gerado, módulos vazios (só `*.module.ts` com imports declarados) compilando, `tsconfig` com path alias `@common/*`. Nenhuma lógica ainda — só esqueleto.

---

### TASK-F02 — Envelope de resposta e filtro global de erro

O PRD fixa o contrato (`data`/`meta`, `error.code`/`message`/`details`). O risco de não centralizar: cada controller monta o envelope à mão e a paginação (`meta.page/pageSize/total/totalPages`) diverge sutilmente entre tasks.

**Decisão**: `ResponseInterceptor` global que envolve qualquer retorno de controller em `{ data, meta? }` — controllers retornam o objeto de domínio puro (ou `{ items, meta }` quando paginado) e nunca montam o envelope manualmente. `GlobalExceptionFilter` mapeia exceções para o formato de erro do PRD, com um `Map<ExceptionClass, ErrorCode>` central — inclui tradução de `Prisma.PrismaClientKnownRequestError` código `P2002` (violação de `@@unique`) para `409 CONFLICT`, já que o schema tem várias constraints `@@unique` que a API precisa reportar nesse formato (`EditionRoster`, `TournamentEntry`, `CompetitionEdition`, etc.) sem cada service capturar isso manualmente.

**Critério de aceite**: endpoint de exemplo (`GET /health`) retornando `{ data: { status: "ok" } }`; teste forçando um `NotFoundException` e um `P2002` simulado, verificando `error.code` correto em cada um.

---

### TASK-F03 — Base de DTOs, paginação e mapeamento Prisma → DTO

**Decisão**: `class-validator` + `class-transformer` (já é o padrão Nest, evita dependência nova). Para mapeamento model → DTO de resposta, cada módulo define seu próprio `*.mapper.ts` com uma função pura `toXResponseDto(entity)` — **não** um mapper genérico automático, porque o schema tem casos onde o DTO de resposta é deliberadamente diferente do model (ex: `GET /athletes/:id/history` não retorna `EditionRoster` cru, retorna um shape achatado com `editionName`/`disciplineName`/`teamName` vindos de três relations). Um mapper automático encorajaria vazar campos internos (`passwordHash` em `Staff` é o caso mais crítico a nunca deixar escapar).

`PaginationQueryDto` (`page` default 1, `pageSize` default 20, máximo 100, validado com `@Max(100)`) e um helper `paginate(prisma.model, { page, pageSize, where, orderBy })` que roda `findMany` + `count` em paralelo (`Promise.all`) e devolve `{ items, meta }` no formato do PRD.

**Critério de aceite**: teste do helper `paginate` contra um model simples (`Competition`) confirmando `meta.totalPages` calculado corretamente incluindo o caso `total = 0`.

---

### TASK-F04 — Logging estruturado (Pino) e correlação de request

**Decisão**: Pino via `nestjs-pino`, log de propósito **técnico/operacional** — toda request (método, rota, status, duração), erros não tratados, e um `requestId` (UUID) propagado via `AsyncLocalStorage` para aparecer em todo log da mesma requisição, incluindo dentro do `AuditLog` (F08) como correlação, sem ser a mesma tabela. Pino registra inclusive tentativas de login falhas e requests não-autenticadas — coisas que o `AuditLog` de domínio (F08) nunca deve conter, porque `AuditLog.staffId` é opcional mas a intenção do modelo é "ação de negócio de um staff identificado", não ruído de segurança perimetral.

**Critério de aceite**: request de exemplo gera log JSON com `requestId`, e o mesmo `requestId` aparece propagado se o handler lançar um erro (correlação erro↔request nos logs).

---

### TASK-F05 — Módulo Redis compartilhado

O schema/PRD menciona Redis explicitamente (contexto do prompt) e SSE com replay via stream (TASK-12 menciona "Redis stream/replay a partir da sequência"). Centralizar aqui evita que TASK-12 e uma eventual TASK de cache (TASK-13/15, leitura pesada) criem dois clientes Redis com configuração de reconexão diferente.

**Decisão**: `ioredis` (suporta Streams nativamente, necessário para `XADD`/`XREAD`/`XRANGE` do TASK-12), módulo Nest com `RedisModule.forRootAsync` lendo `REDIS_URL`, exposto como provider injetável. Não decide aqui a estratégia de cache de leitura (isso é ponto de pesquisa marcado na TASK-15-EXEC) — só entrega o cliente pronto.

**Critério de aceite**: `RedisService.ping()` retornando `PONG` em teste de integração contra Redis local (docker-compose de teste).

---

### TASK-F06 — Barramento de eventos de domínio (EventEmitter2)

Ponto de maior risco de conflito entre agentes: `Match.status → FINISHED` e criação de `MatchEvent` disparam **três** consequências independentes — replicar para SSE (TASK-12), recalcular `PhaseStanding` (TASK-13), e potencialmente invalidar cache de leitura (TASK-15). Se TASK-11, TASK-12 e TASK-13 forem implementadas como chamadas diretas encadeadas dentro do `MatchEventsService`/`MatchesService`, dois agentes trabalhando em paralelo nessas tasks vão editar o mesmo método.

**Decisão**: `@nestjs/event-emitter`. `MatchEventsService` (dentro da mesma transação que grava o `MatchEvent` e incrementa `Match.lastEventSequence`/`scoreA`/`scoreB`) emite `match.event.created` **depois** do commit da transação (usar `EventEmitter2` com listener registrado para rodar após a transação — nunca dentro dela, para não acoplar side-effects a rollback de banco). `MatchesService` emite `match.finished` na transição de status. TASK-12 e TASK-13 cada uma registra seu próprio `@OnEvent(...)` listener, sem tocar no código de `matches/` ou `match-events/`. Isso também resolve o requisito do PRD de que a transição para `FINISHED` "dispara recálculo de PhaseStanding" sem acoplar o módulo de matches ao de standings.

**Critério de aceite**: teste emitindo `match.finished` manualmente e verificando que um listener de exemplo é chamado; nenhuma dependência de import entre `matches/` e `standings/`.

---

### TASK-F07 — Padrão de validação de JSON dinâmico (`config`/`metadata`)

O schema tem **quatro** campos `Json?` deliberadamente sem schema fixo no banco (`EditionDiscipline.config`, `Phase.config`, `MatchEvent.metadata`) mas o PRD é explícito que a validação deve existir na camada de aplicação (Apêndice B: "não é validado por schema de banco... mas o backend deve validar por DTO específico por combinação discipline + type"). Sem um padrão único, cada task reinventa a validação (uma com `class-validator` num DTO aninhado, outra com `if` solto no service).

**Decisão**: um registry (`Map<string, ClassConstructor>`) mapeando chave composta → DTO de validação, validado via `class-transformer` `plainToInstance` + `validateSync` dentro de um `Pipe` reutilizável (`JsonShapeValidationPipe`), não um `ValidationPipe` global (porque a chave de qual DTO usar depende de um valor do próprio payload — `type` no caso do `MatchEvent`, `disciplineId` no caso do `EditionDiscipline.config` — então a resolução do DTO certo tem que acontecer depois de saber esses valores, dentro do service, não no pipe HTTP genérico). Concretamente: `MatchEventMetadataValidator.validate(disciplineSlug, eventType, metadata)` resolvendo contra a tabela do Apêndice B; combinações não mapeadas (ex.: `OTHER` para modalidades sem convenção) passam sem validação estrutural — apenas type-check de que é um objeto JSON válido.

**Critério de aceite**: teste unitário para `GOAL` em Futsal exigindo `{ minute: number }`, rejeitando payload sem `minute`; teste para `SET_WON` em Vôlei exigindo os três campos do Apêndice B.

---

### TASK-F08 — Serviço de auditoria (AuditLog)

**Decisão**: **não** interceptor puro. Um interceptor global captura request/response mas não tem acesso barato ao estado "antes" da entidade (precisaria de uma query extra genérica, arriscada de acertar por reflection para 12 models diferentes). Em vez disso: `AuditService.record({ staffId, editionId, action, entityType, entityId, before, after })` injetável, chamado explicitamente dentro de cada service de mutação, **dentro da mesma transação Prisma** que faz a mutação de domínio (consistência: se a mutação falha, o log não é gravado; se o log falhar, a mutação também não deveria commitar — trade-off aceito dado que auditoria é requisito de conformidade, não best-effort). Para reduzir boilerplate, um decorator `@Audited(action, entityType)` em métodos de service que já seguem a assinatura `(before, after, ctx) => ...` monta a chamada automaticamente — mas o decorator é açúcar sintático sobre o mesmo `AuditService`, não um mecanismo paralelo.

`editionId` fica `null` só para os dois casos legítimos do schema: criação de `Competition` e promoção inicial via `POST /competitions/:id/editions` antes da edição existir (o próprio `AuditLog.editionId` é opcional exatamente por isso, conforme comentário do schema).

**Critério de aceite**: teste chamando um service de exemplo que muda `Match.status`, verificando que uma linha em `AuditLog` foi criada com `beforeData`/`afterData` corretos e que um rollback da transação (forçado no teste) também reverte o audit log.

---

### TASK-F09 — Guard de autorização (hierarquia de 3 papéis)

**Correção de schema necessária antes desta task**: `schema.prisma` define `EditionStaffRoleType` com dois valores a mais do que o PRD prevê (`REFEREE`, `SCOREKEEPER`, `VOLUNTEER`). Confirmado que só existem três papéis (`SuperAdmin` como flag global + `EDITION_ADMIN` + `DISCIPLINE_MANAGER`) — o enum deve ser corrigido antes da TASK-F09/TASK-06 rodarem, para não gerar uma migration em cima de um enum que já nasce errado:

```prisma
enum EditionStaffRoleType {
  EDITION_ADMIN
  DISCIPLINE_MANAGER
}
```

Isso é uma mudança de schema, não de código de aplicação — trate como uma migration própria (`npx prisma migrate dev --name fix_staff_role_enum`) rodada **antes** da TASK-F09, e não como parte do guard em si. Se já existir alguma seed/dado de teste usando os valores removidos, precisa ajustar também.

**Decisão de fundação**: com o enum corrigido, a hierarquia é direta — `isSuperAdmin` OU `EditionStaffRole` com papel igual-ou-superior no escopo correto (`EDITION_ADMIN` herda `DISCIPLINE_MANAGER` em qualquer modalidade da própria edição). Sem papel intermediário a resolver, o guard fica mais simples do que a primeira versão deste documento previa.

Implementação: decorator `@RequireRole(EditionStaffRoleType.DISCIPLINE_MANAGER)` (aceita o mínimo exigido; `EDITION_ADMIN` sempre passa por herança) + `@ScopeParam('editionId')`/`@ScopeParam('disciplineId')` lendo de `req.params` — necessário porque as rotas têm o param de escopo em posições diferentes (`:editionId` direto em algumas, `:tournamentId`/`:phaseId`/`:matchId` indireto em outras, exigindo o guard resolver o `editionId`/`disciplineId` via uma query leve quando o param não é o escopo direto — ex.: `POST /matches/:matchId/events` precisa subir `Match → Phase → Tournament` para achar `editionId`/`disciplineId`). Esse resolver de escopo indireto é a parte mais sensível do guard e a que o Security Auditor (Seção 4) precisa testar rota a rota.

**Critério de aceite**: matriz de teste cobrindo (a) SuperAdmin passa em qualquer rota, (b) EDITION_ADMIN passa em rota de DISCIPLINE_MANAGER da mesma edição, (c) DISCIPLINE_MANAGER de uma modalidade **falha** em rota de outra modalidade da mesma edição, (d) DISCIPLINE_MANAGER de uma edição falha em edição diferente.

---

### TASK-F10 — Factories de teste a partir do schema Prisma

**Decisão**: factories manuais tipadas (`createTestStaff(overrides?)`, `createTestEdition(overrides?)` etc.), não uma lib de factory automática (`prisma-fabbrica` etc.) — o schema tem grafo de dependência profundo (`MatchEvent` depende de `Match` depende de `Phase` depende de `Tournament` depende de `EditionDiscipline`+`Discipline`...) e factories automáticas por reflection tendem a gerar dados relacionalmente inválidos para casos como "exatamente um de `teamId`/`athleteId`" in `TournamentEntry`. Cada factory compõe as anteriores (`createTestMatch` internamente chama `createTestPhase` se não receber `phaseId`), com `@faker-js/faker` só para valores escalares (nomes, e-mails). Um `resetDb()` helper (truncate em ordem reversa de FK) roda no `afterEach` dos testes de integração.

**Critério de aceite**: `createTestMatch()` sem overrides cria toda a cadeia de dependências e retorna um `Match` válido persistido; teste confirmando que rodar duas vezes sem reset não colide em nenhuma constraint `@@unique`.

---

## Seção 2 — Lotes de Execução

| Lote | Tasks | Paralelo? | Observação |
|---|---|---|---|
| 0.1 | F01 | — | Bloqueia tudo (estrutura de pastas) |
| 0.2 | F02, F04, F05, F09 | ✅ paralelo entre si | Independentes uma da outra; todas dependem só de F01 |
| 0.3 | F03 | sequencial após F02 | Precisa do formato de envelope decidido |
| 0.4 | F06, F07, F10 | ✅ paralelo entre si | F07 depende de F03 (DTOs); F06 e F10 só dependem de F01 |
| 0.5 | F08 | sequencial após F03 e F04 | Precisa de mapeamento (F03) e da decisão logging vs. audit (F04) já registrada |
| 1 | TASK-01 | — | Bloqueia todo o resto (login/JWT é pré-requisito real do guard funcionar fim-a-fim, mesmo com F09 já implementado) |
| 2 | TASK-02, TASK-03, TASK-04 | ✅ paralelo | Módulos disjuntos (`competitions/`, `disciplines/`, `catalog/`); zero overlap de arquivo |
| 3 | TASK-06 | pode começar assim que TASK-02 terminar (não precisa esperar TASK-03/04) | PRD agrupa com TASK-05, mas a dependência real é só TASK-01+02 |
| 3 | TASK-05 | após TASK-02, 03, 04 | — |
| 3 | TASK-07 | após TASK-02, 03 (não precisa esperar TASK-04) | Pode rodar em paralelo com TASK-05/06 se braço de agentes permitir — módulo `tournaments/` não toca em `edition-rosters/` nem `edition-staff-roles/` |
| 4 | TASK-08 | após TASK-07 | — |
| 5 | TASK-09 | após TASK-05, TASK-08 | — |
| 6 | TASK-10 | após TASK-08, TASK-09 | — |
| 7 | TASK-11 | após TASK-10 | **Não** paralelizar com nada que toque `matches/` — grava em `Match.scoreA/B`/`lastEventSequence` na mesma transação |
| 8 | TASK-12, TASK-13 | ✅ paralelo entre si (graças ao F06) | Sem F06, isso seria sequencial forçado — risco fica documentado mesmo com o event bus: revisar se algum listener depende de ordem de execução entre os dois |
| 9 | TASK-14 | após tudo que grava AuditLog já existir (F08 cobre a escrita; TASK-14 é só a leitura/filtro) — pode ir em paralelo com TASK-12/13 | Módulo `audit-logs/` é read-only, zero overlap |
| 9 | TASK-15 | após TASK-07 a 13 (usa dados de todos) | Pode começar a estrutura de rota antes, mas testes de integração reais só fecham no final |

---

## Seção 3 — Plano por Task do PRD

### TASK-01-EXEC — Autenticação de Staff

**Como implementar**: `AuthModule` com `PassportStrategy` (`JwtStrategy` para access token). `bcrypt`/`argon2` para hash — ver pesquisa obrigatória abaixo. `POST /auth/refresh` — o PRD diz "via cookie/refresh token", que é ambíguo o suficiente pra não ser decisão de agente: **marcar para validação humana** se o refresh token vai em cookie `httpOnly` (mais seguro contra XSS, mas exige CORS/CSRF cuidadoso) ou no corpo da resposta como no `login`. `GET /auth/me` monta `editionRoles` fazendo `include` de `EditionStaffRole` com `discipline` para preencher `disciplineName` denormalizado na resposta.

**Autonomia de pesquisa**:
- Algoritmo de assinatura JWT (RS256 vs HS256).
- Estratégia de refresh token: rotação vs. reuso.
- Hash de senha: argon2id vs bcrypt.
- Rate limiting de tentativas de login.

**Decisões que exigem validação humana**: local de armazenamento do refresh token (cookie vs body); se rotação exigir tabela nova fora do `schema.prisma`.

**Critério de aceite verificável**: teste e2e `POST /auth/login` com credenciais válidas retornando 200; credenciais inválidas retornando 401; `GET /auth/me` sem token retornando 401; `POST /auth/refresh` gerando novo access token.

---

### TASK-02-EXEC — Competitions & Editions

**Como implementar**: Prisma direto nos services. `POST /competitions/:id/editions` precisa capturar `P2002` do `@@unique([competitionId, year])` e traduzir via F02. `PATCH /editions/:editionId/status` só aceita transições dentro do enum `EditionStatus` — decidir se a transição é livre ou uma máquina de estados restrita (`PLANNING → ONGOING → FINISHED → ARCHIVED`).

**Decisões que exigem validação humana**: regra de transição de `EditionStatus` (livre vs. máquina de estados).

**Critério de aceite verificável**: `POST /competitions/:id/editions` duplicado retorna 409; guard bloqueia `POST /competitions` para staff sem `isSuperAdmin`.

---

### TASK-03-EXEC — Disciplines

**Como implementar**: `POST /disciplines` é catálogo global. **Qual `editionId` o guard usa pra validar `EDITION_ADMIN` num endpoint que não recebe `:editionId` na rota (`POST /disciplines`)?** **Ponto de validação humana**: ou (a) qualquer `EDITION_ADMIN` pode criar `Discipline` global, ou (b) essa rota deveria ser `isSuperAdmin`. `config` em `POST /editions/:editionId/disciplines` e `PATCH .../disciplines/:id` usa o validador de F07.

**Decisões que exigem validação humana**: escopo real de autorização de `POST /disciplines`.

**Critério de aceite verificável**: `POST /editions/:editionId/disciplines` com `disciplineId` inexistente retorna 404; duplicar `(editionId, disciplineId)` retorna 409.

---

### TASK-04-EXEC — Teams & Athletes

**Como implementar**: idêntico padrão CRUD de catálogo global. `GET /teams?search=`/`GET /athletes?search=` — usar `ILIKE` simples.
* **Segurança & LGPD (CPF/RG)**: O `document` é um dado pessoal sensível (PII). Ele deve ser armazenado como um **Hash Criptográfico unidirecional** (ex: SHA-256 com *salt/pepper* da aplicação) para a validação de duplicidade no banco (`@@unique`). Para exibição em DTOs, o documento deve vir mascarado (`***.456.***-**`) e só exposto de forma completa a administradores (`EDITION_ADMIN` / `SuperAdmin`) sob criptografia simétrica reversível (AES-256), nunca exposto em texto plano a outros papéis como `DISCIPLINE_MANAGER`.

**Autonomia de pesquisa**: Algoritmo de mascaramento e criptografia simétrica para proteção de PII de atletas em conformidade com a LGPD.

**Decisões que exigem validação humana**: se o mascaramento nos DTOs de listagem de atletas é obrigatório para todos os escopos não-admin.

**Critério de aceite verificável**: `POST /athletes` duplicando `document` (mesmo hash gerado) retorna 409; requisição `GET /athletes` retorna o documento mascarado para usuários com perfil `DISCIPLINE_MANAGER`.

---

### TASK-05-EXEC — Edition Roster

**Como implementar**: `POST /editions/:editionId/rosters` precisa validar `teamId` nulo/presente contra `Discipline.isIndividual` antes de persistir. Guard aceita `DISCIPLINE_MANAGER`/`EDITION_ADMIN`, resolvendo escopo via `disciplineId` do body e `:editionId` da URL.

**Decisões que exigem validação humana**: se a troca de time exige `DELETE`+`POST` ou apenas um `PATCH` no roster.

**Critério de aceite verificável**: `POST` com `teamId` presente numa modalidade `isIndividual: true` retorna 400; duplicar `(editionId, disciplineId, athleteId)` retorna 409.

---

### TASK-06-EXEC — Edition Staff Roles

**Como implementar**: autorização condicional por `role` do corpo da requisição. `role === EDITION_ADMIN` exige `isSuperAdmin`; `role === DISCIPLINE_MANAGER` exige `EDITION_ADMIN` naquela edição. `disciplineId: null` só válido quando `role === EDITION_ADMIN`.

**Critério de aceite verificável**: staff sem `isSuperAdmin` tentando criar `role: EDITION_ADMIN` recebe 403; `EDITION_ADMIN` criando `DISCIPLINE_MANAGER` funciona.

---

### TASK-07-EXEC — Tournaments

**Como implementar**: `POST /editions/:editionId/tournaments` — guard escopado por `disciplineId` do body + `editionId` da URL. `PATCH /tournaments/:id/status` implementado como máquina de estados: `DRAFT → SCHEDULED → ONGOING → FINISHED`/`CANCELLED`.

**Critério de aceite verificável**: tentar `PATCH status: DRAFT` num torneio `FINISHED` retorna 400; `@@unique([editionId, disciplineId, name])` respeitado.

---

### TASK-08-EXEC — Phases & Groups

**Como implementar**: `config` de `Phase` validado por F07 com chave = `type` (`GROUP`/`LEAGUE`/`KNOCKOUT`). `POST /groups/:groupId/entries` valida que `entryId` existe e pertence ao mesmo `tournamentId` do `Group` antes de criar `GroupEntry`.

**Critério de aceite verificável**: `POST /tournaments/:id/phases` respeitando `@@unique([tournamentId, order])`; `POST /groups/:groupId/entries` com `entryId` de outro torneio retorna 400.

---

### TASK-09-EXEC — Tournament Entries

**Como implementar**: validação "exatamente um de `teamId`/`athleteId`" na camada de aplicação. Validar contra `Discipline.isIndividual` do torneio (helper `assertEntityMatchesDisciplineMode`).

**Decisões que exigem validação humana**: se a migração SQL manual do `CHECK` constraint entra nesta fase.

**Critério de aceite verificável**: `POST` com ambos ou nenhum `teamId` e `athleteId` preenchidos retorna 400; duplicata retorna 409.

---

### TASK-10-EXEC — Matches

**Como implementar**: `entryBId: null` (bye) é válido. `PATCH /matches/:id/status` para `FINISHED` é o gatilho de `match.finished`. Comparar `scoreA`/`scoreB` para setar `winnerEntryId` (nulo em empate).

**Autonomia de pesquisa**: como determinar vencedor em modalidades sem placar numérico direto (ex: xadrez).

**Critério de aceite verificável**: `PATCH status: FINISHED` com `scoreA > scoreB` seta `winnerEntryId = entryAId`; emite `match.finished`.

---

### TASK-11-EXEC — Match Events

**Como implementar**: **transação obrigatória na aplicação (sem Triggers no Banco)**.
* **Aviso de Concorrência**: Não utilize triggers de banco (como mencionado em notas no schema) para evitar conflitos de bloqueio com as queries enviadas pelo NestJS. Toda a lógica de sincronização de scores e contadores deve residir no NestJS.
* **Lock Pessimista**: Realize um `SELECT ... FOR UPDATE` (através de query raw ou métodos equivalentes do Prisma para lock de linha) na linha correspondente do `Match` antes de ler o `lastEventSequence`.
* **Fluxo da Transação**:
  1. Executar lock pessimista na linha do `Match`.
  2. Inserir o `MatchEvent` com `sequence = Match.lastEventSequence + 1`.
  3. Incrementar `Match.lastEventSequence` e atualizar `scoreA`/`scoreB` dependendo do `type` do evento.
  4. Commitar a transação.
  5. Emitir o evento de domínio `match.event.created` no barramento (F06) **após** o commit.

**Autonomia de pesquisa**: sintaxe correta e performance de Raw SQL para `SELECT FOR UPDATE` usando o cliente Prisma no PostgreSQL.

**Critério de aceite verificável**: teste de concorrência disparando dois `POST` simultâneos de evento para a mesma partida resulta em `sequence` 1 e 2 ordenadas e atualizadas com sucesso (sem colisão P2002); `DELETE` de evento recalcula e reverte o score do `Match` baseado na soma dos eventos válidos remanescentes.

---

### TASK-12-EXEC — Real-time (SSE)

**Como implementar**: listener de `match.event.created` faz `XADD` no Redis Stream `stream:match:{matchId}`. Controller SSE lê `Last-Event-ID` e faz `XRANGE` antes de entrar em `XREAD BLOCK`.
* **Configuração de Proxy & HTTP/2**: Como navegadores limitam HTTP/1.1 a 6 conexões por domínio, a aplicação deve rodar sob **HTTP/2** para multiplexar conexões. No proxy reverso (Nginx/Traefik), adicione cabeçalhos para desativar o buffering (`proxy_buffering off;`, `X-Accel-Buffering: no`) para evitar retenção de pacotes.
* **Prevenção de Memory Leaks**: Limpe intervalos (`clearInterval` do heartbeat) e conexões de escuta do Redis ao fechar o stream (evento `close` da request).
* **Heartbeat**: Enviar ping `: ping\n\n` a cada 25s.

**Autonomia de pesquisa**: configuração detalhada do Nginx para rotas `/stream` e gerenciamento de concorrência de sockets no Node.js com HTTP/2.

**Decisões que exigem validação humana**: TTL de retenção dos Redis Streams após o término do torneio/partida.

**Critério de aceite verificável**: cliente conectando com `Last-Event-ID: 5` recebe o replay correto; a desconexão do cliente encerra imediatamente o listener do Redis no backend (verificável via logs de conexão).

---

### TASK-13-EXEC — Phase Standings

**Como implementar**: listener de `match.finished` dispara recompute completo da fase.
* **Algoritmo de Desempate (Comparator Chain)**: Implementar uma cadeia de comparadores independentes baseada em funções puras (`comparePoints`, `compareGoalDiff`, `compareHeadToHead`). Se a primeira função retornar `0` (empate), o motor chama a próxima função de desempate dinamicamente com base no array `Phase.config.tiebreakers`.
* Confrontos diretos (`headToHead`) devem ser avaliados apenas sobre os dados das equipes atualmente empatadas no critério anterior.

**Autonomia de pesquisa**: implementação limpa e funcional de uma cadeia encadeada de comparadores em TypeScript sem acoplamento.

**Decisões que exigem validação humana**: comportamento de desempate final se todos os critérios do array de tiebreakers empatarem (ex: sorteio ou manter mesmo rank).

**Critério de aceite verificável**: fixture com 4 times empatados em pontos simula ordenação e resolve corretamente através do confronto direto em primeiro lugar, e goal diff em segundo.

---

### TASK-14-EXEC — Audit Logs

**Como implementar**: read-only. `GET /audit-logs` (global) exige `isSuperAdmin`; `GET /editions/:editionId/audit-logs` exige `EDITION_ADMIN` daquela edição.

**Critério de aceite verificável**: `EDITION_ADMIN` da edição A não vê logs da edição B; paginação funcional.

---

### TASK-15-EXEC — Rotas públicas agregadas (spectator)

**Como implementar**: sem autenticação.
* **Cache Stampede (Efeito Manada)**: Como estas rotas são altamente concorridas durante o evento, a invalidação do cache sob picos de acesso pode derrubar o banco de dados. Implemente uma estratégia de **Single Flight** (onde apenas uma requisição consulta o banco para preencher o cache, e as outras aguardam o resultado) ou **Stale-While-Revalidate** para servir o cache antigo por alguns milissegundos enquanto atualiza o novo em background.
* Cache dinâmico via Redis com TTL curto para `/live` e TTL maior para `/bracket`.

**Autonomia de pesquisa**: lib de controle de cache concorrente (ex: cache-manager ou padrão Single Flight implementado manualmente).

**Decisões que exigem validação humana**: TTL padrão aceitável do cache para o público geral (spectators).

**Critério de aceite verificável**: 100 requisições simultâneas disparadas contra `/live` resultam em apenas 1 chamada de query de banco (pode ser validado com logs de consulta do Prisma), e as demais 99 leem diretamente do Redis.

---

## Seção 4 — Desenho do `orchestrate.sh`

*(Ver especificação detalhada implementada no projeto para a versão atualizada com o Reviewer/Quality Gate).*

---

## Seção 5 — Desenho do Ralph Loop

*(Ver especificação detalhada implementada no projeto).*
