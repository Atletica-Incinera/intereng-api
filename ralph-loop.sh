#!/usr/bin/env bash
# ============================================================================
# ralph-loop.sh — Ralph Wiggum loop para o sistema de gestão de competições
#
# Técnica: Geoffrey Huntley, "Ralph Wiggum as a software engineer" (2025).
# Princípio: cada iteração roda uma SESSÃO NOVA do agente (contexto zerado),
# ele lê o estado do projeto no filesystem/git (nunca em memória de chat),
# escolhe a task de maior prioridade ainda não feita, implementa, roda
# verificação, comita se passar, e o loop reinicia. O bash é a camada externa
# de controle — ele decide quando parar, não o agente.
#
# Agentes suportados (ver nota abaixo sobre o desligamento do Gemini CLI):
#   - agy    -> Antigravity CLI (google.com/antigravity), sucessor do Gemini
#               CLI para contas free/Pro/Ultra desde 18/06/2026.
#   - gemini -> Gemini CLI clássico. Só funciona hoje se você tiver
#               GEMINI_API_KEY paga ou licença Code Assist Standard/
#               Enterprise — nas contas gratuitas ele para de responder.
#
# Uso:
#   ./ralph-loop.sh --init                    # cria .ralph/, PROMPT.md, tasks.md
#   ./ralph-loop.sh                            # roda o loop com os defaults
#   ./ralph-loop.sh --agent gemini --max 15
#   ./ralph-loop.sh --task TASK-F01            # foca numa task específica
#   touch .ralph/stop                          # sinaliza parada (ou o agente
#                                               # cria isso sozinho ao terminar)
# ============================================================================

set -uo pipefail  # sem -e: o loop precisa sobreviver a uma iteração falha

# ---------------------------------------------------------------------------
# Config (sobrescrevível por variável de ambiente ou flag)
# ---------------------------------------------------------------------------
REPO_DIR="${REPO_DIR:-$(pwd)}"
AGENT="${AGENT:-agy}"                       # agy | gemini
MAX_ITERATIONS="${MAX_ITERATIONS:-40}"
PRINT_TIMEOUT="${PRINT_TIMEOUT:-15m}"
PROMPT_FILE="${PROMPT_FILE:-PROMPT.md}"
TASKS_FILE="${TASKS_FILE:-tasks.md}"
TASK_FILTER=""                              # se setado, foca uma TASK-ID só
VERIFY_CMD="${VERIFY_CMD:-npm run build && npm run lint && npm test}"
PROTECTED_BRANCHES="${PROTECTED_BRANCHES:-main master}"
SWITCH_ON_FAILURE="${SWITCH_ON_FAILURE:-true}"
DRY_RUN=false

RALPH_DIR="$REPO_DIR/.ralph"
LOG_DIR="$REPO_DIR/.agent-logs"
STOP_FILE="$RALPH_DIR/stop"
STATE_FILE="$RALPH_DIR/current-agent"
LOCK_FILE="$RALPH_DIR/lock"

# ---------------------------------------------------------------------------
# Parse de flags
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) ACTION=init; shift ;;
    --agent) AGENT="$2"; shift 2 ;;
    --max) MAX_ITERATIONS="$2"; shift 2 ;;
    --task) TASK_FILTER="$2"; shift 2 ;;
    --prompt-file) PROMPT_FILE="$2"; shift 2 ;;
    --verify) VERIFY_CMD="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Flag desconhecida: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die()  { log "ERRO: $*"; exit 1; }

# ---------------------------------------------------------------------------
# --init : bootstrap dos arquivos que o loop espera encontrar
# ---------------------------------------------------------------------------
bootstrap() {
  mkdir -p "$RALPH_DIR" "$LOG_DIR" "$LOG_DIR/iterations"

  if [[ ! -f "$TASKS_FILE" ]]; then
    cat > "$TASKS_FILE" <<'EOF'
# Checklist de execução — sistema de gestão de competições
# Convenção: `- [ ]` não feita, `- [x]` feita. Uma task por linha.
# IDs batem com o documento plano-execucao-api-competicoes.md.
# O agente deve escolher a PRIMEIRA task não marcada nesta ordem (é a ordem
# de dependência já resolvida nos lotes de execução do documento).

## Lote 0 — Fundação
- [ ] TASK-F01 — Estrutura de módulos e convenções
- [ ] TASK-F02 — Envelope de resposta e filtro global de erro
- [ ] TASK-F04 — Logging estruturado (Pino)
- [ ] TASK-F05 — Módulo Redis compartilhado
- [ ] TASK-F09 — Migration corrigindo EditionStaffRoleType + Guard de autorização
- [ ] TASK-F03 — Base de DTOs, paginação, mapeamento Prisma -> DTO
- [ ] TASK-F06 — Barramento de eventos de domínio (EventEmitter2)
- [ ] TASK-F07 — Validação de JSON dinâmico (config/metadata)
- [ ] TASK-F08 — Serviço de auditoria (AuditLog)
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
EOF
    log "Criado $TASKS_FILE"
  fi

  if [[ ! -f "$PROMPT_FILE" ]]; then
    cat > "$PROMPT_FILE" <<'EOF'
Você está trabalhando no sistema de gestão de competições esportivas
(NestJS + PostgreSQL/Prisma + Redis + SSE, single VM). Esta é UMA iteração
de um ralph loop: sua sessão não tem memória da iteração anterior — todo o
estado do projeto está no filesystem e no histórico do git. Leia antes de
agir.

CONTEXTO OBRIGATÓRIO (leia nesta ordem antes de tocar em código):
1. schema.prisma — fonte de verdade do modelo de dados.
2. PRD-api-sistema-competicoes.md — contrato de API completo.
3. plano-execucao-api-competicoes.md — "como" implementar cada task,
   decisões já tomadas, pontos de pesquisa obrigatória e decisões que
   precisam de validação humana (NÃO decida essas sozinho — se a próxima
   task exigir uma, pare, registre em .ralph/needs-human.md e escolha
   a próxima task disponível).
4. tasks.md — checklist de progresso.

O QUE FAZER NESTA ITERAÇÃO:
1. Abra tasks.md e identifique a PRIMEIRA linha `- [ ]` (task de maior
   prioridade segundo a ordem de lotes já definida).
2. Releia a seção correspondente dessa task em
   plano-execucao-api-competicoes.md (TASK-F0X ou TASK-XX-EXEC).
3. Se a task tem "decisão que exige validação humana" ainda não registrada
   em .ralph/needs-human.md: registre a pergunta lá, NÃO implemente essa
   parte, pule para a próxima task disponível. Não invente a resposta.
4. Se a task tem "autonomia de pesquisa" marcada: pesquise a prática atual
   recomendada antes de implementar (não copie cegamente exemplo do PRD),
   documente a decisão tomada num comentário curto no código ou commit.
5. Implemente APENAS essa task (não adiante trabalho de outra).
6. Rode build, lint e testes localmente. Corrija o que falhar. Repita até
   passar ou até você não conseguir mais progredir sozinho.
7. Se passou: marque `- [x]` em tasks.md, faça commit
   (`git commit -m "ralph: <TASK-ID> <resumo curto>"`).
8. Se NÃO passou depois de tentativas razoáveis: NÃO marque a task como
   feita, deixe o trabalho parcial commitado numa branch/stash describes,
   e registre o motivo em .agent-logs/blocked-<TASK-ID>.md.

SINALIZAÇÃO DE FIM:
- Se TODAS as tasks de tasks.md estiverem marcadas `- [x]`, crie o arquivo
  `.ralph/stop` (isso encerra o loop) e escreva `<promise>COMPLETE</promise>`
  na sua resposta final.
- Se você não consegue prosseguir com NENHUMA task sem uma decisão humana
  pendente, escreva `<promise>BLOCKED</promise>` na resposta final (o loop
  vai continuar rodando, mas isso fica registrado no log da iteração para
  quem for revisar).

REGRAS FIXAS (não decida diferente disso):
- Nunca commite direto na branch principal — esta sessão já deveria estar
  numa branch de feature (o script garante isso antes de te chamar).
- Nunca invente escopo de autorização além do que está em
  plano-execucao-api-competicoes.md / PRD.
- Uma task por iteração. Não tente resolver duas de uma vez mesmo que
  pareçam rápidas.
EOF
    log "Criado $PROMPT_FILE"
  fi

  cat > "$RALPH_DIR/.gitkeep-note" <<'EOF'
Diretório de controle do ralph loop. Normalmente .ralph/ e .agent-logs/
ficam fora do controle de versão do produto (adicione ao .gitignore) —
são artefato de COMO o código foi gerado, não domínio da aplicação.
Não confundir com AuditLog (TASK-F08), que é dado de produção.
EOF

  if [[ -f "$REPO_DIR/.gitignore" ]] && ! grep -q '^\.ralph/' "$REPO_DIR/.gitignore" 2>/dev/null; then
    printf '\n# Ralph loop\n.ralph/\n.agent-logs/\n' >> "$REPO_DIR/.gitignore"
    log "Adicionado .ralph/ e .agent-logs/ ao .gitignore"
  fi

  log "Bootstrap completo. Revise $PROMPT_FILE e $TASKS_FILE antes de rodar o loop."
}

if [[ "${ACTION:-}" == "init" ]]; then
  bootstrap
  exit 0
fi

# ---------------------------------------------------------------------------
# Guardas de segurança
# ---------------------------------------------------------------------------
cd "$REPO_DIR" || die "REPO_DIR inválido: $REPO_DIR"

command -v git >/dev/null 2>&1 || die "git não encontrado"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "não é um repositório git"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
for protected in $PROTECTED_BRANCHES; do
  if [[ "$current_branch" == "$protected" ]]; then
    die "Você está na branch '$protected'. Crie e mude para uma branch de feature antes de rodar o ralph loop (ex: git checkout -b ralph/${TASK_FILTER:-run}-$(date +%Y%m%d))."
  fi
done

[[ -f "$PROMPT_FILE" ]] || die "$PROMPT_FILE não existe. Rode '$0 --init' primeiro."
[[ -f "$TASKS_FILE" ]] || die "$TASKS_FILE não existe. Rode '$0 --init' primeiro."

mkdir -p "$RALPH_DIR" "$LOG_DIR/iterations"

# Trava para não rodar duas instâncias do loop no mesmo repo ao mesmo tempo
if [[ -f "$LOCK_FILE" ]]; then
  old_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    die "Já existe um ralph-loop.sh rodando neste repositório (lock PID: $old_pid)."
  fi
fi
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

if [[ -f "$STOP_FILE" ]]; then
  log "Arquivo de stop já existe ($STOP_FILE). Removendo antes de começar (rode 'touch $STOP_FILE' durante o loop pra parar, não antes)."
  rm -f "$STOP_FILE"
fi

[[ -f "$STATE_FILE" ]] && AGENT="$(cat "$STATE_FILE")"
echo "$AGENT" > "$STATE_FILE"

# ---------------------------------------------------------------------------
# Invocação de agente
# ---------------------------------------------------------------------------
build_prompt() {
  local prompt
  prompt="$(cat "$PROMPT_FILE")"
  if [[ -n "$TASK_FILTER" ]]; then
    prompt="${prompt}

FOCO OBRIGATÓRIO DESTA ITERAÇÃO: trabalhe exclusivamente em ${TASK_FILTER}, ignore a ordem padrão de tasks.md se ela mandar outra coisa."
  fi

  if [[ -n "${RALPH_FEEDBACK:-}" ]]; then
    prompt="${prompt}

======================================================================
ATENÇÃO: O REVIEWER DE QA REJEITOU A TENTATIVA ANTERIOR DA TASK.
VOCÊ DEVE CORRIGIR OS MOTIVOS ABAIXO ANTES DE DECLARAR A TASK CONCLUÍDA:
${RALPH_FEEDBACK}
======================================================================"
  fi

  printf '%s' "$prompt"
}

# Roda o agente atual, escreve log da iteração, retorna o exit code do agente
invoke_agent() {
  local iter="$1" log_file="$2" prompt
  prompt="$(build_prompt)"

  case "$AGENT" in
    agy)
      # --add-dir garante que ele enxerga o repo mesmo se invocado de outro cwd
      # --dangerously-skip-permissions: sem isso, todo tool de shell/write fica
      #   em modo "Ask" e é soft-denied em headless (roda, mas não faz nada) —
      #   inaceitável pra um ralph loop. Rode isto só dentro de VM/container
      #   descartável, nunca na sua máquina principal sem sandbox.
      agy -p "$prompt" \
        --add-dir "$REPO_DIR" \
        --dangerously-skip-permissions \
        --print-timeout "$PRINT_TIMEOUT" \
        --output-format json \
        > "$log_file" 2>&1
      ;;
    gemini)
      # --yolo é o equivalente do Gemini CLI clássico ao --dangerously-skip-permissions
      # do agy. Mesma ressalva de segurança se aplica.
      gemini -p "$prompt" \
        --yolo \
        --output-format json \
        > "$log_file" 2>&1
      ;;
    *)
      die "AGENT desconhecido: $AGENT (use 'agy' ou 'gemini')"
      ;;
  esac
  return $?
}

other_agent() {
  [[ "$1" == "agy" ]] && echo "gemini" || echo "agy"
}

looks_like_exhaustion() {
  # Heurística: cota/rate-limit/auth expirado — nesses casos vale trocar de
  # agente em vez de insistir queimando iterações.
  grep -qiE '429|quota|rate.?limit|resource_exhausted|exhaust|authentication required|unauthorized' "$1" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Loop principal
# ---------------------------------------------------------------------------
log "Ralph loop iniciado. agente=$AGENT branch=$current_branch max_iterations=$MAX_ITERATIONS task_filter=${TASK_FILTER:-<nenhuma>}"
$DRY_RUN && log "(--dry-run: nenhuma chamada de agente real será feita)"

iteration=0
while (( iteration < MAX_ITERATIONS )); do
  iteration=$((iteration + 1))

  if [[ -f "$STOP_FILE" ]]; then
    log "Stop file detectado. Encerrando com sucesso."
    break
  fi

  iter_log="$LOG_DIR/iterations/$(printf '%03d' "$iteration")-${AGENT}.log"
  log "--- Iteração $iteration/$MAX_ITERATIONS (agente=$AGENT) ---"

  if $DRY_RUN; then
    log "[dry-run] pularia chamada de $AGENT, gravaria log em $iter_log"
    sleep 0.2
    continue
  fi

  invoke_agent "$iteration" "$iter_log"
  exit_code=$?

  {
    echo "=== resumo da iteração $iteration ($(date -u +%FT%TZ)) ==="
    echo "agente: $AGENT | exit_code: $exit_code"
    tail -c 4000 "$iter_log"
  } >> "$LOG_DIR/ralph-summary.log"

  if [[ $exit_code -ne 0 ]]; then
    log "Agente '$AGENT' saiu com código $exit_code nesta iteração (ver $iter_log)."

    if [[ "$SWITCH_ON_FAILURE" == "true" ]] && looks_like_exhaustion "$iter_log"; then
      next_agent="$(other_agent "$AGENT")"
      log "Indício de cota/rate-limit/auth esgotada. Trocando de agente: $AGENT -> $next_agent"
      AGENT="$next_agent"
      echo "$AGENT" > "$STATE_FILE"
    else
      log "Falha não parece ser de cota — deixando pra próxima iteração tentar de novo com o mesmo agente."
    fi
    continue
  fi

  # Verificação: só roda se a working tree tiver mudado nesta iteração —
  # se o agente não tocou em nada, não há o que verificar/commitar.
  if [[ -n "$(git status --porcelain)" ]]; then
    log "Rodando verificação: $VERIFY_CMD"
    if eval "$VERIFY_CMD" >> "$iter_log" 2>&1; then
      log "Verificação passou."
      if [[ -n "$(git status --porcelain)" ]]; then
        git add -A
        git commit -q -m "ralph: iteração $iteration ($AGENT) — $(date -u +%FT%TZ)" || true
        log "Commit realizado."
      fi
    else
      log "Verificação FALHOU nesta iteração — mudanças ficam na working tree pra próxima iteração corrigir (NÃO commitadas)."
    fi
  else
    log "Nenhuma mudança detectada nesta iteração."
  fi

  if grep -q '<promise>COMPLETE</promise>' "$iter_log" 2>/dev/null; then
    log "Agente sinalizou COMPLETE."
    touch "$STOP_FILE"
  fi
done

if [[ -f "$STOP_FILE" ]]; then
  log "Loop finalizado por sinal de parada após $iteration iteração(ões)."
  exit 0
fi

log "Loop atingiu o limite de $MAX_ITERATIONS iterações sem sinal de conclusão. Revise $LOG_DIR/ralph-summary.log e $RALPH_DIR/needs-human.md."
exit 1
