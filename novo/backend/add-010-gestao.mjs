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
  cod, num, nomeCliente, nomeUsuario, semAcento, ramoDe, naoPessoaFisica, escopoAlvo, responsavelNoEscopo,
} from './lib/002-carteira.mjs';
import {
  GESTAO, DIRETORIA, nome, agora, numerico, naEquipe,
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
// abre a tela; escopo ativo (coordenador: nas suas BUs) ou, global (GESTOR,
// DIRETORIA, ADMIN), RCA.
const executivaVisivel = (alvo) => `(${alvo} <> :VAR_USER
  AND NOT EXISTS (SELECT 1 FROM USUARIO_PAPEL XP WHERE XP.USER_ID = ${alvo} AND XP.PAPEL IN ('DIRETORIA', 'ADMIN'))
  AND NOT EXISTS (SELECT 1 FROM USUARIO_CARGO XC WHERE XC.USER_ID = ${alvo} AND XC.CARGO IN ('DIRETORIA', 'ADMIN'))
  AND NOT EXISTS (SELECT 1 FROM COORDENADORES XK WHERE XK.USER_ID = ${alvo} AND XK.ATIVO = 1)
  AND (((${GESTAO} OR ${DIRETORIA}) AND (
          EXISTS (SELECT 1 FROM BU_VENDEDOR XB WHERE XB.VENDEDOR_ID = ${alvo} AND XB.ATIVO = 1)
          OR EXISTS (SELECT 1 FROM VENDEDOR_RCA XR WHERE XR.USER_ID = ${alvo})))
       OR ${naEquipe(alvo)}))`;

/* ─────────────── Gestao de Carteira (coordenador ativo; etapa 2) ─────────────── */

// Recorte da 002 (RNT-004 → RN-017): TEAM = toda a equipe do coordenador
// ativo; SELLER = um vendedor dela. `vendedor` e expressao SQL; '' ou 0 = TEAM.
const EQUIPE = (vendedor = "''") => ({
  modo: `(CASE WHEN COALESCE(NULLIF(TRIM(CAST(${vendedor} AS CHAR)), ''), '0') = '0' THEN 'TEAM' ELSE 'SELLER' END)`,
  coordenador: "''", vendedor, filial: "''", depto: "''", secao: "''", hoje: "'{{hoje}}'",
});

// Vinculos (EQUIPE_CLIENTE) da equipe, um por vinculo e departamento do escopo
// do dono que os cobre (D-010-9): mesma filial, e secao igual, escopo sem
// secao do departamento da secao, ou vinculo sem secao. DISTINCT materializa a
// derivada (MySQL 1093 nos UPDATE sobre EQUIPE_CLIENTE).
const vinculos = (vendedor) => `SELECT DISTINCT EC_G.ID AS VINCULO_ID, EC_G.ID_CLIENTE, EC_G.ID_VENDEDOR AS VENDEDOR_ID,
    TRIM(CAST(EC_G.CODFILIAL AS CHAR)) AS CODFILIAL, A_G.CODEPTO, EC_G.ID_SECAO
  FROM EQUIPE_CLIENTE EC_G
  JOIN (${escopoAlvo(EQUIPE(vendedor))}) A_G ON A_G.VENDEDOR_ID = EC_G.ID_VENDEDOR
    AND ${cod('A_G.CODFILIAL')} = ${cod('EC_G.CODFILIAL')}
    AND (EC_G.ID_SECAO IS NULL OR A_G.ID_SECAO = EC_G.ID_SECAO
      OR (A_G.ID_SECAO IS NULL AND EC_G.ID_SECAO IN (
        SELECT S_G.ID FROM SECAO S_G JOIN BU B_G ON B_G.ID = S_G.ID_BU WHERE ${cod('B_G.CODIGO')} = ${cod('A_G.CODEPTO')})))
  WHERE ${naoPessoaFisica('EC_G.ID_CLIENTE')}`;

// RN-018: `destino` tem escopo ativo na equipe na filial + departamento do
// vinculo `v` (+ secao, quando o escopo do destino define secao).
const destinoAtua = (destino, filial, depto, secao) => `EXISTS (
      SELECT 1 FROM (${escopoAlvo(EQUIPE())}) D_G
      WHERE D_G.VENDEDOR_ID = ${destino}
        AND ${cod('D_G.CODFILIAL')} = ${cod(filial)}
        AND ${cod('D_G.CODEPTO')} = ${cod(depto)}
        AND (D_G.ID_SECAO IS NULL OR D_G.ID_SECAO = ${secao}))`;

// RN-018: o destino ja tem o cliente na mesma filial e secao (nao duplica).
const destinoJaTem = (destino, cliente, filial, secao) => `EXISTS (
      SELECT 1 FROM (SELECT DISTINCT X_G.ID_CLIENTE, X_G.ID_VENDEDOR, X_G.CODFILIAL, X_G.ID_SECAO FROM EQUIPE_CLIENTE X_G) J_G
      WHERE J_G.ID_CLIENTE = ${cliente} AND J_G.ID_VENDEDOR = ${destino}
        AND ${cod('J_G.CODFILIAL')} = ${cod(filial)}
        AND COALESCE(J_G.ID_SECAO, 0) = COALESCE(${secao}, 0))`;

// "Filial 1 · Brasilia · Nutricao" para a mensagem da RN-018.
const nomeEscopo = (filial, depto) => `CONCAT(COALESCE((SELECT MAX(F_N.NOME_FILIAL) FROM FILIAL F_N WHERE ${cod('F_N.CODFILIAL')} = ${cod(filial)}), CONCAT('Filial ', ${filial})),
    ' · ', COALESCE((SELECT MAX(B_N.NOME) FROM BU B_N WHERE ${cod('B_N.CODIGO')} = ${cod(depto)}), ${depto}))`;

// Busca de cliente (RNT-014): codigo exato, CNPJ por trecho, nome sem acento.
const buscaCliente = (c) => `('{{busca}}' = '' OR CAST(${c}.ID AS CHAR) = TRIM('{{busca}}')
       OR (TRIM('{{busca}}') <> '' AND COALESCE(${c}.CNPJ, '') LIKE CONCAT('%', TRIM('{{busca}}'), '%'))
       OR ${semAcento(nomeCliente(c))} LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%'))`;

// Escopo escolhido de um vendedor da equipe (C-020): sem secao = escopo sem secao.
const escopoEscolhido = (a) => `${cod(`${a}.CODFILIAL`)} = ${cod("'{{codFilial}}'")}
    AND ${cod(`${a}.CODEPTO`)} = ${cod("'{{codepto}}'")}
    AND ((${num('idSecao')} IS NULL AND ${a}.ID_SECAO IS NULL) OR ${a}.ID_SECAO = ${num('idSecao')})
    AND ${a}.VENDEDOR_ID = ${cod("'{{vendedorId}}'")}`;

/* ─────────────── definicoes ─────────────── */

export const definitions = [
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
    description: 'Lista da tela Usuarios: papeis (uniao nova + legado; vazio = VENDEDOR), RCA, supervisor e acesso; busca por nome, e-mail, ID ou RCA, filtro de papel e de acesso (TODAS|COM_ACESSO|DESATIVADAS), desativadas primeiro, paginada (TOTAL). Params: busca, papel (vazio = todos), filtro, limite, offset. GESTOR/DIRETORIA/ADMIN: todos; coordenador ativo: a equipe.',
    code: `WITH ${PAPEIS_CTE}
SELECT U.ID AS USER_ID, ${nome('U')} AS NOME, U.DESCR AS EMAIL, VR.COD_RCA, VR.COD_SUPERVISOR,
  COALESCE(PU.PAPEIS, 'VENDEDOR') AS PAPEIS, COALESCE(UB.BLOQUEADO, 0) AS BLOQUEADO, COUNT(*) OVER () AS TOTAL
FROM INT_USER U
LEFT JOIN POR_USUARIO PU ON PU.USER_ID = U.ID
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = U.ID
LEFT JOIN USUARIO_BLOQUEIO UB ON UB.USER_ID = U.ID
WHERE (${busca('COALESCE(U.NOME, U.DESCR)', 'U.DESCR')}
       OR CAST(U.ID AS CHAR) = '{{busca}}' OR CAST(VR.COD_RCA AS CHAR) = '{{busca}}')
  AND ('{{papel}}' = ''
       OR CONCAT(',', COALESCE(PU.PAPEIS, 'VENDEDOR'), ',') LIKE CONCAT('%,', '{{papel}}', ',%'))
  AND ('{{filtro}}' IN ('', 'TODAS')
       OR ('{{filtro}}' = 'COM_ACESSO' AND COALESCE(UB.BLOQUEADO, 0) = 0)
       OR ('{{filtro}}' = 'DESATIVADAS' AND UB.BLOQUEADO = 1))
  AND (${GESTAO} OR ${DIRETORIA} OR ${naEquipe('U.ID')})
  AND ${SEM_BLOQUEIO}
ORDER BY COALESCE(UB.BLOQUEADO, 0) DESC, NOME
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

  // ── Usuarios: acesso das executivas (RN-021, RN-022) ──
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

  // ── Gestao de Carteira (RN-017 a RN-019; coordenador ativo) ──
  {
    name: 's360GestaoCarteiraVendedores',
    type: 'SQL',
    description: 'Equipe do coordenador ativo com os escopos dentro das BUs dele, uma linha por escopo (RF-028, C-020). Params: hoje.',
    code: `SELECT A.VENDEDOR_ID, ${nomeUsuario('U')} AS NOME, VR.COD_RCA, A.CODFILIAL, F.NOME_FILIAL AS FILIAL,
  A.CODEPTO, B.NOME AS BU, A.ID_SECAO, S.NOME_SECAO AS SECAO
FROM (${escopoAlvo(EQUIPE())}) A
JOIN INT_USER U ON U.ID = A.VENDEDOR_ID
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = A.VENDEDOR_ID
LEFT JOIN FILIAL F ON ${cod('F.CODFILIAL')} = ${cod('A.CODFILIAL')}
LEFT JOIN BU B ON ${cod('B.CODIGO')} = ${cod('A.CODEPTO')}
LEFT JOIN SECAO S ON S.ID = A.ID_SECAO
ORDER BY NOME, A.CODFILIAL, A.CODEPTO, A.ID_SECAO`,
  },
  {
    name: 's360GestaoCarteiraListar',
    type: 'SQL',
    description: 'Carteira da equipe, um vinculo por linha (RF-028, RN-017, D-010-9), busca por codigo, CNPJ ou nome, filtro de vendedor e ramo, paginada (TOTAL). Params: vendedorId (0 = equipe), ramo, busca, limite, offset, hoje.',
    code: `SELECT V.VINCULO_ID, V.ID_CLIENTE, ${nomeCliente('C')} AS CLIENTE, V.VENDEDOR_ID, ${nomeUsuario('U')} AS VENDEDOR, VR.COD_RCA,
  ${ramoDe('V.ID_CLIENTE')} AS RAMO, C.CIDADE, C.UF, C.STATUS,
  V.CODFILIAL, F.NOME_FILIAL AS FILIAL, V.CODEPTO, B.NOME AS BU, V.ID_SECAO, S.NOME_SECAO AS SECAO,
  COUNT(*) OVER () AS TOTAL
FROM (${vinculos("'{{vendedorId}}'")}) V
JOIN CLIENTES C ON C.ID = V.ID_CLIENTE
JOIN INT_USER U ON U.ID = V.VENDEDOR_ID
LEFT JOIN VENDEDOR_RCA VR ON VR.USER_ID = V.VENDEDOR_ID
LEFT JOIN FILIAL F ON ${cod('F.CODFILIAL')} = ${cod('V.CODFILIAL')}
LEFT JOIN BU B ON ${cod('B.CODIGO')} = ${cod('V.CODEPTO')}
LEFT JOIN SECAO S ON S.ID = V.ID_SECAO
WHERE ('{{ramo}}' = '' OR ${ramoDe('V.ID_CLIENTE')} = '{{ramo}}')
  AND ${buscaCliente('C')}
ORDER BY VENDEDOR, CLIENTE, V.CODFILIAL, V.ID_SECAO
${PAGINA}`,
  },
  {
    name: 's360GestaoCarteiraTransferir',
    type: 'SQL',
    description: 'Transfere um vinculo para outro vendedor da equipe (RN-018): mantem filial e secao; destino com escopo ali e sem o mesmo cliente na mesma filial e secao. Params: vinculoId, codepto, destinoId, hoje. Devolve affectedRows; 0 = ver s360GestaoCarteiraMotivo.',
    code: `UPDATE EQUIPE_CLIENTE
SET ID_VENDEDOR = {{destinoId}}
WHERE ID = {{vinculoId}}
  AND ID_VENDEDOR <> {{destinoId}}
  AND ID IN (SELECT V.VINCULO_ID FROM (${vinculos("''")}) V WHERE ${cod('V.CODEPTO')} = ${cod("'{{codepto}}'")})
  AND ${destinoAtua('{{destinoId}}', 'EQUIPE_CLIENTE.CODFILIAL', "'{{codepto}}'", 'EQUIPE_CLIENTE.ID_SECAO')}
  AND NOT ${destinoJaTem('{{destinoId}}', 'EQUIPE_CLIENTE.ID_CLIENTE', 'EQUIPE_CLIENTE.CODFILIAL', 'EQUIPE_CLIENTE.ID_SECAO')}`,
  },
  {
    name: 's360GestaoCarteiraMotivo',
    type: 'SQL',
    description: 'Por que a transferencia foi recusada (C-018, RN-018): FORA_DA_EQUIPE, JA_TEM, SEM_ESCOPO ou OK, com ESCOPO (filial · departamento). Params: vinculoId, codepto, destinoId, hoje.',
    code: `SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM (${vinculos("''")}) V WHERE V.VINCULO_ID = {{vinculoId}}) THEN 'FORA_DA_EQUIPE'
    WHEN NOT EXISTS (SELECT 1 FROM (${escopoAlvo(EQUIPE())}) D WHERE D.VENDEDOR_ID = {{destinoId}}) THEN 'FORA_DA_EQUIPE'
    WHEN ${destinoJaTem('{{destinoId}}', 'EC.ID_CLIENTE', 'EC.CODFILIAL', 'EC.ID_SECAO')} THEN 'JA_TEM'
    WHEN NOT ${destinoAtua('{{destinoId}}', 'EC.CODFILIAL', "'{{codepto}}'", 'EC.ID_SECAO')} THEN 'SEM_ESCOPO'
    ELSE 'OK' END AS MOTIVO,
  ${nomeEscopo('EC.CODFILIAL', "'{{codepto}}'")} AS ESCOPO
FROM EQUIPE_CLIENTE EC
WHERE EC.ID = {{vinculoId}}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360GestaoCarteiraPrevia',
    type: 'SQL',
    description: 'Previa de Transferir toda carteira (C-019, RN-018, D-010-10): vinculos da origem, quantos o destino ja tem e quantos caem fora dos escopos do destino (o primeiro em ESCOPO_FALTANDO). Params: origemId, destinoId, hoje.',
    code: `SELECT COUNT(DISTINCT V.VINCULO_ID) AS TOTAL,
  COUNT(DISTINCT CASE WHEN ${destinoJaTem('{{destinoId}}', 'V.ID_CLIENTE', 'V.CODFILIAL', 'V.ID_SECAO')} THEN V.VINCULO_ID END) AS JA_TEM,
  COUNT(DISTINCT CASE WHEN NOT ${destinoAtua('{{destinoId}}', 'V.CODFILIAL', 'V.CODEPTO', 'V.ID_SECAO')} THEN V.VINCULO_ID END) AS SEM_ESCOPO,
  MIN(CASE WHEN NOT ${destinoAtua('{{destinoId}}', 'V.CODFILIAL', 'V.CODEPTO', 'V.ID_SECAO')} THEN ${nomeEscopo('V.CODFILIAL', 'V.CODEPTO')} END) AS ESCOPO_FALTANDO
FROM (${vinculos("'{{origemId}}'")}) V
WHERE {{origemId}} <> {{destinoId}}`,
  },
  {
    // Um UPDATE so: tudo ou nada (RN-018, RNF-004). Os que o destino ja tem ficam com a origem (C-019).
    name: 's360GestaoCarteiraTransferirToda',
    type: 'SQL',
    description: 'Transfere todos os vinculos da origem (nas BUs do coordenador) para o destino; duplicados ficam com a origem; se algum vinculo cai fora dos escopos do destino, nada muda (D-010-8). Params: origemId, destinoId, hoje. Devolve affectedRows.',
    code: `UPDATE EQUIPE_CLIENTE
SET ID_VENDEDOR = {{destinoId}}
WHERE ID_VENDEDOR = {{origemId}}
  AND {{origemId}} <> {{destinoId}}
  AND ID IN (SELECT V.VINCULO_ID FROM (${vinculos("'{{origemId}}'")}) V)
  AND NOT ${destinoJaTem('{{destinoId}}', 'EQUIPE_CLIENTE.ID_CLIENTE', 'EQUIPE_CLIENTE.CODFILIAL', 'EQUIPE_CLIENTE.ID_SECAO')}
  AND NOT EXISTS (SELECT 1 FROM (${vinculos("'{{origemId}}'")}) V2
                  WHERE NOT ${destinoAtua('{{destinoId}}', 'V2.CODFILIAL', 'V2.CODEPTO', 'V2.ID_SECAO')})`,
  },
  {
    name: 's360GestaoCarteiraDisponiveis',
    type: 'SQL',
    description: 'Ate 8 clientes disponiveis (regras da 002: sem Pessoa Fisica, sem responsavel no escopo) para um vendedor da equipe num escopo dele (RN-019, RNT-014). Params: vendedorId, codFilial, codepto, idSecao (vazio = sem secao), busca, hoje.',
    code: `SELECT C.ID, ${nomeCliente('C')} AS CLIENTE, C.CNPJ, C.CIDADE, C.UF
FROM CLIENTES C
JOIN (${escopoAlvo(EQUIPE("'{{vendedorId}}'"))}) A ON ${escopoEscolhido('A')}
WHERE TRIM('{{busca}}') <> ''
  AND ${buscaCliente('C')}
  AND ${naoPessoaFisica('C.ID')}
  AND NOT ${responsavelNoEscopo('C.ID', 'A.CODFILIAL', 'A.CODEPTO', 'A.ID_SECAO')}
ORDER BY CLIENTE
LIMIT 8`,
  },
  {
    name: 's360GestaoCarteiraAdicionar',
    type: 'SQL',
    description: 'Adiciona um cliente disponivel a carteira de um vendedor da equipe no escopo escolhido (RF-029, C-020, RN-019). Params: clienteId, vendedorId, codFilial, codepto, idSecao, agora, hoje. Devolve affectedRows; escopo vazio ou de fora = 0.',
    code: `INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM, CODFILIAL, ID_SECAO)
SELECT C.ID, A.VENDEDOR_ID, ${agora}, A.CODFILIAL, A.ID_SECAO
FROM CLIENTES C
JOIN (${escopoAlvo(EQUIPE("'{{vendedorId}}'"))}) A ON ${escopoEscolhido('A')}
WHERE C.ID = ${num('clienteId')}
  AND ${naoPessoaFisica('C.ID')}
  AND NOT ${responsavelNoEscopo('C.ID', 'A.CODFILIAL', 'A.CODEPTO', 'A.ID_SECAO')}
  AND '{{agora}}' <> ''
LIMIT 1`,
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
