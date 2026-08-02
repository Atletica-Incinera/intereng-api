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
