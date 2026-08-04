# Checklist de execução — sistema de gestão de competições
# Convenção: `- [ ]` não feita, `- [x]` feita. Uma task por linha.
# IDs batem com o documento plano-execucao-api-competicoes.md.
# O agente deve escolher a PRIMEIRA task não marcada nesta ordem (é a ordem
# de dependência já resolvida nos lotes de execução do documento).

## Lote 0 — Fundação
- [x] TASK-F01 — Estrutura de módulos e convenções
- [x] TASK-F02 — Envelope de resposta e filtro global de erro
- [x] TASK-F03 — Base de DTOs, paginação, mapeamento Prisma -> DTO
- [x] TASK-F04 — Logging estruturado (Pino)
- [x] TASK-F05 — Módulo Redis compartilhado
- [x] TASK-F06 — Barramento de eventos de domínio (EventEmitter2)
- [ ] TASK-F07 — Validação de JSON dinâmico (config/metadata)
- [ ] TASK-F08 — Serviço de auditoria (AuditLog)
- [ ] TASK-F09 — Migration corrigindo EditionStaffRoleType + Guard de autorização
- [ ] TASK-F10 — Factories de teste

## Lote 1
- [ ] TASK-01 — Autenticação de Staff

## Lote 2 (paralelizável entre agentes diferentes, não entre iterações deste loop)
- [ ] TASK-02 — Competitions & Editions
- [ ] TASK-03 — Disciplines
- [ ] TASK-04 — Teams & Athletes

## Lote 3
- [ ] TASK-06 — Edition Staff Roles
- [ ] TASK-05 — Edition Roster
- [ ] TASK-07 — Tournaments

## Lote 4-9
- [ ] TASK-08 — Phases & Groups
- [ ] TASK-09 — Tournament Entries
- [ ] TASK-10 — Matches
- [ ] TASK-11 — Match Events
- [ ] TASK-12 — Real-time (SSE)
- [ ] TASK-13 — Phase Standings
- [ ] TASK-14 — Audit Logs
- [ ] TASK-15 — Rotas públicas agregadas
