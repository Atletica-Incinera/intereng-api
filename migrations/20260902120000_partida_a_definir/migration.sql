-- Partida com participante ainda indefinido.
--
-- O chaveamento da organizacao descreve confrontos como "VENCEDOR J3",
-- "1 GRUPO A" e "MELHOR TERCEIRO COLOCADO". Eles tem dia, hora e ginasio
-- definidos desde o comeco; o que falta e o resultado que diz quem joga.
--
-- Sem estes campos a partida so podia existir depois do resultado, e o publico
-- nao via o chaveamento antes da primeira rodada terminar. As colunas de
-- participante ja eram nulaveis: faltava o rotulo para mostrar no lugar.
ALTER TABLE "matches"
ADD COLUMN "placeholderA" TEXT,
ADD COLUMN "placeholderB" TEXT;
