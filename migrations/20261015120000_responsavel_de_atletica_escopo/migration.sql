-- O papel TEAM_MANAGER entrou em 20260828120000_gestor_de_atletica, mas a
-- restricao de escopo criada em 20260816160000_integration_contract so
-- conhecia EDITION_ADMIN e DISCIPLINE_MANAGER. Toda tentativa de conceder o
-- papel de responsavel de atletica violava a restricao -- por isso nenhuma
-- atletica teve acesso na Copa Halterada 2026.
--
-- Cada papel se prende a exatamente um alcance:
--   EDITION_ADMIN       -> a edicao inteira (nem modalidade, nem equipe);
--   DISCIPLINE_MANAGER  -> uma modalidade;
--   TEAM_MANAGER        -> uma equipe.
ALTER TABLE "edition_staff_roles"
DROP CONSTRAINT "edition_staff_roles_scope_check";

ALTER TABLE "edition_staff_roles"
ADD CONSTRAINT "edition_staff_roles_scope_check"
CHECK (
  ("role" = 'EDITION_ADMIN' AND "editionDisciplineId" IS NULL AND "teamId" IS NULL)
  OR
  ("role" = 'DISCIPLINE_MANAGER' AND "editionDisciplineId" IS NOT NULL AND "teamId" IS NULL)
  OR
  ("role" = 'TEAM_MANAGER' AND "editionDisciplineId" IS NULL AND "teamId" IS NOT NULL)
);
