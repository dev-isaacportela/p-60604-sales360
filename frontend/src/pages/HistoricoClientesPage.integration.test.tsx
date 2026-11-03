/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HistoricoClientesPage from './HistoricoClientesPage';
import { SF } from '../hooks/useMitra';

type SFResult = { rows: unknown[]; error: string | null };
type SFInput = Record<string, unknown>;

const callSFWithMetaMock = vi.hoisted(() => vi.fn<(sfId: number, input?: SFInput) => Promise<SFResult>>());
const callSFMock = vi.hoisted(() => vi.fn<(sfId: number, input?: SFInput) => Promise<unknown[]>>());
const callSFSingleMock = vi.hoisted(() => vi.fn<(sfId: number, input?: SFInput) => Promise<Record<string, unknown> | null>>());

vi.mock('../hooks/useMitra', () => ({
  SF: {
    historicoVisitasCliente: 22,
    historicoPedidosCliente: 25,
    detalhesPedidoCliente: 26,
    minhaCarteiraClientes: 27,
    mixListar: 28,
    historicoResumoPedidosCliente: 29,
    dashboardVisitasSemanaResumo: 215,
    painelCoordenadorPermissao: 153,
    gestaoCarteiraCoordenadorVendedores: 158,
  },
  callSFWithMeta: (sfId: number, input?: SFInput) => callSFWithMetaMock(sfId, input),
  callSF: (sfId: number, input?: SFInput) => callSFMock(sfId, input),
  callSFSingle: (sfId: number, input?: SFInput) => callSFSingleMock(sfId, input),
  formatCurrency: (value: number) => `R$ ${value.toFixed(2)}`,
  formatDate: (dateStr: string) => dateStr,
  getBrasiliaDate: () => '2026-05-07',
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/historico-clientes']}>
      <Routes>
        <Route path="/historico-clientes" element={<HistoricoClientesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('HistoricoClientesPage integration', () => {
  beforeEach(() => {
    callSFWithMetaMock.mockReset();
    callSFMock.mockReset();
    callSFSingleMock.mockReset();
    callSFMock.mockResolvedValue([]);
    callSFSingleMock.mockResolvedValue({ PODE_ACESSAR: 0 });
  });

  it('ignora resposta antiga do histórico ao trocar cliente rapidamente', async () => {
    const historicoCliente1 = createDeferred<SFResult>();
    const historicoCliente2 = createDeferred<SFResult>();

    callSFWithMetaMock.mockImplementation(async (sfId, input = {}) => {
      if (sfId === SF.minhaCarteiraClientes) {
        return {
          rows: [
            {
              ID: 1,
              NOME_FANTASIA: 'Cliente Alpha',
              RAZAO_SOCIAL: 'Alpha LTDA',
              CIDADE: 'Curitiba',
              UF: 'PR',
              TAG_COBERTURA: '',
            },
            {
              ID: 2,
              NOME_FANTASIA: 'Cliente Beta',
              RAZAO_SOCIAL: 'Beta LTDA',
              CIDADE: 'Recife',
              UF: 'PE',
              TAG_COBERTURA: '',
            },
          ],
          error: null,
        };
      }

      if (sfId === SF.historicoVisitasCliente) {
        const clienteId = String(input.clienteId ?? '');
        if (clienteId === '1') return historicoCliente1.promise;
        if (clienteId === '2') return historicoCliente2.promise;
      }

      if (sfId === SF.historicoPedidosCliente || sfId === SF.detalhesPedidoCliente) {
        return { rows: [], error: null };
      }

      return { rows: [], error: null };
    });

    renderPage();

    const buscaCliente = await screen.findByPlaceholderText('Nome, razão, código ou cidade');
    fireEvent.change(buscaCliente, { target: { value: 'Beta' } });

    await waitFor(() => {
      expect(screen.getByText('Cliente Beta')).not.toBeNull();
    });

    historicoCliente2.resolve({
      rows: [
        {
          ID: 200,
          DATA_AGENDADA: '2026-04-10',
          HORA_INICIO: '10:00',
          TIPO: 'Relacionamento',
          STATUS: 'CONCLUIDA',
          RELATO: 'Histórico cliente beta',
        },
      ],
      error: null,
    });

    const relatoBetaButtons = await screen.findAllByRole('button', { name: /Ver relato/i });
    expect(relatoBetaButtons).toHaveLength(1);
    fireEvent.click(relatoBetaButtons[0]);
    await screen.findByText('Histórico cliente beta');

    historicoCliente1.resolve({
      rows: [
        {
          ID: 100,
          DATA_AGENDADA: '2026-04-09',
          HORA_INICIO: '09:00',
          TIPO: 'Negociação',
          STATUS: 'CONCLUIDA',
          RELATO: 'Histórico cliente alpha',
        },
      ],
      error: null,
    });

    await waitFor(() => {
      expect(screen.queryByText('Histórico cliente alpha')).toBeNull();
      expect(screen.getByText('Histórico cliente beta')).not.toBeNull();
    });
  });

  it('mostra erro de backend no bloco de histórico', async () => {
    callSFWithMetaMock.mockImplementation(async (sfId) => {
      if (sfId === SF.minhaCarteiraClientes) {
        return {
          rows: [
            {
              ID: 1,
              NOME_FANTASIA: 'Cliente Alpha',
              RAZAO_SOCIAL: 'Alpha LTDA',
              CIDADE: 'Curitiba',
              UF: 'PR',
              TAG_COBERTURA: '',
            },
          ],
          error: null,
        };
      }

      if (sfId === SF.historicoVisitasCliente) {
        return { rows: [], error: 'Erro de conexão' };
      }

      return { rows: [], error: null };
    });

    renderPage();

    await screen.findByText('Não foi possível carregar o histórico de atividades deste cliente.');
  });

  it('envia offset correto ao avançar paginação do histórico', async () => {
    callSFWithMetaMock.mockImplementation(async (sfId, input = {}) => {
      if (sfId === SF.minhaCarteiraClientes) {
        return {
          rows: [
            {
              ID: 1,
              NOME_FANTASIA: 'Cliente Alpha',
              RAZAO_SOCIAL: 'Alpha LTDA',
              CIDADE: 'Curitiba',
              UF: 'PR',
              TAG_COBERTURA: '',
            },
          ],
          error: null,
        };
      }

      if (sfId === SF.historicoVisitasCliente) {
        const offset = String(input.offset ?? '0');
        if (offset === '0') {
          return {
            rows: Array.from({ length: 20 }, (_, idx) => ({
              ID: idx + 1,
              DATA_AGENDADA: '2026-04-10',
              HORA_INICIO: '08:00',
              TIPO: 'Relacionamento',
              STATUS: 'CONCLUIDA',
              RELATO: `Página 1 item ${idx + 1}`,
            })),
            error: null,
          };
        }

        return {
          rows: [
            {
              ID: 999,
              DATA_AGENDADA: '2026-04-11',
              HORA_INICIO: '11:00',
              TIPO: 'Prospecção',
              STATUS: 'CONCLUIDA',
              RELATO: 'Página 2 item',
            },
          ],
          error: null,
        };
      }

      return { rows: [], error: null };
    });

    renderPage();

    await screen.findAllByRole('button', { name: /Ver relato/i });

    await waitFor(() => {
      const botaoHistorico = screen
        .getAllByRole('button', { name: 'Próxima' })
        .find((botao) => !(botao as HTMLButtonElement).disabled);
      expect(botaoHistorico).toBeTruthy();
    });

    const botaoHistorico = screen
      .getAllByRole('button', { name: 'Próxima' })
      .find((botao) => !(botao as HTMLButtonElement).disabled) as HTMLButtonElement;
    fireEvent.click(botaoHistorico);

    await waitFor(() => {
      const houveChamadaComOffset20 = callSFWithMetaMock.mock.calls.some(([sfId, input]) => {
        return sfId === SF.historicoVisitasCliente && String((input ?? {}).offset ?? '') === '20';
      });

      expect(houveChamadaComOffset20).toBe(true);
    });
  });
});
