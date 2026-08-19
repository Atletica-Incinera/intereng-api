import { NotFoundException } from '@nestjs/common';

/**
 * Nenhuma competição (ou edição) está marcada como ativa.
 *
 * Distinto de um 404 comum: "edição X não existe" é um erro de quem chamou —
 * um ID errado. "Não há competição ativa" é um estado legítimo do sistema
 * (nenhuma foi criada ainda, ou nenhuma foi ativada), e o cliente precisa
 * reagir diferente: mostrar a chamada para criar a primeira, não uma tela de
 * erro genérica. Sem um código próprio, os dois 404 seriam indistinguíveis
 * pelo front além de comparar o texto da mensagem em português — frágil.
 */
export class NoActiveEditionException extends NotFoundException {}
