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
