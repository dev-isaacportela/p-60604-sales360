export function toSafeLower(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

type ClienteBuscaShape = {
  ID?: unknown;
  NOME_FANTASIA?: unknown;
  RAZAO_SOCIAL?: unknown;
  CIDADE?: unknown;
  UF?: unknown;
};

export function filterClientesByBusca<T extends ClienteBuscaShape>(clientes: T[], busca: string): T[] {
  const buscaNormalizada = toSafeLower(busca).trim();
  if (!buscaNormalizada) return clientes;

  return clientes.filter((cliente) => {
    const nomeFantasia = toSafeLower(cliente.NOME_FANTASIA);
    const razaoSocial = toSafeLower(cliente.RAZAO_SOCIAL);
    const id = String(cliente.ID ?? '');
    const cidadeUf = `${toSafeLower(cliente.CIDADE)} ${toSafeLower(cliente.UF)}`;

    return (
      nomeFantasia.includes(buscaNormalizada)
      || razaoSocial.includes(buscaNormalizada)
      || id.includes(buscaNormalizada)
      || cidadeUf.includes(buscaNormalizada)
    );
  });
}

export function isInsideWindow(dateStr: string, periodDays: string, now: Date = new Date()): boolean {
  if (periodDays === 'ALL') return true;
  const days = Number(periodDays);
  if (!days || !dateStr) return true;

  const [year, month, day] = dateStr.split('-').map(Number);
  const parsedDate = new Date(year, (month || 1) - 1, day || 1);
  const diffMs = now.getTime() - parsedDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

export function buildPaginationInput(page: number, pageSize: number): { limit: string; offset: string } {
  const normalizedPage = Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0);
  const normalizedSize = Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 1);

  return {
    limit: String(normalizedSize),
    offset: String(normalizedPage * normalizedSize),
  };
}

export function isLatestRequest(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

export function shouldShowNextPage(rowsLength: number, pageSize: number): boolean {
  return rowsLength >= pageSize;
}
