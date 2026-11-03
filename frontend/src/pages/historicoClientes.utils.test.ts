import { describe, expect, it } from 'vitest';
import {
  buildPaginationInput,
  filterClientesByBusca,
  isInsideWindow,
  isLatestRequest,
  shouldShowNextPage,
  toSafeLower,
} from './historicoClientes.utils';

describe('historicoClientes.utils', () => {
  it('converte valor desconhecido para lowercase seguro', () => {
    expect(toSafeLower(undefined)).toBe('');
    expect(toSafeLower(null)).toBe('');
    expect(toSafeLower('ClIeNtE')).toBe('cliente');
    expect(toSafeLower(123)).toBe('123');
  });

  it('filtra clientes por busca sem quebrar com campos nulos', () => {
    const clientes = [
      {
        ID: 1,
        NOME_FANTASIA: 'Alpha Nutri',
        RAZAO_SOCIAL: 'Alpha Nutri LTDA',
        CIDADE: 'Curitiba',
        UF: 'PR',
      },
      {
        ID: 2,
        NOME_FANTASIA: null,
        RAZAO_SOCIAL: null,
        CIDADE: null,
        UF: null,
      },
    ] as any[];

    expect(filterClientesByBusca(clientes, 'alpha')).toHaveLength(1);
    expect(filterClientesByBusca(clientes, '2')).toHaveLength(1);
    expect(filterClientesByBusca(clientes, 'curitiba')).toHaveLength(1);
  });

  it('calcula paginação com limit e offset corretamente', () => {
    expect(buildPaginationInput(0, 20)).toEqual({ limit: '20', offset: '0' });
    expect(buildPaginationInput(2, 20)).toEqual({ limit: '20', offset: '40' });
    expect(buildPaginationInput(-1, 0)).toEqual({ limit: '1', offset: '0' });
  });

  it('indica corretamente se deve mostrar a próxima página', () => {
    expect(shouldShowNextPage(20, 20)).toBe(true);
    expect(shouldShowNextPage(19, 20)).toBe(false);
  });

  it('valida se a resposta pertence à requisição mais recente', () => {
    expect(isLatestRequest(3, 3)).toBe(true);
    expect(isLatestRequest(2, 3)).toBe(false);
  });

  it('respeita janela de período para datas do histórico', () => {
    const now = new Date('2026-04-16T12:00:00Z');
    expect(isInsideWindow('2026-04-15', '30', now)).toBe(true);
    expect(isInsideWindow('2026-02-01', '30', now)).toBe(false);
    expect(isInsideWindow('2026-02-01', 'ALL', now)).toBe(true);
  });
});
