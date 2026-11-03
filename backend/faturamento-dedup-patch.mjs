// Faturamento diretoria (240-247): ESCOPO_CARTEIRA gera uma linha por vendedor x coordenador; departamento com
// 2 coordenadores (ex.: Medicamento: Glauber e João) duplicava a venda. Decisão (a): cada venda conta 1 vez no
// total; na visão por coordenador (242) a venda aparece para cada coordenador do departamento.
// Ao escolher a linha que fica: vendedor real antes de usuário institucional/bloqueado, coordenador real antes de "Sem coordenador".
import { USUARIOS_EXCLUIDOS_SQL } from './titulares-config.mjs';

export const MARK = '/*DEDUP_VENDA*/';

function fimDoParen(code, abre) {
  let d = 0, q = false;
  for (let i = abre; i < code.length; i++) {
    const c = code[i];
    if (c === "'") q = !q;
    if (q) continue;
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

export function aplicar(code, porCoordenador) {
  if (code.includes(MARK)) return { code, mudou: false };
  const ini = code.search(/\bBASE_VENDAS\s+AS\s*\(/);
  if (ini < 0) throw new Error('BASE_VENDAS não encontrado');
  const abre = code.indexOf('(', ini);
  const fecha = fimDoParen(code, abre);
  let corpo = code.slice(abre + 1, fecha);
  const sel = corpo.search(/\bSELECT\b/);
  corpo = `${corpo.slice(0, sel)}SELECT\n    V.AUTO_ID AS SALE_ID,${corpo.slice(sel + 'SELECT'.length)}`;
  const part = porCoordenador ? 'R_DED.SALE_ID, R_DED.COD_SUPERVISOR' : 'R_DED.SALE_ID';
  const novo = `BASE_VENDAS_RAW AS (${corpo}),
BASE_VENDAS AS ( ${MARK}
  SELECT X_DED.* FROM (
    SELECT R_DED.*, ROW_NUMBER() OVER (PARTITION BY ${part} ORDER BY
      CASE WHEN R_DED.COD_RCA IN ${USUARIOS_EXCLUIDOS_SQL} THEN 1 ELSE 0 END,
      CASE WHEN COALESCE(R_DED.COD_SUPERVISOR, 0) = 0 THEN 1 ELSE 0 END,
      R_DED.COD_SUPERVISOR, R_DED.COD_RCA) AS RN_DED
    FROM BASE_VENDAS_RAW R_DED
  ) X_DED
  WHERE X_DED.RN_DED = 1
)`;
  return { code: code.slice(0, ini) + novo + code.slice(fecha + 1), mudou: true };
}
