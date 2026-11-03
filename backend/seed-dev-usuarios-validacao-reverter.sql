-- Reverte o seed de validacao do DEV (seed-dev-usuarios-validacao.mjs).
-- Remove APENAS as linhas criadas para os usuarios do DEV (54 e 59).
-- Nenhum dado pre-existente e tocado.
--
-- Rodar via runDmlMitra, um comando por vez, SEM generateMigration.

DELETE FROM VISITAS            WHERE VENDEDOR_ID = 59;
DELETE FROM TAREFAS            WHERE VENDEDOR_ID = 59;
DELETE FROM AGENDA_INTERNA     WHERE CRIADOR_ID IN (54, 59);
DELETE FROM METAS_VENDEDOR     WHERE USER_ID = 59;
DELETE FROM ALERTAS_INTELIGENTES WHERE ID_VENDEDOR = 59;
DELETE FROM EQUIPE_CLIENTE     WHERE ID_VENDEDOR = 59;
DELETE FROM BU_VENDEDOR        WHERE VENDEDOR_ID = 59;
DELETE FROM VENDEDOR_RCA       WHERE USER_ID = 59;
DELETE FROM USUARIO_CARGO      WHERE USER_ID IN (54, 59);
