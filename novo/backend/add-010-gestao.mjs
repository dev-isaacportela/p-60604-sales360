// Spec 010 — gestao, coordenacao e diretoria (etapa 1: sem Gestao de Carteira).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-010-gestao.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nova: so SFs `s360*` (upsert por nome). Todas SQL, porque
// usuario business nao grava de dentro de SF JavaScript (docs/arquitetura.md).
// Uma instrucao por SF; onde a spec grava duas tabelas, a tela chama em
// sequencia (D-010-1 do plan). Gravacao responde linhas afetadas; 0 = recusado.
//
// `definitions` e exportado para o simulador executar o mesmo SQL publicado.
// Nomes aqui sao o contrato com novo/frontend/src/lib/server-functions.ts.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel } from './lib/guardas.mjs';
import {
  GESTAO, DIRETORIA, nome, agora, numerico, naEquipe, realizadoCtes,
  SEM_BLOQUEIO_DERIVADO, temPapelDerivado,
} from './lib/010-gestao.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const busca = (...colunas) => `('{{busca}}' = '' OR ${colunas
  .map((c) => `UPPER(${c}) LIKE UPPER(CONCAT('%', '{{busca}}', '%'))`).join(' OR ')})`;
const PAGINA = `LIMIT {{limite}} OFFSET {{offset}}`;

/* ─────────────── Painel de Gestao (GESTOR, ADMIN) ─────────────── */

// Equipe = usuarios com RCA vinculado; vendedorId 0 = toda a equipe (RF-007).
const VENDEDORES_FILTRO = `VENDEDORES AS (
  SELECT VR.USER_ID AS VENDEDOR_ID FROM VENDEDOR_RCA VR
  WHERE ({{vendedorId}} = 0 OR VR.USER_ID = {{vendedorId}})
)`;
const MES_HOJE = `SUBSTRING('{{hoje}}', 1, 7)`;

// Cada linha atribuida conta uma vez no total (D-010-4).
const LINHAS_REALIZADO = `(SELECT M.TIPO, M.VALOR FROM MOVIMENTO M
  WHERE EXISTS (SELECT 1 FROM ATRIBUIDO A WHERE A.TIPO = M.TIPO AND A.LINHA = M.LINHA))`;
// RN-003: venda nas BUs do filtro a cliente que nao esta em carteira nenhuma.
const LINHAS_SEM_CARTEIRA = `(SELECT M.TIPO, M.VALOR, M.CLIENTE FROM MOVIMENTO M
  WHERE EXISTS (SELECT 1 FROM ESCOPOS E WHERE E.FILIAL = M.FILIAL AND E.DEPTO = M.DEPTO)
    AND NOT EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC WHERE EC.ID_CLIENTE = M.CLIENTE))`;
const soma = (tabela, tipo) => `(SELECT ROUND(COALESCE(SUM(X.VALOR), 0), 2) FROM ${tabela} X WHERE X.TIPO = '${tipo}')`;

/* ─────────────── Papeis ─────────────── */

const EDITAVEIS = `'DIRETORIA', 'COORDENADOR', 'VENDEDOR'`;
const TODOS_PAPEIS = `'VENDEDOR', 'COORDENADOR', 'DIRETORIA', 'GESTOR', 'ADMIN'`;
// Uniao da tabela nova com o legado (D-003 da 001), por usuario.
const PAPEIS_CTE = `PAPEIS AS (
  SELECT P.USER_ID, P.PAPEL FROM USUARIO_PAPEL P WHERE P.PAPEL IN (${TODOS_PAPEIS})
  UNION
  SELECT C.USER_ID, C.CARGO FROM USUARIO_CARGO C WHERE C.CARGO IN (${TODOS_PAPEIS})
),
POR_USUARIO AS (
  SELECT USER_ID, GROUP_CONCAT(PAPEL SEPARATOR ',') AS PAPEIS FROM PAPEIS GROUP BY USER_ID
)`;
const marcado = (papel, campo) => `(PAPEL = '${papel}' AND {{${campo}}} = 0)`;

/* ─────────────── Ferias e executivas ─────────────── */

// RN-001/RN-020: diretoria e ADMIN veem todos; coordenador ativo, a equipe com RCA.
const recorteFerias = (alvo) => `(${DIRETORIA} OR ${naEquipe(alvo, { comRca: true })})`;
const sobrepoe = (col, rca) => `EXISTS (SELECT 1 FROM FERIAS_VENDEDOR FX
    WHERE FX.${col} = ${rca} AND FX.ATIVO = 1
      AND FX.DT_INICIO <= '{{fim}}' AND FX.DT_FIM >= '{{inicio}}')`;

// RN-021: sem DIRETORIA/ADMIN, sem cadastro ativo de coordenador, nao e quem
// abre a tela; escopo ativo (coordenador: nas suas BUs) ou, global, RCA.
const executivaVisivel = (alvo) => `(${alvo} <> :VAR_USER
  AND NOT EXISTS (SELECT 1 FROM USUARIO_PAPEL XP WHERE XP.USER_ID = ${alvo} AND XP.PAPEL IN ('DIRETORIA', 'ADMIN'))
  AND NOT EXISTS (SELECT 1 FROM USUARIO_CARGO XC WHERE XC.USER_ID = ${alvo} AND XC.CARGO IN ('DIRETORIA', 'ADMIN'))
  AND NOT EXISTS (SELECT 1 FROM COORDENADORES XK WHERE XK.USER_ID = ${alvo} AND XK.ATIVO = 1)
  AND ((${DIRETORIA} AND (
          EXISTS (SELECT 1 FROM BU_VENDEDOR XB WHERE XB.VENDEDOR_ID = ${alvo} AND XB.ATIVO = 1)
          OR EXISTS (SELECT 1 FROM VENDEDOR_RCA XR WHERE XR.USER_ID = ${alvo})))
       OR ${naEquipe(alvo)}))`;

/* ─────────────── definicoes ─────────────── */

export const definitions = [
  // ── Painel de Gestao ──
  {
    name: 's360PainelVendedores',
    type: 'SQL',
    description: 'Vendedores com RCA vinculado (filtro do Painel de Gestao e select de comissoes). Sem parametros. GESTOR/ADMIN.',
    code: `SELECT U.ID, ${nome('U')} AS NOME, U.DESCR AS EMAIL, VR.COD_RCA
FROM VENDEDOR_RCA VR
JOIN INT_USER U ON U.ID = VR.USER_ID
WHERE ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY NOME`,
  },
  {
    name: 's360PainelResumo',
    type: 'SQL',
    description: 'Cards do Painel de Gestao no mes de hoje: bruto, devolucao, liquido atribuido (RNT-007/008), meta distribuida, clientes ativos, visitas pendentes e vendas sem carteira. Params: hoje AAAA-MM-DD, vendedorId (0 = equipe).',
    code: `WITH ${VENDEDORES_FILTRO},
${realizadoCtes(MES_HOJE)}
SELECT
  ${soma(LINHAS_REALIZADO, 'V')} AS BRUTO,
  ${soma(LINHAS_REALIZADO, 'D')} AS DEVOLUCAO,
  ROUND(${soma(LINHAS_REALIZADO, 'V')} - ${soma(LINHAS_REALIZADO, 'D')}, 2) AS LIQUIDO,
  (SELECT ROUND(COALESCE(SUM(MB.META_VALOR), 0), 2) FROM METAS_BU_VENDEDOR MB
     JOIN VENDEDORES V ON V.VENDEDOR_ID = MB.VENDEDOR_ID
     WHERE MB.ANO = CAST(SUBSTRING('{{hoje}}', 1, 4) AS UNSIGNED)
       AND MB.MES = CAST(SUBSTRING('{{hoje}}', 6, 2) AS UNSIGNED)) AS META,
  (SELECT COUNT(DISTINCT EC.ID_CLIENTE) FROM EQUIPE_CLIENTE EC
     JOIN VENDEDORES V ON V.VENDEDOR_ID = EC.ID_VENDEDOR
     JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
     WHERE C.STATUS = 'ATIVO') AS CLIENTES_ATIVOS,
  (SELECT COUNT(*) FROM VISITAS VI
     JOIN VENDEDORES V ON V.VENDEDOR_ID = VI.VENDEDOR_ID
     WHERE VI.STATUS IN ('AGENDADA', 'EM_ANDAMENTO') AND VI.DATA_AGENDADA <= '{{hoje}}') AS VISITAS_PENDENTES,
  ROUND(${soma(LINHAS_SEM_CARTEIRA, 'V')} - ${soma(LINHAS_SEM_CARTEIRA, 'D')}, 2) AS SEM_CARTEIRA_LIQUIDO,
  (SELECT COUNT(DISTINCT X.CLIENTE) FROM ${LINHAS_SEM_CARTEIRA} X WHERE X.TIPO = 'V') AS SEM_CARTEIRA_CLIENTES,
  (SELECT MAX(REPLACE(R.ATUALIZADO_EM, 'T', ' ')) FROM PEDIDOS_SEMANAIS_SYNC_RAW R) AS ATUALIZADO_EM
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // RN-007: atrasados primeiro, depois tarefa pendente, depois data e responsavel.
    name: 's360PainelFila',
    type: 'SQL',
    description: 'Fila operacional da equipe (RN-007): tarefas Pendente/Em andamento e visitas Agendada/Em andamento com a acao sugerida, ate 60. Params: hoje, vendedorId (0 = equipe).',
    code: `WITH ${VENDEDORES_FILTRO},
ITENS AS (
  SELECT 'TAREFA' AS TIPO, T.ID, T.TITULO, C.RAZAO_SOCIAL AS CLIENTE, ${nome('U')} AS RESPONSAVEL,
         T.DATA_LIMITE AS DATA, T.STATUS,
         CASE WHEN T.DATA_LIMITE < '{{hoje}}' THEN 1 ELSE 0 END AS ATRASADO,
         CASE WHEN T.DATA_LIMITE < '{{hoje}}' THEN 'Cobrar conclusão imediata'
              WHEN T.STATUS = 'EM_ANDAMENTO' THEN 'Acompanhar andamento'
              ELSE 'Priorizar na próxima rotina' END AS ACAO
  FROM TAREFAS T
  JOIN VENDEDORES V ON V.VENDEDOR_ID = T.VENDEDOR_ID
  JOIN INT_USER U ON U.ID = T.VENDEDOR_ID
  LEFT JOIN CLIENTES C ON C.ID = T.CLIENTE_ID
  WHERE T.STATUS IN ('PENDENTE', 'EM_ANDAMENTO')
  UNION ALL
  SELECT 'VISITA', VI.ID, 'Visita', C.RAZAO_SOCIAL, ${nome('U')},
         VI.DATA_AGENDADA, VI.STATUS,
         CASE WHEN VI.DATA_AGENDADA < '{{hoje}}' THEN 1 ELSE 0 END,
         CASE WHEN VI.DATA_AGENDADA < '{{hoje}}' THEN 'Reagendar ou concluir hoje'
              ELSE 'Confirmar agenda com cliente' END
  FROM VISITAS VI
  JOIN VENDEDORES V ON V.VENDEDOR_ID = VI.VENDEDOR_ID
  JOIN INT_USER U ON U.ID = VI.VENDEDOR_ID
  LEFT JOIN CLIENTES C ON C.ID = VI.CLIENTE_ID
  WHERE VI.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
)
SELECT I.* FROM ITENS I
WHERE ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY I.ATRASADO DESC,
  CASE WHEN I.TIPO = 'TAREFA' AND I.STATUS = 'PENDENTE' THEN 0 ELSE 1 END,
  I.DATA, I.RESPONSAVEL, I.ID
LIMIT 60`,
  },

  // ── Gestao Cadastros: comissoes (RN-011) ──
  {
    name: 's360ComissaoListar',
    type: 'SQL',
    description: 'Comissoes com busca pelo nome do vendedor, paginada (TOTAL em cada linha). Params: busca, limite, offset. GESTOR/ADMIN.',
    code: `SELECT CO.ID, CO.VENDEDOR_ID, ${nome('U')} AS VENDEDOR, CO.MES, CO.ANO,
  CO.VALOR_VENDAS, CO.PERC_COMISSAO, CO.VALOR_COMISSAO, COUNT(*) OVER () AS TOTAL
FROM COMISSOES CO
JOIN INT_USER U ON U.ID = CO.VENDEDOR_ID
WHERE ${busca('COALESCE(U.NOME, U.DESCR)')}
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY CO.ANO DESC, CO.MES DESC, VENDEDOR
${PAGINA}`,
  },
  {
    // Comissao calculada no servidor, nunca digitada (RN-011).
    name: 's360ComissaoCriar',
    type: 'SQL',
    description: 'Cria comissao (vendas x % / 100, 2 casas). Um registro por vendedor + mes + ano. Params: vendedorId, mes, ano, vendas, percentual. Devolve affectedRows.',
    code: `INSERT INTO COMISSOES (VENDEDOR_ID, MES, ANO, VALOR_VENDAS, PERC_COMISSAO, VALOR_COMISSAO)
SELECT VR.USER_ID, {{mes}}, {{ano}}, ROUND({{vendas}}, 2), ROUND({{percentual}}, 2),
  ROUND({{vendas}} * {{percentual}} / 100, 2)
FROM VENDEDOR_RCA VR
WHERE VR.USER_ID = {{vendedorId}}
  AND {{mes}} BETWEEN 1 AND 12 AND {{ano}} BETWEEN 2000 AND 2100
  AND {{vendas}} >= 0 AND {{percentual}} >= 0 AND {{percentual}} <= 100
  AND NOT EXISTS (SELECT 1 FROM COMISSOES X WHERE X.VENDEDOR_ID = VR.USER_ID AND X.MES = {{mes}} AND X.ANO = {{ano}})
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ComissaoAtualizar',
    type: 'SQL',
    description: 'Atualiza comissao (recalcula o valor). Params: id, vendedorId, mes, ano, vendas, percentual. Devolve affectedRows.',
    code: `UPDATE COMISSOES
SET VENDEDOR_ID = {{vendedorId}}, MES = {{mes}}, ANO = {{ano}},
    VALOR_VENDAS = ROUND({{vendas}}, 2), PERC_COMISSAO = ROUND({{percentual}}, 2),
    VALOR_COMISSAO = ROUND({{vendas}} * {{percentual}} / 100, 2)
WHERE ID = {{id}}
  AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = {{vendedorId}})
  AND {{mes}} BETWEEN 1 AND 12 AND {{ano}} BETWEEN 2000 AND 2100
  AND {{vendas}} >= 0 AND {{percentual}} >= 0 AND {{percentual}} <= 100
  AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ID, VENDEDOR_ID, MES, ANO FROM COMISSOES) X
                  WHERE X.VENDEDOR_ID = {{vendedorId}} AND X.MES = {{mes}} AND X.ANO = {{ano}} AND X.ID <> {{id}})
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ComissaoExcluir',
    type: 'SQL',
    description: 'Exclui comissao (a tela confirma antes, RN-025). Params: id. Devolve affectedRows.',
    code: `DELETE FROM COMISSOES
WHERE ID = {{id}}
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Usuarios: escopos (RN-012, RN-013) ──
  {
    // PAI: BU da secao; e-mail do usuario.
    name: 's360EstruturaListar',
    type: 'SQL',
    description: 'Opcoes dos selects de escopo e coordenador numa consulta: filiais, BUs, secoes (PAI = BU) e usuarios (PAI = e-mail). Sem parametros. GESTOR/DIRETORIA/ADMIN.',
    code: `SELECT 'FILIAL' AS TIPO, F.CODFILIAL AS CODIGO, F.NOME_FILIAL AS NOME, NULL AS PAI, F.ATIVO
FROM FILIAL F
WHERE ${temPapel('GESTOR', 'DIRETORIA', 'ADMIN')} AND ${SEM_BLOQUEIO}
UNION ALL
SELECT 'BU', B.CODIGO, B.NOME, NULL, B.ATIVO
FROM BU B
WHERE ${temPapel('GESTOR', 'DIRETORIA', 'ADMIN')} AND ${SEM_BLOQUEIO}
UNION ALL
SELECT 'SECAO', CAST(S.ID AS CHAR), S.NOME_SECAO, B.CODIGO, S.ATIVO
FROM SECAO S
JOIN BU B ON B.ID = S.ID_BU
WHERE ${temPapel('GESTOR', 'DIRETORIA', 'ADMIN')} AND ${SEM_BLOQUEIO}
UNION ALL
SELECT 'USUARIO', CAST(U.ID AS CHAR), ${nome('U')}, U.DESCR, 1
FROM INT_USER U
WHERE ${temPapel('GESTOR', 'DIRETORIA', 'ADMIN')} AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360EscopoListar',
    type: 'SQL',
    description: 'Escopos ativos com busca por nome ou e-mail, paginada (TOTAL). Params: busca, limite, offset. GESTOR/ADMIN.',
    code: `SELECT BV.ID, BV.VENDEDOR_ID, ${nome('U')} AS VENDEDOR, U.DESCR AS EMAIL,
  BV.BU_CODIGO, B.NOME AS BU, BV.CODFILIAL, F.NOME_FILIAL AS FILIAL, BV.ID_SECAO, S.NOME_SECAO AS SECAO,
  COUNT(*) OVER () AS TOTAL
FROM BU_VENDEDOR BV
JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
LEFT JOIN BU B ON TRIM(B.CODIGO) = TRIM(BV.BU_CODIGO)
LEFT JOIN FILIAL F ON F.CODFILIAL = BV.CODFILIAL
LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
WHERE BV.ATIVO = 1
  AND ${busca('COALESCE(U.NOME, U.DESCR)', 'U.DESCR')}
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY VENDEDOR, BV.BU_CODIGO, BV.CODFILIAL, BV.ID_SECAO
${PAGINA}`,
  },
  {
    // Primeiro passo de "Vincular": combinacoes inativas voltam (RN-013).
    name: 's360EscopoReativar',
    type: 'SQL',
    description: 'Reativa escopos inativos da combinacao pedida. Params: vendedorId, buCodigo, codfilial, secoes (CSV; vazio = todas), agora. BU inativa recusa. Devolve affectedRows.',
    code: `UPDATE BU_VENDEDOR
SET ATIVO = 1, ATUALIZADO_EM = ${agora}
WHERE VENDEDOR_ID = {{vendedorId}}
  AND TRIM(BU_CODIGO) = '{{buCodigo}}'
  AND TRIM(CODFILIAL) = '{{codfilial}}'
  AND ATIVO = 0
  AND (('{{secoes}}' = '' AND ID_SECAO IS NULL)
       OR ('{{secoes}}' <> '' AND CONCAT(',', '{{secoes}}', ',') LIKE CONCAT('%,', ID_SECAO, ',%')))
  AND EXISTS (SELECT 1 FROM BU B WHERE TRIM(B.CODIGO) = '{{buCodigo}}' AND B.ATIVO = 1)
  AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT VENDEDOR_ID, BU_CODIGO, CODFILIAL, ID_SECAO FROM BU_VENDEDOR WHERE ATIVO = 1) X
                  WHERE X.VENDEDOR_ID = BU_VENDEDOR.VENDEDOR_ID AND TRIM(X.BU_CODIGO) = TRIM(BU_VENDEDOR.BU_CODIGO)
                    AND TRIM(X.CODFILIAL) = TRIM(BU_VENDEDOR.CODFILIAL)
                    AND COALESCE(X.ID_SECAO, 0) = COALESCE(BU_VENDEDOR.ID_SECAO, 0))
  AND '{{agora}}' <> ''
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // Segundo passo: combinacoes que nunca existiram. Secao nula = todas; a
    // unicidade compara COALESCE porque o indice de producao nao pega nulo.
    name: 's360EscopoIncluir',
    type: 'SQL',
    description: 'Inclui escopos novos (usuario + BU ativa + filial + secoes ou todas). Params: vendedorId, buCodigo, codfilial, secoes (CSV; vazio = todas), agora. Devolve affectedRows.',
    code: `INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CRIADO_EM, ATUALIZADO_EM, CODFILIAL, ID_SECAO)
SELECT B.CODIGO, U.ID, 1, ${agora}, ${agora}, F.CODFILIAL, S.ID_SECAO
FROM INT_USER U
JOIN BU B ON TRIM(B.CODIGO) = '{{buCodigo}}' AND B.ATIVO = 1
JOIN FILIAL F ON F.CODFILIAL = '{{codfilial}}' AND F.ATIVO = 1
JOIN (
  SELECT SE.ID AS ID_SECAO, SE.ID_BU FROM SECAO SE
  WHERE '{{secoes}}' <> '' AND CONCAT(',', '{{secoes}}', ',') LIKE CONCAT('%,', SE.ID, ',%')
  UNION ALL
  SELECT NULL, NULL FROM INT_USER EU WHERE EU.ID = :VAR_USER AND '{{secoes}}' = ''
) S ON S.ID_SECAO IS NULL OR S.ID_BU = B.ID
WHERE U.ID = {{vendedorId}}
  AND NOT EXISTS (SELECT 1 FROM BU_VENDEDOR X
                  WHERE X.VENDEDOR_ID = U.ID AND TRIM(X.BU_CODIGO) = TRIM(B.CODIGO)
                    AND TRIM(X.CODFILIAL) = F.CODFILIAL AND COALESCE(X.ID_SECAO, 0) = COALESCE(S.ID_SECAO, 0))
  AND '{{agora}}' <> ''
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360EscopoDesvincular',
    type: 'SQL',
    description: 'Desvincula escopo (ATIVO = 0, nao apaga; a tela confirma antes). Params: id, agora. Devolve affectedRows.',
    code: `UPDATE BU_VENDEDOR
SET ATIVO = 0, ATUALIZADO_EM = ${agora}
WHERE ID = {{id}}
  AND ATIVO = 1
  AND '{{agora}}' <> ''
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Usuarios: vinculo RCA (RN-014) ──
  {
    name: 's360RcaTotvsListar',
    type: 'SQL',
    description: 'RCAs ativos do ERP com o supervisor sugerido e o usuario que ja tem o RCA. Sem parametros. GESTOR/ADMIN.',
    code: `SELECT R.COD_RCA, R.RCA_NOME, R.COD_SUPERVISOR, VR.USER_ID AS USUARIO_ID, ${nome('U')} AS USUARIO
FROM RCA_TOTVS R
LEFT JOIN VENDEDOR_RCA VR ON VR.COD_RCA = R.COD_RCA
LEFT JOIN INT_USER U ON U.ID = VR.USER_ID
WHERE R.ATIVO = 1
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY R.COD_RCA`,
  },
  {
    name: 's360RcaAuditoriaListar',
    type: 'SQL',
    description: 'As 80 ultimas alteracoes de vinculo RCA. Sem parametros. GESTOR/ADMIN.',
    code: `SELECT A.ID, A.ALTERADO_EM, A.USER_ID, ${nome('U')} AS USUARIO,
  A.COD_RCA_ANTERIOR, A.COD_RCA_NOVO, A.COD_SUPERVISOR_ANTERIOR, A.COD_SUPERVISOR_NOVO,
  ${nome('P')} AS ALTERADO_POR, A.OBSERVACAO
FROM VENDEDOR_RCA_AUDITORIA A
LEFT JOIN INT_USER U ON U.ID = A.USER_ID
LEFT JOIN INT_USER P ON P.ID = A.ALTERADO_POR
WHERE ${GESTAO}
  AND ${SEM_BLOQUEIO}
ORDER BY A.ID DESC
LIMIT 80`,
  },
  {
    // Passo 1 de vincular/remover (D-010-1): a auditoria le os valores
    // anteriores do servidor e so nasce para uma mudanca valida (C-014).
    name: 's360RcaAuditar',
    type: 'SQL',
    description: 'Registra a auditoria de uma mudanca de vinculo RCA com os valores atuais do servidor. Params: userId, codRca (0 = remover), codSupervisor (0 = sem), observacao (<=300), agora. 0 = mudanca invalida.',
    code: `INSERT INTO VENDEDOR_RCA_AUDITORIA (USER_ID, COD_RCA_ANTERIOR, COD_RCA_NOVO, COD_SUPERVISOR_ANTERIOR,
  COD_SUPERVISOR_NOVO, ALTERADO_POR, ALTERADO_EM, OBSERVACAO)
SELECT U.ID, VR.COD_RCA, NULLIF({{codRca}}, 0), VR.COD_SUPERVISOR,
  CASE WHEN {{codRca}} = 0 THEN NULL ELSE NULLIF({{codSupervisor}}, 0) END,
  :VAR_USER, ${agora}, NULLIF(TRIM('{{observacao}}'), '')
FROM INT_USER U
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = U.ID
WHERE U.ID = {{userId}}
  AND '{{agora}}' <> ''
  AND CHAR_LENGTH(TRIM('{{observacao}}')) <= 300
  AND (({{codRca}} = 0 AND VR.USER_ID IS NOT NULL)
    OR ({{codRca}} > 0
      AND EXISTS (SELECT 1 FROM RCA_TOTVS R WHERE R.COD_RCA = {{codRca}})
      AND ({{codSupervisor}} = 0 OR EXISTS (SELECT 1 FROM RCA_TOTVS RS WHERE RS.COD_RCA = {{codSupervisor}}))
      AND NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA O WHERE O.COD_RCA = {{codRca}} AND O.USER_ID <> U.ID)
      AND (VR.USER_ID IS NULL OR VR.COD_RCA <> {{codRca}} OR COALESCE(VR.COD_SUPERVISOR, 0) <> {{codSupervisor}})))
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // Passo 2: so grava o que a auditoria do mesmo autor e do mesmo `agora`
    // anunciou. ponytail: se a tela cair entre os dois passos, fica a linha de
    // auditoria sem gravacao; salvar de novo completa (Riscos do plan).
    name: 's360RcaVincular',
    type: 'SQL',
    description: 'Vincula ou troca o RCA do usuario, exigindo a auditoria desta mudanca (s360RcaAuditar com o mesmo agora). Params: userId, codRca, codSupervisor (0 = sem), agora. Devolve affectedRows.',
    code: `REPLACE INTO VENDEDOR_RCA (USER_ID, COD_RCA, COD_SUPERVISOR)
SELECT A.USER_ID, A.COD_RCA_NOVO, A.COD_SUPERVISOR_NOVO
FROM VENDEDOR_RCA_AUDITORIA A
WHERE A.ID = (SELECT MAX(A2.ID) FROM VENDEDOR_RCA_AUDITORIA A2
              WHERE A2.USER_ID = {{userId}} AND A2.ALTERADO_POR = :VAR_USER AND A2.ALTERADO_EM = ${agora})
  AND A.COD_RCA_NOVO = {{codRca}}
  AND COALESCE(A.COD_SUPERVISOR_NOVO, 0) = {{codSupervisor}}
  AND NOT EXISTS (SELECT 1 FROM VENDEDOR_RCA O WHERE O.COD_RCA = A.COD_RCA_NOVO AND O.USER_ID <> A.USER_ID)
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360RcaRemover',
    type: 'SQL',
    description: 'Remove o vinculo RCA do usuario, exigindo a auditoria da remocao (s360RcaAuditar com codRca 0 e o mesmo agora). Params: userId, agora. Devolve affectedRows.',
    code: `DELETE FROM VENDEDOR_RCA
WHERE USER_ID = {{userId}}
  AND EXISTS (SELECT 1 FROM VENDEDOR_RCA_AUDITORIA A
              WHERE A.USER_ID = {{userId}} AND A.ALTERADO_POR = :VAR_USER
                AND A.ALTERADO_EM = ${agora} AND A.COD_RCA_NOVO IS NULL)
  AND ${GESTAO}
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Gestao Coordenadores (RN-015) ──
  {
    name: 's360CoordenadorListar',
    type: 'SQL',
    description: 'Coordenadores com usuario, status e BUs (filial:departamento separados por virgula). Sem parametros. DIRETORIA/ADMIN.',
    code: `SELECT C.AUTO_ID, C.COD_SUPERVISOR, C.NOME, C.EMAIL, C.USER_ID, ${nome('U')} AS USUARIO, C.ATIVO,
  (SELECT GROUP_CONCAT(CONCAT(CB.CODFILIAL, ':', CB.CODEPTO) SEPARATOR ',')
   FROM COORDENADORES_BU CB WHERE CB.COD_SUPERVISOR = C.COD_SUPERVISOR) AS BUS
FROM COORDENADORES C
LEFT JOIN INT_USER U ON U.ID = C.USER_ID
WHERE ${DIRETORIA}
  AND ${SEM_BLOQUEIO}
ORDER BY C.NOME`,
  },
  {
    name: 's360CoordenadorCriar',
    type: 'SQL',
    description: 'Cria coordenador. Codigo de supervisor numerico e unico, nome obrigatorio, ativo exige usuario sem outro cadastro ativo. Params: codSupervisor, nome, email, userId (0 = sem), ativo (0/1). Devolve affectedRows.',
    code: `INSERT INTO COORDENADORES (COD_SUPERVISOR, NOME, EMAIL, USER_ID, ATIVO)
SELECT CAST('{{codSupervisor}}' AS UNSIGNED), TRIM('{{nome}}'), NULLIF(TRIM('{{email}}'), ''), NULLIF({{userId}}, 0), {{ativo}}
FROM INT_USER EU
WHERE EU.ID = :VAR_USER
  AND ${numerico(`'{{codSupervisor}}'`)}
  AND CHAR_LENGTH(TRIM('{{nome}}')) BETWEEN 1 AND 100
  AND CHAR_LENGTH(TRIM('{{email}}')) <= 150
  AND {{ativo}} IN (0, 1)
  AND ({{userId}} = 0 OR EXISTS (SELECT 1 FROM INT_USER CU WHERE CU.ID = {{userId}}))
  AND ({{ativo}} = 0 OR {{userId}} > 0)
  AND ({{ativo}} = 0 OR NOT EXISTS (SELECT 1 FROM COORDENADORES O WHERE O.USER_ID = {{userId}} AND O.ATIVO = 1))
  AND NOT EXISTS (SELECT 1 FROM COORDENADORES X WHERE CAST(X.COD_SUPERVISOR AS CHAR) = '{{codSupervisor}}')
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360CoordenadorAtualizar',
    type: 'SQL',
    description: 'Atualiza coordenador pelo codigo de supervisor (mesmas regras do criar). Params: codSupervisor, nome, email, userId, ativo. Devolve affectedRows.',
    code: `UPDATE COORDENADORES
SET NOME = TRIM('{{nome}}'), EMAIL = NULLIF(TRIM('{{email}}'), ''), USER_ID = NULLIF({{userId}}, 0), ATIVO = {{ativo}}
WHERE CAST(COD_SUPERVISOR AS CHAR) = '{{codSupervisor}}'
  AND CHAR_LENGTH(TRIM('{{nome}}')) BETWEEN 1 AND 100
  AND CHAR_LENGTH(TRIM('{{email}}')) <= 150
  AND {{ativo}} IN (0, 1)
  AND ({{userId}} = 0 OR EXISTS (SELECT 1 FROM INT_USER CU WHERE CU.ID = {{userId}}))
  AND ({{ativo}} = 0 OR {{userId}} > 0)
  AND ({{ativo}} = 0 OR NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT USER_ID, COD_SUPERVISOR FROM COORDENADORES WHERE ATIVO = 1) O
                                    WHERE O.USER_ID = {{userId}} AND CAST(O.COD_SUPERVISOR AS CHAR) <> '{{codSupervisor}}'))
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360CoordenadorBuIncluir',
    type: 'SQL',
    description: 'Inclui as BUs pedidas que o coordenador ainda nao tem (so BU e filial ativas). Params: codSupervisor, bus ("filial:departamento" separados por virgula). Devolve affectedRows.',
    code: `INSERT INTO COORDENADORES_BU (COD_SUPERVISOR, CODFILIAL, CODEPTO)
SELECT C.COD_SUPERVISOR, CAST(F.CODFILIAL AS UNSIGNED), CAST(B.CODIGO AS UNSIGNED)
FROM COORDENADORES C
JOIN FILIAL F ON F.ATIVO = 1
JOIN BU B ON B.ATIVO = 1
WHERE CAST(C.COD_SUPERVISOR AS CHAR) = '{{codSupervisor}}'
  AND CONCAT(',', '{{bus}}', ',') LIKE CONCAT('%,', TRIM(F.CODFILIAL), ':', TRIM(B.CODIGO), ',%')
  AND NOT EXISTS (SELECT 1 FROM COORDENADORES_BU X
                  WHERE X.COD_SUPERVISOR = C.COD_SUPERVISOR
                    AND X.CODFILIAL = CAST(F.CODFILIAL AS UNSIGNED) AND X.CODEPTO = CAST(B.CODIGO AS UNSIGNED))
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360CoordenadorBuRemover',
    type: 'SQL',
    description: 'Remove as BUs do coordenador que NAO estao na lista (a tela confirma antes, RN-025). Params: codSupervisor, bus. Devolve affectedRows.',
    code: `DELETE FROM COORDENADORES_BU
WHERE CAST(COD_SUPERVISOR AS CHAR) = '{{codSupervisor}}'
  AND CONCAT(',', '{{bus}}', ',') NOT LIKE CONCAT('%,', CODFILIAL, ':', CODEPTO, ',%')
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360CoordenadorStatusDefinir',
    type: 'SQL',
    description: 'Inativa (0) ou ativa (1) coordenador; ativar exige usuario sem outro cadastro ativo. Params: codSupervisor, ativo. Devolve affectedRows.',
    code: `UPDATE COORDENADORES
SET ATIVO = {{ativo}}
WHERE CAST(COD_SUPERVISOR AS CHAR) = '{{codSupervisor}}'
  AND {{ativo}} IN (0, 1)
  AND ({{ativo}} = 0 OR (USER_ID IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT USER_ID, COD_SUPERVISOR FROM COORDENADORES WHERE ATIVO = 1) O
                       WHERE O.USER_ID = COORDENADORES.USER_ID AND O.COD_SUPERVISOR <> COORDENADORES.COD_SUPERVISOR)))
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Usuarios: papeis e lista (RN-016, D-010-2) ──
  {
    name: 's360PapelResumo',
    type: 'SQL',
    description: 'Cards da tela de papeis: Diretoria, Coordenadores, Vendedores (inclui sem papel) e Outros (GESTOR/ADMIN). Sem parametros. DIRETORIA/ADMIN.',
    code: `WITH ${PAPEIS_CTE}
SELECT
  (SELECT COUNT(DISTINCT P.USER_ID) FROM PAPEIS P WHERE P.PAPEL = 'DIRETORIA') AS DIRETORIA,
  (SELECT COUNT(DISTINCT P.USER_ID) FROM PAPEIS P WHERE P.PAPEL = 'COORDENADOR') AS COORDENADORES,
  (SELECT COUNT(*) FROM INT_USER U2
   WHERE EXISTS (SELECT 1 FROM PAPEIS P WHERE P.USER_ID = U2.ID AND P.PAPEL = 'VENDEDOR')
      OR NOT EXISTS (SELECT 1 FROM PAPEIS P WHERE P.USER_ID = U2.ID)) AS VENDEDORES,
  (SELECT COUNT(DISTINCT P.USER_ID) FROM PAPEIS P WHERE P.PAPEL IN ('GESTOR', 'ADMIN')) AS OUTROS
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360PapelListar',
    type: 'SQL',
    description: 'Lista da tela Usuarios: papeis (uniao nova + legado; vazio = VENDEDOR), RCA e supervisor; busca por nome, e-mail, ID ou RCA e filtro de papel, paginada (TOTAL). Params: busca, papel (vazio = todos), limite, offset. GESTOR/DIRETORIA/ADMIN.',
    code: `WITH ${PAPEIS_CTE}
SELECT U.ID AS USER_ID, ${nome('U')} AS NOME, U.DESCR AS EMAIL, VR.COD_RCA, VR.COD_SUPERVISOR,
  COALESCE(PU.PAPEIS, 'VENDEDOR') AS PAPEIS, COUNT(*) OVER () AS TOTAL
FROM INT_USER U
LEFT JOIN POR_USUARIO PU ON PU.USER_ID = U.ID
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = U.ID
WHERE (${busca('COALESCE(U.NOME, U.DESCR)', 'U.DESCR')}
       OR CAST(U.ID AS CHAR) = '{{busca}}' OR CAST(VR.COD_RCA AS CHAR) = '{{busca}}')
  AND ('{{papel}}' = ''
       OR CONCAT(',', COALESCE(PU.PAPEIS, 'VENDEDOR'), ',') LIKE CONCAT('%,', '{{papel}}', ',%'))
  AND (${GESTAO} OR ${DIRETORIA})
  AND ${SEM_BLOQUEIO}
ORDER BY NOME
${PAGINA}`,
  },
  {
    name: 's360PapelIncluir',
    type: 'SQL',
    description: 'Inclui em USUARIO_PAPEL os papeis marcados que faltam. GESTOR/ADMIN nao sao parametro (RN-016). Params: userId, diretoria, coordenador, vendedor (0/1), agora. Devolve affectedRows.',
    code: `INSERT INTO USUARIO_PAPEL (USER_ID, PAPEL, ATRIBUIDO_POR, ATRIBUIDO_EM)
SELECT U.ID, X.PAPEL, :VAR_USER, ${agora}
FROM INT_USER U
JOIN (SELECT 'DIRETORIA' AS PAPEL, {{diretoria}} AS MARCADO
      UNION ALL SELECT 'COORDENADOR', {{coordenador}}
      UNION ALL SELECT 'VENDEDOR', {{vendedor}}) X ON X.MARCADO = 1
WHERE U.ID = {{userId}}
  AND '{{agora}}' <> ''
  AND NOT EXISTS (SELECT 1 FROM USUARIO_PAPEL P WHERE P.USER_ID = U.ID AND P.PAPEL = X.PAPEL)
  AND ${DIRETORIA}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360PapelRemover',
    type: 'SQL',
    description: 'Remove de USUARIO_PAPEL os papeis editaveis desmarcados. Params: userId, diretoria, coordenador, vendedor (0/1). Devolve affectedRows.',
    code: `DELETE FROM USUARIO_PAPEL
WHERE USER_ID = {{userId}}
  AND (${marcado('DIRETORIA', 'diretoria')} OR ${marcado('COORDENADOR', 'coordenador')} OR ${marcado('VENDEDOR', 'vendedor')})
  AND ${temPapelDerivado('DIRETORIA', 'ADMIN')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // D-010-2: o legado guarda um papel; quando e editavel, vira o maior que
    // ficou na tabela nova. GESTOR/ADMIN no legado nunca mudam.
    name: 's360PapelLegadoSincronizar',
    type: 'SQL',
    description: 'Ajusta USUARIO_CARGO (quando DIRETORIA/COORDENADOR/VENDEDOR) ao maior papel editavel em USUARIO_PAPEL; nenhum = VENDEDOR. Params: userId, agora. Devolve affectedRows.',
    code: `UPDATE USUARIO_CARGO
SET CARGO = COALESCE((SELECT P.PAPEL FROM USUARIO_PAPEL P
                      WHERE P.USER_ID = {{userId}} AND P.PAPEL IN (${EDITAVEIS})
                      ORDER BY FIELD(P.PAPEL, ${EDITAVEIS}) LIMIT 1), 'VENDEDOR'),
    ATUALIZADO_EM = ${agora}
WHERE USER_ID = {{userId}}
  AND CARGO IN (${EDITAVEIS})
  AND '{{agora}}' <> ''
  AND ${temPapelDerivado('DIRETORIA', 'ADMIN')}
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Ferias de Vendedores (RNT-010, RN-020) ──
  {
    name: 's360FeriasPessoas',
    type: 'SQL',
    description: 'Titulares e substitutos possiveis: coordenador ativo = equipe com RCA; DIRETORIA/ADMIN = todos com RCA. Sem parametros.',
    code: `SELECT U.ID AS USER_ID, ${nome('U')} AS NOME, VR.COD_RCA
FROM VENDEDOR_RCA VR
JOIN INT_USER U ON U.ID = VR.USER_ID
WHERE ${recorteFerias('U.ID')}
  AND ${SEM_BLOQUEIO}
ORDER BY NOME`,
  },
  {
    name: 's360FeriasListar',
    type: 'SQL',
    description: 'Ferias ativas e futuras do recorte de quem chama. Params: hoje AAAA-MM-DD.',
    code: `SELECT F.AUTO_ID AS ID, UT.ID AS TITULAR_ID, ${nome('UT')} AS TITULAR,
  US.ID AS SUBSTITUTO_ID, COALESCE(${nome('US')}, F.RCA_SUBSTITUTO) AS SUBSTITUTO,
  F.COD_RCA, F.COD_RCA_SUBSTITUTO,
  DATE_FORMAT(F.DT_INICIO, '%Y-%m-%d') AS DT_INICIO, DATE_FORMAT(F.DT_FIM, '%Y-%m-%d') AS DT_FIM,
  CASE WHEN F.DT_INICIO <= '{{hoje}}' THEN 'ATIVA' ELSE 'FUTURA' END AS ESTADO
FROM FERIAS_VENDEDOR F
JOIN VENDEDOR_RCA VT ON VT.COD_RCA = F.COD_RCA
JOIN INT_USER UT ON UT.ID = VT.USER_ID
LEFT JOIN VENDEDOR_RCA VS ON VS.COD_RCA = F.COD_RCA_SUBSTITUTO
LEFT JOIN INT_USER US ON US.ID = VS.USER_ID
WHERE F.ATIVO = 1
  AND F.DT_FIM >= '{{hoje}}'
  AND ${recorteFerias('UT.ID')}
  AND ${SEM_BLOQUEIO}
ORDER BY F.DT_INICIO, TITULAR`,
  },
  {
    name: 's360FeriasCadastrar',
    type: 'SQL',
    description: 'Cadastra ferias. Recusa: titular = substituto, sem RCA, fora do recorte, inicio > fim, sobreposicao do titular, titular substituindo no periodo, substituto de ferias no periodo. Params: titularId, substitutoId, inicio, fim (AAAA-MM-DD). Devolve affectedRows.',
    code: `INSERT INTO FERIAS_VENDEDOR (COD_RCA, RCA, DT_INICIO, DT_FIM, COD_RCA_SUBSTITUTO, RCA_SUBSTITUTO, ATIVO)
SELECT VT.COD_RCA, UPPER(${nome('UT')}), '{{inicio}}', '{{fim}}', VS.COD_RCA, UPPER(${nome('US')}), 1
FROM VENDEDOR_RCA VT
JOIN INT_USER UT ON UT.ID = VT.USER_ID
JOIN VENDEDOR_RCA VS ON VS.USER_ID = {{substitutoId}}
JOIN INT_USER US ON US.ID = VS.USER_ID
WHERE VT.USER_ID = {{titularId}}
  AND VT.USER_ID <> VS.USER_ID
  AND CHAR_LENGTH('{{inicio}}') = 10 AND CHAR_LENGTH('{{fim}}') = 10
  AND '{{inicio}}' <= '{{fim}}'
  AND NOT ${sobrepoe('COD_RCA', 'VT.COD_RCA')}
  AND NOT ${sobrepoe('COD_RCA_SUBSTITUTO', 'VT.COD_RCA')}
  AND NOT ${sobrepoe('COD_RCA', 'VS.COD_RCA')}
  AND ${recorteFerias('VT.USER_ID')}
  AND ${recorteFerias('VS.USER_ID')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // RN-020: ATIVA termina hoje; FUTURA e cancelada sem fim antes do inicio.
    name: 's360FeriasEncerrar',
    type: 'SQL',
    description: 'Encerra ferias: ativa -> DT_FIM = hoje; futura -> cancelada (ATIVO = 0). A tela confirma antes. Params: id, hoje. Devolve affectedRows.',
    code: `UPDATE FERIAS_VENDEDOR
SET ATIVO = CASE WHEN DT_INICIO > '{{hoje}}' THEN 0 ELSE 1 END,
    DT_FIM = CASE WHEN DT_INICIO > '{{hoje}}' THEN DT_FIM ELSE '{{hoje}}' END
WHERE AUTO_ID = {{id}}
  AND ATIVO = 1
  AND DT_FIM >= '{{hoje}}'
  AND CHAR_LENGTH('{{hoje}}') = 10
  AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VT
              WHERE VT.COD_RCA = FERIAS_VENDEDOR.COD_RCA AND ${recorteFerias('VT.USER_ID')})
  AND ${SEM_BLOQUEIO}`,
  },

  // ── Executivas de Venda (RN-021, RN-022) ──
  {
    name: 's360ExecutivaListar',
    type: 'SQL',
    description: 'Executivas visiveis (RN-021), desativadas primeiro, busca por nome ou e-mail, filtro TODAS|COM_ACESSO|DESATIVADAS, paginada (TOTAL). Params: busca, filtro, limite, offset.',
    code: `SELECT U.ID AS USER_ID, ${nome('U')} AS NOME, U.DESCR AS EMAIL,
  COALESCE(B.BLOQUEADO, 0) AS BLOQUEADO, B.MOTIVO, ${nome('P')} AS ATUALIZADO_POR, B.ATUALIZADO_EM,
  COUNT(*) OVER () AS TOTAL
FROM INT_USER U
LEFT JOIN USUARIO_BLOQUEIO B ON B.USER_ID = U.ID
LEFT JOIN INT_USER P ON P.ID = B.ATUALIZADO_POR
WHERE ${executivaVisivel('U.ID')}
  AND ${busca('COALESCE(U.NOME, U.DESCR)', 'U.DESCR')}
  AND ('{{filtro}}' IN ('', 'TODAS')
       OR ('{{filtro}}' = 'COM_ACESSO' AND COALESCE(B.BLOQUEADO, 0) = 0)
       OR ('{{filtro}}' = 'DESATIVADAS' AND B.BLOQUEADO = 1))
  AND ${SEM_BLOQUEIO}
ORDER BY COALESCE(B.BLOQUEADO, 0) DESC, NOME
${PAGINA}`,
  },
  {
    name: 's360ExecutivaAcessoGarantir',
    type: 'SQL',
    description: 'Cria a linha de bloqueio (BLOQUEADO = 0) da executiva se nao existir, so para executiva visivel a quem chama. Params: userId.',
    code: `INSERT INTO USUARIO_BLOQUEIO (USER_ID, BLOQUEADO)
SELECT U.ID, 0
FROM INT_USER U
WHERE U.ID = {{userId}}
  AND NOT EXISTS (SELECT 1 FROM USUARIO_BLOQUEIO X WHERE X.USER_ID = U.ID)
  AND ${executivaVisivel('U.ID')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // A recusa no login e em toda acao e o SEM_BLOQUEIO de cada SF + o
    // BLOQUEADO de s360SessaoObter (spec 001, RN-016).
    name: 's360ExecutivaAcessoAlterar',
    type: 'SQL',
    description: 'Desativa (1) ou reativa (0) o acesso da executiva, com motivo opcional ate 500 caracteres, quem e quando. Params: userId, bloqueado, motivo, agora. Devolve affectedRows.',
    code: `UPDATE USUARIO_BLOQUEIO
SET BLOQUEADO = {{bloqueado}}, MOTIVO = NULLIF(TRIM('{{motivo}}'), ''),
    ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = ${agora}
WHERE USER_ID = {{userId}}
  AND {{bloqueado}} IN (0, 1)
  AND CHAR_LENGTH(TRIM('{{motivo}}')) <= 500
  AND '{{agora}}' <> ''
  AND ${executivaVisivel('USUARIO_BLOQUEIO.USER_ID')}
  AND ${SEM_BLOQUEIO_DERIVADO}`,
  },
];

/* ─────────────── publicacao ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function functionId(item) {
  return item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;
}

async function upsert() {
  const lista = await listServerFunctionsMitra({ projectId });
  const porNome = new Map((lista?.result ?? []).map((fn) => [fn.name, fn]));
  for (const definition of definitions) {
    const existente = porNome.get(definition.name);
    if (existente) {
      const id = functionId(existente);
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: definition.code, description: definition.description });
      console.log(`  atualizada  ${definition.name} (${id})`);
      continue;
    }
    const criada = await createServerFunctionMitra({
      projectId, name: definition.name, type: definition.type, code: definition.code, description: definition.description,
    });
    console.log(`  criada      ${definition.name} (${functionId(criada)})`);
  }
}

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 010)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
