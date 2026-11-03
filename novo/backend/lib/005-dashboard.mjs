// Fragmentos SQL do Dashboard (spec 005): meta semanal configuravel,
// faturamento do escopo, meta mensal, alertas e ultima carga.
//
// Os provisorios dizem qual fragmento da outra spec os substitui quando ela
// juntar (o numero tem que bater em todas as telas, C-004 da 000):
//   006 -> ULTIMA_CARGA; 007 -> vendaNoEscopo, metaMensal; 008 -> alertaNoEscopo.

import { ESCOPO_SQL, escopoAlvo, vendaDoVendedor, cod } from './002-carteira.mjs';
import { pessoasEscopo } from './003-agenda.mjs';

/* ─────────────── meta semanal de visitas (RN-005, RF-004) ─────────────── */

// Carga inicial: os valores de hoje do sistema antigo, valendo desde sempre
// (a segunda 03/01/2000).
export const META_INICIAL = [['VENDEDOR', 16, '2000-01-03'], ['COORDENADOR', 8, '2000-01-03']];

// Perfil da meta: coordenador = cadastro ativo (o mesmo criterio da 003).
export const ehCoordenador = (pessoa) => `EXISTS (SELECT 1 FROM COORDENADORES C_M5 WHERE C_M5.USER_ID = ${pessoa} AND C_M5.ATIVO = 1)`;

// Valor do perfil vigente na semana que comeca em `segunda` ('AAAA-MM-DD').
export const metaPerfil = (perfil, segunda) => `COALESCE((SELECT MS_P.VALOR FROM META_SEMANAL_VISITAS MS_P
    WHERE MS_P.PERFIL = ${perfil} AND MS_P.VIGENCIA_INICIO <= ${segunda}
    ORDER BY MS_P.VIGENCIA_INICIO DESC LIMIT 1), 0)`;

export const metaSemanal = (pessoa, segunda) =>
  metaPerfil(`CASE WHEN ${ehCoordenador(pessoa)} THEN 'COORDENADOR' ELSE 'VENDEDOR' END`, segunda);

/* ─────────────── pessoas e faturamento (RNT-007/008, RN-006) ─────────────── */

// Pessoas da meta e do faturamento: as do escopo, sem o titular coberto.
// Use como CTE `PES` (WITH PES AS (${pessoasMeta()})). Funcao, nao constante:
// lib/003 importa este arquivo (metaDe) e este importa o dela.
export const pessoasMeta = (p = ESCOPO_SQL) => pessoasEscopo(p, { comCobertura: false });

// ponytail: realizado provisorio da 005; trocar pelo fragmento do Analytics (007) quando juntar.
// A linha `s` (venda ou devolucao) conta UMA vez se conta para alguma pessoa
// de PES na data `data` e casa o recorte do filtro (D-503).
export const vendaNoEscopo = (s, data, p = ESCOPO_SQL) => `(${p.filial} = '' OR ${cod(`${s}.CODFILIAL`)} = ${cod(p.filial)})
    AND (${p.depto} = '' OR ${cod(`${s}.CODEPTO`)} = ${cod(p.depto)})
    AND (${p.secao} = '' OR ${cod(`${s}.CODSEC`)} = ${cod(p.secao)})
    AND EXISTS (SELECT 1 FROM PES PES_V WHERE ${vendaDoVendedor(s, 'PES_V.PESSOA_ID', data)})`;

// ponytail: meta provisoria pela C3 do modelo de dados; trocar pelo fragmento de meta da 007 quando juntar.
// Soma do distribuido as pessoas de PES no mes; sem linha = NULL ("Meta nao distribuida").
export const metaMensal = (ano, mes, p = ESCOPO_SQL) => `(SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE SUM(M_M.META_VALOR) END
    FROM METAS_BU_VENDEDOR M_M
    WHERE M_M.VENDEDOR_ID IN (SELECT PESSOA_ID FROM PES)
      AND M_M.ANO = ${ano} AND M_M.MES = ${mes}
      AND (${p.filial} = '' OR M_M.CODFILIAL = ${cod(p.filial)})
      AND (${p.depto} = '' OR M_M.CODEPTO = ${cod(p.depto)}))`;

/* ─────────────── alertas (RN-010) ─────────────── */

// ponytail: visibilidade provisoria; trocar pelo fragmento de alerta da 008 quando juntar.
// O dono do alerta tem, no escopo aberto, uma linha propria (nao cobertura)
// com a mesma filial, o mesmo departamento (se o alerta tem) e a mesma secao
// (se os dois tem).
export const alertaNoEscopo = (a, p = ESCOPO_SQL) => `EXISTS (
    SELECT 1 FROM (${escopoAlvo(p)}) E_AL
    WHERE E_AL.COBERTURA = 0 AND E_AL.VENDEDOR_ID = ${a}.ID_VENDEDOR
      AND ${cod(`${a}.CODFILIAL`)} = ${cod('E_AL.CODFILIAL')}
      AND (TRIM(COALESCE(${a}.CODEPTO, '')) = '' OR ${cod(`${a}.CODEPTO`)} = ${cod('E_AL.CODEPTO')})
      AND (E_AL.ID_SECAO IS NULL OR TRIM(COALESCE(${a}.ID_SECAO, '')) = '' OR ${cod(`${a}.ID_SECAO`)} = E_AL.ID_SECAO))`;

/* ─────────────── ultima carga (RNT-015, RF-010) ─────────────── */

// ponytail: fonte provisoria; trocar pelo status da carga da 006 quando juntar.
export const ULTIMA_CARGA = `(SELECT MAX(L_C.FIM_EM) FROM ACOMP_SEMANAL_SYNC_LOG L_C WHERE L_C.STATUS = 'SUCCESS')`;
