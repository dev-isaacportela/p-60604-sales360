// Regras da aba Metas (spec 007) que rodam no servidor, dentro da SF
// JAVASCRIPT s360MetasCarregar. Como 002/006-regras: o add-007 publica o TEXTO
// destas funcoes, entao nada de import nem constante de fora.

// Correspondencia fixa departamento -> unidade do planejamento (RN-010).
export function unidadeDoDepto(codepto) {
  return { 1: 'NUTRICAO', 2: 'ENFERMAGEM', 8: 'MEDICAMENTO', 9: 'ESTETICA_E_INJETAVEIS' }[Number(codepto)] ?? String(codepto);
}

// Ramo do cliente no ERP -> codigo do segmento do planejamento (tabela da SF 295).
export function ramoDoCliente(ramo) {
  const r = String(ramo ?? '').trim().toUpperCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!r) return 'SEM_RAMO';
  if (r.startsWith('ORGAO PUBLICO')) return 'ORGAO_PUBLICO';
  const fixos = {
    CONCESSIONARIA: 'CONCESSIONARIAS', 'CLINICA MEDICA': 'CLINICA_MEDICA', 'DEMAIS CLIENTES': 'DEMAIS_CLIENTES',
    'HOME CARE': 'HOME_CARE', 'HOSPITAL INTERIOR': 'HOSPITAL_INTERIOR', 'HOSPITAL INTERIOR GO': 'HOSPITAL_INTERIOR_GO',
    'HOSPITAL PRIVADO': 'HOSPITAL_PRIVADO', 'HOSPITAL PUBLICO': 'HOSPITAL_PUBLICO',
    'INSTITUTO DE LONGA PERMANENCIA': 'LONGA_PERMANENCIA', MEDICAMENTO: 'MEDICAMENTO',
    'OPERADORA DE SAUDE': 'OPERADORA_DE_SAUDE', PDV: 'PDV',
  };
  return fixos[r] ?? r.replace(/ /g, '_');
}

function centavos(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

// Reparte `valor` entre `alvos` pelo peso (negativo conta zero); peso total
// zero -> partes iguais. Devolve [{alvo, valor}].
export function repartir(valor, alvos, pesoDe) {
  if (!alvos.length) return [];
  const pesos = alvos.map((a) => Math.max(0, Number(pesoDe(a)) || 0));
  const total = pesos.reduce((s, p) => s + p, 0);
  return alvos.map((alvo, i) => ({ alvo, valor: total > 0 ? (valor * pesos[i]) / total : valor / alvos.length }));
}

/**
 * Meta recebida por filial x departamento (RN-010).
 * planejamento: [{UNIDADE, UF, VALOR}] do mes; filiais: [{CODFILIAL, CODEPTO, UF}]
 * (universo: BUs de todos os coordenadores ativos, cada uma uma vez);
 * pesos: [{CODFILIAL, CODEPTO, LIQUIDO}] dos 12 meses anteriores.
 * Cada filial recebe a meta da sua UF, rateada pelo peso entre as filiais da
 * BU naquela UF; meta de UF sem filial vai para todas as filiais da BU.
 */
export function metaRecebida({ planejamento, filiais, pesos }) {
  const chave = (f, d) => `${Number(f)}|${Number(d)}`;
  const peso = new Map(pesos.map((p) => [chave(p.CODFILIAL, p.CODEPTO), Number(p.LIQUIDO) || 0]));
  const unicas = new Map(filiais.map((f) => [chave(f.CODFILIAL, f.CODEPTO), { ...f, META: 0 }]));
  const lista = [...unicas.values()];
  const pesoDe = (f) => peso.get(chave(f.CODFILIAL, f.CODEPTO)) ?? 0;
  for (const p of planejamento) {
    const daUnidade = lista.filter((f) => unidadeDoDepto(f.CODEPTO) === p.UNIDADE);
    const naUf = daUnidade.filter((f) => String(f.UF ?? '').toUpperCase() === String(p.UF).toUpperCase());
    for (const { alvo, valor } of repartir(Number(p.VALOR) || 0, naUf.length ? naUf : daUnidade, pesoDe)) alvo.META += valor;
  }
  return lista.map((f) => ({ ...f, META: centavos(f.META) }));
}

export const REGRAS = [unidadeDoDepto, ramoDoCliente, centavos, repartir, metaRecebida];
