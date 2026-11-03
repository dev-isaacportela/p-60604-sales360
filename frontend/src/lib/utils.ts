export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ');
}

// Remove opcoes repetidas de dropdown (mesmo `value`), preservando a primeira
// ocorrencia e ordenando pelo texto exibido. Necessario porque varias SFs de
// escopo devolvem uma linha por combinacao filial/departamento/secao — o mesmo
// vendedor (ou departamento) aparecia N vezes na lista de selecao.
export function dedupeOptions<T extends { value: string; label: string }>(options: T[]): T[] {
  const map = new Map<string, T>();
  options.forEach((option) => {
    if (!map.has(option.value)) map.set(option.value, option);
  });
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
