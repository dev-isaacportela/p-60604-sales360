/**
 * Utilitarios de leitura dos campos de meta da aba Analytics > Metas.
 *
 * Ficam fora da pagina para poderem ser testados: e aqui que moravam dois bugs
 * que chegaram em producao — campo vazio virando meta zero e '1500.50' virando
 * R$ 150.050,00.
 */

/**
 * Converte o texto digitado no campo de meta para numero em formato SQL.
 *
 * Devolve '' para campo vazio: quem chama decide o que fazer com isso.
 * Aceita as duas escritas usadas na pratica — '1.500,50' (pt-BR) e '1500.50'.
 * Regra: o ultimo separador e o decimal quando sobram 1 ou 2 digitos depois
 * dele; qualquer outro separador e de milhar.
 */
export function normalizeCurrencyInput(value: string): string {
  const limpo = String(value ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!limpo) return '';

  const negativo = limpo.startsWith('-');
  const corpo = limpo.replace(/-/g, '');
  const ultimoSeparador = Math.max(corpo.lastIndexOf(','), corpo.lastIndexOf('.'));

  let inteiro = corpo;
  let decimais = '';
  if (ultimoSeparador >= 0) {
    const cauda = corpo.slice(ultimoSeparador + 1);
    const ehDecimal = cauda.length > 0 && cauda.length <= 2 && !cauda.includes(',') && !cauda.includes('.');
    if (ehDecimal) {
      inteiro = corpo.slice(0, ultimoSeparador);
      decimais = cauda;
    }
  }

  inteiro = inteiro.replace(/[.,]/g, '');
  if (!inteiro && !decimais) return '';
  const numero = `${inteiro || '0'}${decimais ? `.${decimais}` : ''}`;
  return `${negativo ? '-' : ''}${numero}`;
}

/** Numero digitado no campo de meta, ou null quando o campo esta vazio/invalido. */
export function parseCurrencyInput(value: string): number | null {
  const normalizado = normalizeCurrencyInput(value);
  if (!normalizado) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}
