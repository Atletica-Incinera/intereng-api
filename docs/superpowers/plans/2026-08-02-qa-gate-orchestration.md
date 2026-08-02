# QA Gate Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a multi-agent orchestration pipeline (`orchestrate.sh`) that runs the development loop (`ralph-loop.sh`) as the Engineer and enforces a rigorous Senior Architect Quality Gate Reviewer to validate code quality before commits are approved.

**Architecture:** We will modify `ralph-loop.sh` to inject external feedback from the `RALPH_FEEDBACK` environment variable into the agent's prompt. We will then implement `orchestrate.sh` to capture git diffs, call the Reviewer agent via CLI, check for approval signatures, manage soft git resets, and loop back with errors.

**Tech Stack:** Bash, Git, Antigravity CLI (`agy`), Gemini CLI (`gemini`).

## Global Constraints

- **Language & Runtime:** Pure Bash scripts compatible with macOS/zsh/bash.
- **Execution Mode:** Headless execution safety.
- **Output Signatures:**
  - Approved: `STATUS: APROVADO`
  - Rejected: `STATUS: REJEITADO. Motivo: [motivos]`

---

### Task 1: Integrate `RALPH_FEEDBACK` into `ralph-loop.sh`

**Files:**
- Modify: `ralph-loop.sh:241-250`
- Create (Test): `test-ralph-loop-feedback.sh`

**Interfaces:**
- Consumes: Environment variable `RALPH_FEEDBACK`
- Produces: Dynamic prompt containing the reviewer feedback block appended under a warning section.

- [ ] **Step 1: Write a test bash script to verify prompt construction**

Create `test-ralph-loop-feedback.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Prepare environment
export PROMPT_FILE="PROMPT_TEST.md"
export TASKS_FILE="tasks_test.md"
export REPO_DIR="$(pwd)"
echo "Test base prompt" > "$PROMPT_FILE"
touch "$TASKS_FILE"

# Source the script's functions or run test
# We mock build_prompt behavior to ensure it outputs correct data
# Since ralph-loop.sh is not modularized for sourcing, we will test by calling a dry-run or mocking.
# Instead of sourcing, we will patch ralph-loop.sh and then run a check command.

# Set RALPH_FEEDBACK
export RALPH_FEEDBACK="[SOLID] SRP violation in AuthController
[DRY] Repeated database queries in AuthService"

# Execute a check script or extract build_prompt logic
# We will create a small script that tests the patched ralph-loop.sh build_prompt output
```

- [ ] **Step 2: Run test to verify it fails (before implementation)**

Run: `bash test-ralph-loop-feedback.sh` (or check manual build_prompt output)
Expected: Prompt output does not contain the `RALPH_FEEDBACK` string.

- [ ] **Step 3: Modify `build_prompt` in `ralph-loop.sh`**

Replace:
```bash
build_prompt() {
  local prompt
  prompt="$(cat "$PROMPT_FILE")"
  if [[ -n "$TASK_FILTER" ]]; then
    prompt="${prompt}

FOCO OBRIGATÓRIO DESTA ITERAÇÃO: trabalhe exclusivamente em ${TASK_FILTER}, ignore a ordem padrão de tasks.md se ela mandar outra coisa."
  fi
  printf '%s' "$prompt"
}
```
With:
```bash
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
```

- [ ] **Step 4: Run test to verify it passes**

Run the test and verify that output contains the exact text of `RALPH_FEEDBACK`.
Expected: PASS

- [ ] **Step 5: Clean up test files and commit**

Run:
```bash
rm -f PROMPT_TEST.md tasks_test.md test-ralph-loop-feedback.sh
git add ralph-loop.sh
git commit -m "feat: support RALPH_FEEDBACK in ralph-loop prompt construction"
```

---

### Task 2: Implement Orchestration Pipeline (`orchestrate.sh`)

**Files:**
- Create: `orchestrate.sh`
- Create (Test): `test-orchestrate-flow.sh`

**Interfaces:**
- Consumes: Task ID as positional parameter `$1`, optionally `MAX_CYCLES` as `$2`.
- Produces: CLI execution of `ralph-loop.sh` and Reviewer LLM evaluation. Manages git soft resets on rejection.

- [ ] **Step 1: Create the orchestrator script**

Create `orchestrate.sh` with the following code:
```bash
#!/usr/bin/env bash
# ============================================================================
# orchestrate.sh — Pipeline sequencial com Quality Gate para Tasks do PRD
# ============================================================================

set -uo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "Uso: $0 <TASK-ID> [MAX_CYCLES]" >&2
  exit 1
fi

MAX_CYCLES="${2:-3}"
CYCLE=0
AGENT="${AGENT:-agy}"
REPO_DIR="$(pwd)"
LOG_DIR="$REPO_DIR/.agent-logs"
mkdir -p "$LOG_DIR"

RALPH_FEEDBACK=""

run_engineer() {
  echo "[Cycle $CYCLE] Iniciando Engineer para a task $TASK_ID..."
  export RALPH_FEEDBACK
  ./ralph-loop.sh --task "$TASK_ID" --max 15
  return $?
}

run_reviewer() {
  echo "[Cycle $CYCLE] Invocando Reviewer (Quality Gate) para a task $TASK_ID..."
  
  local diff_content
  diff_content="$(git diff HEAD~1 HEAD 2>/dev/null || git diff HEAD)"

  if [[ -z "$diff_content" ]]; then
    echo "Nenhuma alteração detectada no Git para revisão."
    return 0
  fi

  local reviewer_prompt
  reviewer_prompt="Você é um Arquiteto de Software Sênior atuando como um Quality Gate rigoroso.
Analise o código recebido no diff abaixo e valide os seguintes critérios:
1. SOLID: O código viola o Princípio de Responsabilidade Única (SRP) ou Aberto/Fechado (OCP)?
2. DRY: Há lógica repetida que deveria ser extraída?
3. Documentação: Funções complexas possuem Docstrings claras explicativas?

Sua resposta deve seguir estritamente este formato:
Se houver falhas: \"STATUS: REJEITADO. Motivo: [Explique o que corrigir em formato de lista]\"
Se estiver perfeito: \"STATUS: APROVADO\"

Abaixo está o diff contendo as alterações da task ${TASK_ID}:
\`\`\`diff
${diff_content}
\`\`\`"

  local reviewer_output_file="$LOG_DIR/reviewer-${TASK_ID}-cycle-${CYCLE}.log"
  
  if [[ "$AGENT" == "agy" ]]; then
    agy -p "$reviewer_prompt" --output-format text > "$reviewer_output_file" 2>&1
  else
    gemini -p "$reviewer_prompt" > "$reviewer_output_file" 2>&1
  fi

  if grep -q "STATUS: APROVADO" "$reviewer_output_file"; then
    echo "Reviewer aprovou as alterações!"
    return 0
  elif grep -q "STATUS: REJEITADO" "$reviewer_output_file"; then
    RALPH_FEEDBACK="$(sed -n '/STATUS: REJEITADO/,$p' "$reviewer_output_file")"
    echo "Reviewer REJEITOU as alterações. Motivos:"
    echo "$RALPH_FEEDBACK"
    git reset --soft HEAD~1
    return 1
  else
    echo "Reviewer retornou um formato inesperado. Verifique o log: $reviewer_output_file"
    RALPH_FEEDBACK="$(cat "$reviewer_output_file")"
    git reset --soft HEAD~1
    return 1
  fi
}

while (( CYCLE < MAX_CYCLES )); do
  CYCLE=$((CYCLE + 1))
  echo "=== INICIANDO CICLO DE DESENVOLVIMENTO $CYCLE/$MAX_CYCLES ==="
  
  if run_engineer; then
    if run_reviewer; then
      echo ">>> TASK $TASK_ID CONCLUÍDA E APROVADA COM SUCESSO! <<<"
      exit 0
    else
      echo ">>> Ciclo $CYCLE falhou na revisão. Retornando ao Engineer... <<<"
    fi
  else
    echo ">>> Falha na execução do Engineer. Abortando. <<<"
    exit 2
  fi
done

echo ">>> A task $TASK_ID excedeu o limite de $MAX_CYCLES ciclos de revisão. Escalar para humano. <<<"
exit 3
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x orchestrate.sh`

- [ ] **Step 3: Write a script to test orchestrate.sh execution flow**

Create `test-orchestrate-flow.sh` which mocks `ralph-loop.sh` and the LLM agent CLI commands (or tests them locally using dummy commits) to verify the reset and environment flow.

- [ ] **Step 4: Execute tests to verify flow works**

Run: `bash test-orchestrate-flow.sh`
Expected: Output verifies that on mock failure, git reset is called and the feedback is exported for the next cycle.

- [ ] **Step 5: Clean up test files and commit**

Run:
```bash
rm -f test-orchestrate-flow.sh
git add orchestrate.sh
git commit -m "feat: add orchestrate.sh pipeline with QA gate loop"
```
