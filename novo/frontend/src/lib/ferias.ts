// Férias de Vendedores (RNT-010, RN-020). Regra pura: tests/ferias.test.mjs.
// A tela valida aqui para dar a mensagem da spec; o servidor recusa de novo
// com as mesmas condições (D-010-3).

import { fmtData } from './formato.ts';

export type EstadoFerias = 'FUTURA' | 'ATIVA' | 'ENCERRADA';

export function estadoFerias(inicio: string, fim: string, hoje: string): EstadoFerias {
  if (inicio > hoje) return 'FUTURA';
  return fim < hoje ? 'ENCERRADA' : 'ATIVA';
}

interface FeriasExistente {
  TITULAR_ID: number | string;
  TITULAR: string;
  SUBSTITUTO_ID: number | string | null;
  DT_INICIO: string;
  DT_FIM: string;
}

interface Pessoa {
  USER_ID: number | string;
  NOME: string;
}

interface NovaFerias {
  titularId: number;
  substitutoId: number;
  inicio: string;
  fim: string;
}

const entre = (f: FeriasExistente) => `entre ${fmtData(f.DT_INICIO)} e ${fmtData(f.DT_FIM)}`;

/** Mensagem de recusa ou null. */
export function validarFerias(nova: NovaFerias, existentes: FeriasExistente[], pessoas: Pessoa[]): string | null {
  const { titularId, substitutoId, inicio, fim } = nova;
  if (!titularId || !substitutoId || !inicio || !fim) return 'Informe vendedor, substituto, início e fim.';
  if (titularId === substitutoId) return 'O substituto precisa ser outra pessoa.';
  if (inicio > fim) return 'O início precisa ser antes do fim.';
  const nome = (id: number) => pessoas.find(p => Number(p.USER_ID) === id)?.NOME ?? 'Esta pessoa';
  const sobrepoe = (f: FeriasExistente) => f.DT_INICIO <= fim && f.DT_FIM >= inicio;

  const doTitular = existentes.find(f => Number(f.TITULAR_ID) === titularId && sobrepoe(f));
  if (doTitular) return `${nome(titularId)} já tem férias ${entre(doTitular)}.`;
  const cobrindo = existentes.find(f => Number(f.SUBSTITUTO_ID) === titularId && sobrepoe(f));
  if (cobrindo) return `${nome(titularId)} está substituindo ${cobrindo.TITULAR} ${entre(cobrindo)}.`;
  const doSubstituto = existentes.find(f => Number(f.TITULAR_ID) === substitutoId && sobrepoe(f));
  if (doSubstituto) return `${nome(substitutoId)} está de férias ${entre(doSubstituto)}.`;
  return null;
}
