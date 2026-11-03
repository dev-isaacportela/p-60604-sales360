// Foto principal de cada produto do Mix Builder, no mesmo sistema de fotos do Pricing Hub.
// O endereço vem do cache MIX_PRODUTO_FOTO (renovado por cron uma vez por dia); a tela só lê.
// Foto nunca atrasa nem derruba a tela: falha na leitura deixa o produto "sem foto".
import { useEffect, useState } from 'react';

import { callSF, SF } from '../hooks/useMitra';

/** Até quantos códigos cabem numa chamada de mixFotos. */
const LOTE_FOTOS = 200;

// Vale para a sessão inteira: abrir o mix de novo não consulta o que já se sabe.
// Código → endereço; `null` = produto sem foto.
const conhecidas = new Map<number, string | null>();
const ouvintes = new Set<() => void>();
const pedidos = new Set<number>();

/** Só inteiro positivo vira código, sem repetição e na ordem em que veio. */
export function codigosValidos(codigos: unknown[]): number[] {
  const saida: number[] = [];
  for (const c of codigos) {
    const texto = String(c ?? '').trim();
    if (!/^\d{1,9}$/.test(texto)) continue;
    const n = Number(texto);
    if (n > 0 && !saida.includes(n)) saida.push(n);
  }
  return saida;
}

async function buscar(codigos: number[]) {
  for (let i = 0; i < codigos.length; i += LOTE_FOTOS) {
    const lote = codigos.slice(i, i + LOTE_FOTOS);
    try {
      const linhas = await callSF(SF.mixFotos, { codprods: lote.join(',') });
      const achadas = new Map(linhas.map((l: any) => [Number(l.CODPROD), String(l.URL || '')]));
      for (const c of lote) {
        const url = achadas.get(c);
        conhecidas.set(c, url && url.startsWith('https://') ? url : null);
      }
    } catch {
      for (const c of lote) conhecidas.set(c, null);
    }
    ouvintes.forEach((avisar) => avisar());
  }
}

/** Busca (uma vez por sessão) as fotos dos códigos pedidos, em lotes de 200, sem bloquear a tela. */
export function carregarFotos(codigos: unknown[]): Promise<void> {
  const novos = codigosValidos(codigos).filter((c) => !conhecidas.has(c) && !pedidos.has(c));
  if (!novos.length) return Promise.resolve();
  novos.forEach((c) => pedidos.add(c));
  return buscar(novos).finally(() => novos.forEach((c) => pedidos.delete(c)));
}

/**
 * O endereço da foto de um código: texto, `null` (sem foto, ou código inválido)
 * ou `undefined` (ainda carregando).
 */
export function fotoDoProduto(codprod: number): string | null | undefined {
  if (!(Number.isInteger(codprod) && codprod > 0)) return null;
  return conhecidas.get(codprod);
}

/** Pede as fotos da lista e redesenha quando elas chegam. */
export function useFotosProdutos(codigos: unknown[]) {
  const chave = codigosValidos(codigos).sort((a, b) => a - b).join(',');
  const [, setVersao] = useState(0);

  useEffect(() => {
    const avisar = () => setVersao((v) => v + 1);
    ouvintes.add(avisar);
    return () => {
      ouvintes.delete(avisar);
    };
  }, []);

  useEffect(() => {
    if (chave) void carregarFotos(chave.split(','));
  }, [chave]);

  return fotoDoProduto;
}
