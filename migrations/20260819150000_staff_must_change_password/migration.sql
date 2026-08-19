-- Toda conta criada por convite recebe a mesma STAFF_INVITE_PASSWORD, e o
-- bootstrap do super admin recebe a senha que estiver no ambiente. Sem esta
-- marca nao existe como exigir que a pessoa troque antes de usar o sistema: a
-- senha inicial, conhecida por quem convidou, seria permanente.
--
-- O padrao e false para nao trancar quem ja existe: contas anteriores a esta
-- migration continuam entrando normalmente.
ALTER TABLE "staff"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
