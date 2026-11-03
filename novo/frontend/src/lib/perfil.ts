// Perfil em Configurações e barra superior (RN-010, RN-012, RF-013).
// Regra pura: sem React, sem SDK. É o que tests/perfil.test.mjs importa.

import { fmtData } from './formato.ts';

export const NOME_MAX = 120;

/** Nome de exibição (RN-010): até 120 caracteres; vazio grava '' e a tela mostra o nome da conta. */
export function normalizarNome(texto: string | null | undefined, nomeConta: string): { gravar: string; exibir: string; erro: string | null } {
  const gravar = String(texto ?? '').trim();
  if (gravar.length > NOME_MAX) return { gravar, exibir: gravar, erro: `O nome pode ter até ${NOME_MAX} caracteres.` };
  return { gravar, exibir: gravar || nomeConta, erro: null };
}

/** Iniciais do avatar: "Ana Souza" → "AS"; "Ana" → "A"; e-mail usa a primeira letra. */
export function iniciais(nome: string | null | undefined): string {
  const partes = String(nome ?? '').split('@')[0].trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

interface TextoFerias {
  status: 'Ativo' | 'Férias';
  substituto: string;
  avisos: string[];
}

/**
 * Selo, card `Substituto em Férias` e avisos (RN-012), a partir das linhas de
 * `s360FeriasMinhasObter`. O estado é recalculado pelas datas em `hoje`
 * (AAAA-MM-DD): férias encerradas não contam.
 */
export function textoFerias(linhas: Array<Record<string, unknown>>, hoje: string): TextoFerias {
  const vigentes = (linhas ?? [])
    .map(l => ({
      papel: String(l.PAPEL_FERIAS ?? ''),
      inicio: String(l.DT_INICIO ?? '').slice(0, 10),
      fim: String(l.DT_FIM ?? '').slice(0, 10),
      pessoa: String(l.OUTRA_PESSOA ?? ''),
    }))
    .filter(l => l.fim >= hoje)
    .map(l => ({ ...l, ativa: l.inicio <= hoje }));

  const titularAtiva = vigentes.find(l => l.papel === 'TITULAR' && l.ativa);
  const titularFutura = vigentes
    .filter(l => l.papel === 'TITULAR' && !l.ativa)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const cobrindo = vigentes.filter(l => l.papel === 'SUBSTITUTO' && l.ativa);

  const avisos: string[] = [];
  if (titularFutura) avisos.push(`Férias programadas de ${fmtData(titularFutura.inicio)} a ${fmtData(titularFutura.fim)}`);
  for (const c of cobrindo) avisos.push(`Você cobre ${c.pessoa} até ${fmtData(c.fim)}`);

  return {
    status: titularAtiva ? 'Férias' : 'Ativo',
    substituto: (titularAtiva ?? titularFutura)?.pessoa || 'Não definido',
    avisos,
  };
}
