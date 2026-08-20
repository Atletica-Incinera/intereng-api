-- O acumulado de fair play ja era calculado a cada recalculo e usado no
-- desempate, mas nao tinha onde ser gravado: a tela recebia a ordem correta e
-- o numero zerado, o que torna impossivel auditar uma colocacao contestada.
--
-- Aditiva de proposito, com DEFAULT constante: no PostgreSQL 11+ o ADD COLUMN
-- ... NOT NULL DEFAULT <constante> nao reescreve a tabela, so pega ACCESS
-- EXCLUSIVE por um instante. E dispensa backfill porque zero e exatamente o
-- valor que as linhas antigas ja carregavam implicitamente — o proximo
-- recalculo da fase sobrescreve com o total real.
--
-- INTEGER, e nao DOUBLE PRECISION como "points"/"scoreFor": o peso disciplinar
-- de cada evento e um inteiro 0..10 no formulario de regulamento, entao a soma
-- nunca fraciona.
ALTER TABLE "phase_standings"
ADD COLUMN "disciplinary" INTEGER NOT NULL DEFAULT 0;
