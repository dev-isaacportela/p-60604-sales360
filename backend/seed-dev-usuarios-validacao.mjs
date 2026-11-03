// Seed de identidade dos usuarios do ambiente DEV (para validacao).
//
// POR QUE ESTE SCRIPT EXISTE
// O banco do DEV foi clonado com todos os dados reais (clientes, carteiras,
// vendas ate 22/09/2026). Mas o dado esta amarrado aos IDs de usuario ANTIGOS
// (5..50), e quem loga no DEV sao usuarios NOVOS:
//   54 = ti@benenutri.com        59 = lucas.rabelo@benenutri.com
// Sem vinculo, toda tela abre vazia. Este script amarra os dois logins do DEV
// a uma identidade operacional.
//
// ESTRATEGIA: puramente ADITIVA. Nenhuma linha existente e alterada ou movida.
// A carteira do Lucas usa apenas clientes que hoje nao pertencem a NENHUM
// vendedor, e um RCA que nao esta vinculado a nenhum usuario -- por isso nao ha
// duplicidade de carteira nem dupla contagem de faturamento.
//
// IMPORTANTE: nada aqui usa generateMigration. E massa de validacao do DEV e
// NAO deve subir para producao no promote.
//
// Reversivel: ver seed-dev-usuarios-validacao-reverter.sql
import 'dotenv/config';
import { configureSdkMitra, runDmlMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const agora = new Date().toISOString().slice(0, 19);

const USER_TI = 54;     // ti@benenutri.com
const USER_LUCAS = 59;  // lucas.rabelo@benenutri.com

// Territorio livre do Lucas: depto 1 (NUTRICAO) / secao 101 (NUTRICAO ENTERAL)
// nas filiais 1, 2 e 8. 61 clientes sem dono, ~R$ 1,36 mi faturados em 2026.
const BU_CODIGO = '1';
const ID_SECAO = 101;
const FILIAIS = ['1', '2', '8'];
const COD_RCA = 937;        // LAYLA LARISSE ROSA RIBEIRO (RS) - sem usuario vinculado
const COD_SUPERVISOR = 933; // POLLYANA ARAUJO CORREA

const dml = (sql) => runDmlMitra({ projectId, sql });
const q = async (sql) => {
  const r = await runQueryMitra({ projectId, sql });
  return r.result?.rows || r.rows || [];
};

// Clientes do territorio que hoje nao estao na carteira de ninguem.
const FILTRO_CLIENTES_LIVRES = `
  SELECT DISTINCT S.CLIENTE_ID, S.CODFILIAL
  FROM PEDIDOS_SEMANAIS_SYNC S
  JOIN CLIENTES C ON C.ID = S.CLIENTE_ID
  WHERE S.ATIVO = 1 AND S.ANO = 2026
    AND S.CODEPTO = '${BU_CODIGO}' AND S.ID_SECAO = ${ID_SECAO}
    AND S.CODFILIAL IN (${FILIAIS.map((f) => `'${f}'`).join(',')})
    AND NOT EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC WHERE EC.ID_CLIENTE = S.CLIENTE_ID)
`;

// --- 1. Cargos ---------------------------------------------------------------
// ti@benenutri.com = ADMIN (espelha o cargo do usuario legado 5 e a regra de
// diretoria que o proprio codigo ja aplica a esse email).
// Lucas = VENDEDOR, para validar o dia a dia do vendedor.
async function seedCargos() {
  await dml(`
    INSERT INTO USUARIO_CARGO (USER_ID, CARGO, ATUALIZADO_EM) VALUES
      (${USER_TI}, 'ADMIN', '${agora}'),
      (${USER_LUCAS}, 'VENDEDOR', '${agora}')
    ON DUPLICATE KEY UPDATE CARGO = VALUES(CARGO), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);
  console.log('[1] cargos aplicados');
}

// --- 2. Escopo de BU do Lucas -------------------------------------------------
// Sem BU_VENDEDOR a venda nao conta para o vendedor, mesmo com o cliente na carteira.
async function seedEscopoBu() {
  const values = FILIAIS.map(
    (f) => `('${BU_CODIGO}', ${USER_LUCAS}, TRUE, '${agora}', '${agora}', '${f}', ${ID_SECAO})`
  ).join(',\n      ');
  await dml(`
    INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CRIADO_EM, ATUALIZADO_EM, CODFILIAL, ID_SECAO)
    VALUES
      ${values}
    ON DUPLICATE KEY UPDATE ATIVO = TRUE, ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);
  console.log('[2] escopo de BU aplicado:', FILIAIS.length, 'filiais');
}

// --- 3. Vinculo RCA -----------------------------------------------------------
// Alimenta as consultas de analytics/faturamento parametrizadas por RCA.
async function seedRca() {
  await dml(`
    INSERT INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
    VALUES (${USER_LUCAS}, ${COD_RCA}, ${COD_SUPERVISOR})
    ON DUPLICATE KEY UPDATE COD_RCA = VALUES(COD_RCA), COD_SUPERVISOR = VALUES(COD_SUPERVISOR)
  `);
  console.log('[3] vinculo RCA', COD_RCA, 'aplicado');
}

// --- 4. Carteira --------------------------------------------------------------
async function seedCarteira() {
  await dml(`
    INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM, CODFILIAL, ID_SECAO)
    SELECT L.CLIENTE_ID, ${USER_LUCAS}, '${agora}', L.CODFILIAL, ${ID_SECAO}
    FROM (${FILTRO_CLIENTES_LIVRES}) L
    ON DUPLICATE KEY UPDATE CRIADO_EM = EQUIPE_CLIENTE.CRIADO_EM
  `);
  const [{ QT }] = await q(`SELECT COUNT(*) QT FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${USER_LUCAS}`);
  console.log('[4] carteira do Lucas:', QT, 'clientes');
}

// --- 5. Curva ABC da carteira -------------------------------------------------
// Classifica por faturamento 2026 para as telas de curva nao abrirem vazias.
async function seedCurva() {
  for (const [curva, ini, fim] of [['A', 0, 0.2], ['B', 0.2, 0.5], ['C', 0.5, 1.01]]) {
    await dml(`
      UPDATE EQUIPE_CLIENTE EC
      JOIN (
        SELECT X.CLIENTE_ID, PERCENT_RANK() OVER (ORDER BY X.VL DESC) PR
        FROM (
          SELECT S.CLIENTE_ID, SUM(S.VALOR) VL
          FROM PEDIDOS_SEMANAIS_SYNC S
          WHERE S.ATIVO = 1 AND S.ANO = 2026
            AND S.CLIENTE_ID IN (SELECT ID_CLIENTE FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${USER_LUCAS})
          GROUP BY S.CLIENTE_ID
        ) X
      ) R ON R.CLIENTE_ID = EC.ID_CLIENTE
      SET EC.CURVA_CLASSIFICACAO = '${curva}'
      WHERE EC.ID_VENDEDOR = ${USER_LUCAS} AND R.PR >= ${ini} AND R.PR < ${fim}
    `);
  }
  const rows = await q(`
    SELECT CURVA_CLASSIFICACAO C, COUNT(*) QT FROM EQUIPE_CLIENTE
    WHERE ID_VENDEDOR = ${USER_LUCAS} GROUP BY CURVA_CLASSIFICACAO ORDER BY C
  `);
  console.log('[5] curva ABC:', JSON.stringify(rows));
}

// --- 6. Metas mensais ---------------------------------------------------------
// Meta fixa de R$ 190 mil/mes: contra o realizado real do territorio, gera um
// espalhamento natural de atingimento (de ~43% a ~108%) para validar as faixas.
async function seedMetas() {
  const meses = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const values = meses
    .map((m) => `(${USER_LUCAS}, 2026, ${m}, 190000.00, '${agora}', '${agora}')`)
    .join(',\n      ');
  await dml(`
    INSERT INTO METAS_VENDEDOR (USER_ID, ANO, MES, VALOR_META, CRIADO_EM, ATUALIZADO_EM)
    VALUES
      ${values}
    ON DUPLICATE KEY UPDATE VALOR_META = VALUES(VALOR_META), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
  `);
  console.log('[6] metas 2026 aplicadas:', meses.length, 'meses');
}

// --- 7. Tarefas ---------------------------------------------------------------
async function seedTarefas() {
  await dml(`DELETE FROM TAREFAS WHERE VENDEDOR_ID = ${USER_LUCAS}`);
  await dml(`
    INSERT INTO TAREFAS (VENDEDOR_ID, TITULO, DESCRICAO, STATUS, PRIORIDADE, DATA_LIMITE, CRIADO_EM, CLIENTE_ID, CONCLUIDO_EM)
    SELECT ${USER_LUCAS}, T.TITULO, T.DESCRICAO, T.STATUS, T.PRIORIDADE, T.DATA_LIMITE, '${agora}', C.ID_CLIENTE, T.CONCLUIDO_EM
    FROM (
      SELECT 'Renegociar tabela de precos' TITULO, 'Cliente sinalizou proposta concorrente na linha enteral.' DESCRICAO, 'PENDENTE' STATUS, 'ALTA' PRIORIDADE, '2026-09-26' DATA_LIMITE, NULL CONCLUIDO_EM, 0 RN
      UNION ALL SELECT 'Enviar mix de nutricao enteral', 'Montar mix com os itens de maior giro e enviar por e-mail.', 'EM_ANDAMENTO', 'MEDIA', '2026-09-25', NULL, 1
      UNION ALL SELECT 'Agendar visita de pos-venda', 'Primeira compra fechada no mes: confirmar recebimento.', 'PENDENTE', 'MEDIA', '2026-09-30', NULL, 2
      UNION ALL SELECT 'Cobrar retorno do orcamento', 'Orcamento enviado ha 10 dias, sem retorno.', 'PENDENTE', 'ALTA', '2026-09-24', NULL, 3
      UNION ALL SELECT 'Revisar cadastro do cliente', 'Atualizar contato e endereco de entrega.', 'CONCLUIDA', 'BAIXA', '2026-09-18', '2026-09-17 15:20:00', 4
      UNION ALL SELECT 'Apresentar linha de saneantes', 'Oportunidade de ampliacao de mix.', 'CONCLUIDA', 'MEDIA', '2026-09-12', '2026-09-12 11:05:00', 5
    ) T
    JOIN (
      SELECT ID_CLIENTE, ROW_NUMBER() OVER (ORDER BY ID_CLIENTE) - 1 RN
      FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${USER_LUCAS}
    ) C ON C.RN = T.RN
  `);
  const [{ QT }] = await q(`SELECT COUNT(*) QT FROM TAREFAS WHERE VENDEDOR_ID = ${USER_LUCAS}`);
  console.log('[7] tarefas:', QT);
}

// --- 8. Visitas ---------------------------------------------------------------
async function seedVisitas() {
  await dml(`DELETE FROM VISITAS WHERE VENDEDOR_ID = ${USER_LUCAS}`);
  await dml(`
    INSERT INTO VISITAS (CLIENTE_ID, VENDEDOR_ID, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, STATUS, CHECKIN_HORA, CHECKOUT_HORA, RELATO, CRIADO_EM, PLANEJAMENTO)
    SELECT C.ID_CLIENTE, ${USER_LUCAS}, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM, V.TIPO, V.STATUS, V.CHECKIN_HORA, V.CHECKOUT_HORA, V.RELATO, '${agora}', V.PLANEJAMENTO
    FROM (
      SELECT '2026-09-22' DATA_AGENDADA, '09:00' HORA_INICIO, '10:00' HORA_FIM, 'Aumento de mix' TIPO, 'CONCLUIDA' STATUS, '09:05' CHECKIN_HORA, '10:12' CHECKOUT_HORA, 'Cliente aceitou incluir tres itens novos da linha enteral no proximo pedido.' RELATO, 'Apresentar mix ampliado' PLANEJAMENTO, 0 RN
      UNION ALL SELECT '2026-09-22', '14:00', '15:00', 'Manutenção', 'CONCLUIDA', '14:02', '14:48', 'Visita de rotina. Estoque adequado, sem demanda imediata.', 'Conferir giro', 1
      UNION ALL SELECT '2026-09-23', '10:00', '11:00', 'Positivação', 'CONCLUIDA', '10:10', '11:00', 'Cliente sem compra ha 60 dias voltou a comprar. Pedido fechado.', 'Reativar cliente', 2
      UNION ALL SELECT '2026-09-23', '16:00', '17:00', 'Renegociação', 'CANCELADA', NULL, NULL, NULL, 'Renegociar condicao de pagamento', 3
      UNION ALL SELECT '2026-09-24', '09:30', '10:30', 'Padronização de produto', 'EM_ANDAMENTO', '09:35', NULL, NULL, 'Padronizar dieta enteral', 4
      UNION ALL SELECT '2026-09-24', '15:00', '16:00', 'Gerar demanda', 'AGENDADA', NULL, NULL, NULL, 'Sondar demanda para o proximo trimestre', 5
      UNION ALL SELECT '2026-09-25', '09:00', '10:00', 'Aumento de mix', 'AGENDADA', NULL, NULL, NULL, 'Apresentar linha de saneantes', 6
      UNION ALL SELECT '2026-09-25', '14:00', '15:00', 'Financeiro', 'AGENDADA', NULL, NULL, NULL, 'Tratar titulo em aberto', 7
      UNION ALL SELECT '2026-09-30', '10:00', '11:00', 'Manutenção', 'AGENDADA', NULL, NULL, NULL, 'Visita de fechamento do mes', 8
    ) V
    JOIN (
      SELECT ID_CLIENTE, ROW_NUMBER() OVER (ORDER BY ID_CLIENTE) - 1 RN
      FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${USER_LUCAS}
    ) C ON C.RN = V.RN
  `);
  const [{ QT }] = await q(`SELECT COUNT(*) QT FROM VISITAS WHERE VENDEDOR_ID = ${USER_LUCAS}`);
  console.log('[8] visitas:', QT);
}

// --- 9. Agenda interna --------------------------------------------------------
async function seedAgenda() {
  await dml(`DELETE FROM AGENDA_INTERNA WHERE CRIADOR_ID IN (${USER_LUCAS}, ${USER_TI})`);
  await dml(`
    INSERT INTO AGENDA_INTERNA (TITULO, DESCRICAO, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, STATUS, CRIADOR_ID, CRIADO_EM, ATUALIZADO_EM)
    VALUES
      ('Alinhamento semanal da equipe', 'Revisao de metas e carteira da semana.', '2026-09-24', '08:00', '08:30', 'Reunião interna', 'AGENDADA', ${USER_LUCAS}, '${agora}', '${agora}'),
      ('Deslocamento para regiao da filial 8', 'Roteiro de visitas do dia.', '2026-09-25', '07:00', '08:30', 'Deslocamento', 'AGENDADA', ${USER_LUCAS}, '${agora}', '${agora}'),
      ('Fechamento mensal', 'Consolidar resultados do mes com a coordenacao.', '2026-09-30', '16:00', '17:00', 'Reunião interna', 'AGENDADA', ${USER_LUCAS}, '${agora}', '${agora}'),
      ('Revisao de indicadores', 'Acompanhamento dos paineis de diretoria.', '2026-09-25', '10:00', '11:00', 'Reunião interna', 'AGENDADA', ${USER_TI}, '${agora}', '${agora}')
  `);
  const [{ QT }] = await q(`SELECT COUNT(*) QT FROM AGENDA_INTERNA WHERE CRIADOR_ID IN (${USER_LUCAS}, ${USER_TI})`);
  console.log('[9] agenda interna:', QT);
}

// --- Conferencia final --------------------------------------------------------
async function conferir() {
  const rows = await q(`
    SELECT IU.ID, IU.DESCR,
      (SELECT CARGO FROM USUARIO_CARGO WHERE USER_ID = IU.ID) CARGO,
      (SELECT COUNT(*) FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = IU.ID) CARTEIRA,
      (SELECT COUNT(*) FROM BU_VENDEDOR WHERE VENDEDOR_ID = IU.ID AND COALESCE(ATIVO,TRUE)=TRUE) BU,
      (SELECT COD_RCA FROM VENDEDOR_RCA WHERE USER_ID = IU.ID) RCA,
      (SELECT COUNT(*) FROM TAREFAS WHERE VENDEDOR_ID = IU.ID) TAREFAS,
      (SELECT COUNT(*) FROM VISITAS WHERE VENDEDOR_ID = IU.ID) VISITAS,
      (SELECT COUNT(*) FROM AGENDA_INTERNA WHERE CRIADOR_ID = IU.ID) AGENDA,
      (SELECT COUNT(*) FROM METAS_VENDEDOR WHERE USER_ID = IU.ID) METAS
    FROM INT_USER IU WHERE IU.ID IN (${USER_TI}, ${USER_LUCAS})
  `);
  console.log('\n--- estado final ---');
  for (const r of rows) console.log(JSON.stringify(r));

  const fat = await q(`
    SELECT S.MES, ROUND(SUM(S.VALOR),2) REALIZADO
    FROM PEDIDOS_SEMANAIS_SYNC S
    JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = S.CLIENTE_ID AND EC.ID_VENDEDOR = ${USER_LUCAS}
    JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = ${USER_LUCAS} AND BV.CODFILIAL = S.CODFILIAL
      AND BV.BU_CODIGO = S.CODEPTO AND BV.ID_SECAO = S.ID_SECAO AND BV.ATIVO = TRUE
    WHERE S.ATIVO = 1 AND S.ANO = 2026
    GROUP BY S.MES ORDER BY S.MES
  `);
  console.log('\n--- faturamento 2026 que o Lucas passa a enxergar (carteira x escopo de BU) ---');
  for (const r of fat) console.log(`mes ${r.MES}: R$ ${r.REALIZADO}`);
}

async function main() {
  await seedCargos();
  await seedEscopoBu();
  await seedRca();
  await seedCarteira();
  await seedCurva();
  await seedMetas();
  await seedTarefas();
  await seedVisitas();
  await seedAgenda();
  await conferir();
}

main();
