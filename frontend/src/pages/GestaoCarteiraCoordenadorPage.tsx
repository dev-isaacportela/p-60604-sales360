import { useEffect, useMemo, useRef, useState } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { ArrowRightLeft, ChevronDown, Loader2, Plus, RefreshCw, Search, UsersRound } from 'lucide-react';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { callSF, callSFSingle, callSFWithMeta, SF, sincronizarTitulares } from '../hooks/useMitra';
import { dedupeOptions } from '../lib/utils';

registerAllModules();

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const PAGE_SIZE = 50;

interface PermissaoCoordenador {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface VendedorOption {
  USER_ID: number;
  COD_RCA: number;
  RCA: string;
}

interface CarteiraCliente {
  CARTEIRA_ID: number;
  ID_CLIENTE: number;
  VENDEDOR_USER_ID: number;
  COD_RCA: number;
  RCA: string;
  CODCLI: number;
  CLIENTE: string;
  RAMO_ATIVIDADE: string;
  CIDADE: string;
  UF: string;
  STATUS: string;
  CODFILIAL: string;
  ID_SECAO: number;
}

interface ClienteDisponivel {
  ID: number;
  CODCLI: number;
  CLIENTE: string;
  RAMO_ATIVIDADE: string;
  CIDADE: string;
  UF: string;
  STATUS: string;
}

interface Option {
  value: string;
  label: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function vendedorLabel(vendedor: VendedorOption) {
  return String(vendedor.RCA || '').trim() || `Vendedor ${vendedor.COD_RCA}`;
}

function DropdownFilter({ label, value, options, onChange, minWidth = 190 }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value)?.label || 'Todos';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3"
        style={{ minWidth, backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
      >
        <span className="truncate">{label}: {selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-[280px] max-h-[300px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          {options.map((option) => (
            <button
              type="button"
              key={`${label}-${option.value || 'all'}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="w-full text-left rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: value === option.value ? '#dfeadf' : 'transparent',
                color: value === option.value ? '#1f6f39' : '#4e5a4e',
                fontWeight: value === option.value ? 700 : 500,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function runMutation(sfId: number, input: Record<string, any>) {
  const response = await executeServerFunctionMitra({ projectId: PROJECT_ID, serverFunctionId: sfId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Execução finalizada com status ${status}`);
  // Transferir/adicionar cliente muda a carteira: titulares de clientes precisam ser revistos
  sincronizarTitulares();
}

export default function GestaoCarteiraCoordenadorPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoCoordenador | null>(null);
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);
  const [ramos, setRamos] = useState<string[]>([]);
  const [clientes, setClientes] = useState<CarteiraCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [codRcaFiltro, setCodRcaFiltro] = useState('');
  const [ramoFiltro, setRamoFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<CarteiraCliente | null>(null);
  const [destinoCliente, setDestinoCliente] = useState('');
  const [origemCarteira, setOrigemCarteira] = useState('');
  const [destinoCarteira, setDestinoCarteira] = useState('');
  const [adicionarCodRca, setAdicionarCodRca] = useState('');
  const [buscaClienteAdicionar, setBuscaClienteAdicionar] = useState('');
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteDisponivel[]>([]);
  const [totalDisponiveis, setTotalDisponiveis] = useState(0);
  const [loadingClientesDisponiveis, setLoadingClientesDisponiveis] = useState(false);
  const [addingClienteId, setAddingClienteId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A SF de escopo devolve uma linha por combinacao filial/departamento/secao,
  // entao o mesmo vendedor vinha repetido varias vezes na lista.
  const vendedorTransferOptions = useMemo<Option[]>(() => dedupeOptions(vendedores.map((vendedor) => ({
    value: String(vendedor.COD_RCA),
    label: vendedorLabel(vendedor),
  }))), [vendedores]);

  const vendedorOptions = useMemo<Option[]>(() => [
    { value: '', label: 'Todos' },
    ...vendedorTransferOptions,
  ], [vendedorTransferOptions]);

  const ramoOptions = useMemo<Option[]>(() => [
    { value: '', label: 'Todos' },
    ...ramos.map((ramo) => ({ value: ramo, label: ramo })),
  ], [ramos]);

  const tableRows = useMemo(() => clientes.map((cliente) => ({
    CODCLI: cliente.CODCLI || cliente.ID_CLIENTE,
    CLIENTE: cliente.CLIENTE || 'Sem cliente',
    RCA: `${cliente.COD_RCA} · ${cliente.RCA || 'Sem nome'}`,
    RAMO_ATIVIDADE: cliente.RAMO_ATIVIDADE || 'Sem ramo',
    CIDADE_UF: [cliente.CIDADE, cliente.UF].filter(Boolean).join(' / '),
    STATUS: cliente.STATUS || '-',
    ESCOPO: `${cliente.CODFILIAL || '-'} · Seção ${cliente.ID_SECAO || '-'}`,
  })), [clientes]);

  async function carregarFiltros() {
    const [vendedoresResp, ramosResp] = await Promise.allSettled([
      callSF(SF.gestaoCarteiraCoordenadorVendedores),
      callSF(SF.gestaoCarteiraCoordenadorRamos, { codRca: '', ramo: '', busca: '' }),
    ]);

    if (vendedoresResp.status === 'fulfilled') setVendedores(vendedoresResp.value as VendedorOption[]);
    if (ramosResp.status === 'fulfilled') setRamos((ramosResp.value || []).map((row: any) => String(row.RAMO || '')).filter(Boolean));
  }

  async function carregarCarteira(nextPage = page) {
    setLoadingDados(true);
    setErro('');
    const input = {
      codRca: codRcaFiltro,
      ramo: ramoFiltro,
      busca: busca.trim(),
      limit: PAGE_SIZE,
      offset: nextPage * PAGE_SIZE,
    };

    const [listaResp, contadorResp] = await Promise.allSettled([
      callSFWithMeta(SF.gestaoCarteiraCoordenadorListar, input),
      callSFWithMeta(SF.gestaoCarteiraCoordenadorContar, input),
    ]);

    if (listaResp.status === 'fulfilled') {
      setClientes(listaResp.value.rows as CarteiraCliente[]);
      if (listaResp.value.error) setErro(listaResp.value.error);
    }
    if (contadorResp.status === 'fulfilled') {
      setTotal(toNumber(contadorResp.value.rows[0]?.TOTAL));
      if (contadorResp.value.error) setErro(contadorResp.value.error);
    }

    setSelected(null);
    setLoadingDados(false);
  }

  async function carregarClientesDisponiveis() {
    if (!adicionarCodRca) {
      setClientesDisponiveis([]);
      setTotalDisponiveis(0);
      return;
    }

    setLoadingClientesDisponiveis(true);
    setErro('');
    const input = {
      codRca: adicionarCodRca,
      ramo: ramoFiltro,
      busca: buscaClienteAdicionar.trim(),
      limit: 8,
      offset: 0,
    };

    const [listaResp, contadorResp] = await Promise.allSettled([
      callSFWithMeta(SF.gestaoCarteiraCoordenadorClientesDisponiveis, input),
      callSFWithMeta(SF.gestaoCarteiraCoordenadorContarClientesDisponiveis, input),
    ]);

    if (listaResp.status === 'fulfilled') {
      setClientesDisponiveis(listaResp.value.rows as ClienteDisponivel[]);
      if (listaResp.value.error) setErro(listaResp.value.error);
    }
    if (contadorResp.status === 'fulfilled') {
      setTotalDisponiveis(toNumber(contadorResp.value.rows[0]?.TOTAL));
      if (contadorResp.value.error) setErro(contadorResp.value.error);
    }

    setLoadingClientesDisponiveis(false);
  }

  async function transferirCliente() {
    if (!selected || !destinoCliente) return;
    setStatusMsg('');
    setErro('');
    try {
      await runMutation(SF.gestaoCarteiraCoordenadorTransferirCliente, {
        carteiraId: selected.CARTEIRA_ID,
        codRcaDestino: destinoCliente,
      });
      setStatusMsg('Transferência solicitada. A lista foi atualizada com o estado atual da carteira.');
      setDestinoCliente('');
      await carregarCarteira(page);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao transferir cliente.');
    }
  }

  async function transferirCarteiraInteira() {
    if (!origemCarteira || !destinoCarteira || origemCarteira === destinoCarteira) return;
    setStatusMsg('');
    setErro('');
    try {
      await runMutation(SF.gestaoCarteiraCoordenadorTransferirToda, {
        codRcaOrigem: origemCarteira,
        codRcaDestino: destinoCarteira,
      });
      setStatusMsg('Transferência de carteira solicitada. Registros duplicados no destino são preservados sem duplicar.');
      setOrigemCarteira('');
      setDestinoCarteira('');
      await carregarFiltros();
      await carregarCarteira(0);
      setPage(0);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao transferir carteira.');
    }
  }

  async function adicionarClienteCarteira(cliente: ClienteDisponivel) {
    if (!adicionarCodRca || !cliente.ID) return;
    setStatusMsg('');
    setErro('');
    setAddingClienteId(cliente.ID);
    try {
      await runMutation(SF.gestaoCarteiraCoordenadorAdicionarCliente, {
        codRca: adicionarCodRca,
        clienteId: cliente.ID,
        ramo: ramoFiltro,
        busca: buscaClienteAdicionar.trim(),
        limit: 1,
        offset: 0,
      });
      setStatusMsg('Cliente adicionado à carteira do vendedor selecionado.');
      await Promise.all([carregarCarteira(0), carregarClientesDisponiveis()]);
      setPage(0);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao adicionar cliente à carteira.');
    } finally {
      setAddingClienteId(null);
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingPermissao(true);
      const row = await callSFSingle(SF.painelCoordenadorPermissao);
      if (!active) return;
      setPermissao(row as PermissaoCoordenador | null);
      setLoadingPermissao(false);
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!podeAcessar) return;
    carregarFiltros();
  }, [podeAcessar]);

  useEffect(() => {
    if (!adicionarCodRca && vendedores[0]?.COD_RCA) setAdicionarCodRca(String(vendedores[0].COD_RCA));
  }, [adicionarCodRca, vendedores]);

  useEffect(() => {
    if (!podeAcessar) return;
    const nextPage = 0;
    setPage(nextPage);
    carregarCarteira(nextPage);
  }, [podeAcessar, codRcaFiltro, ramoFiltro, busca]);

  if (loadingPermissao) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!podeAcessar) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Carteira</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Esta tela está disponível apenas para coordenadores com vínculo ativo.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>Perfil atual: <strong>{permissao?.CARGO_ATUAL || 'NÃO DEFINIDO'}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: '#137432' }}>Camada Coordenador</p>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Carteira</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>Visualize e redistribua clientes entre vendedores sob sua gestão.</p>
        </div>
        <button type="button" onClick={() => carregarCarteira(page)} disabled={loadingDados} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-60" style={{ backgroundColor: '#137432' }}>
          {loadingDados ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </div>

      <section className="rounded-3xl p-5 mb-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownFilter label="Vendedor" value={codRcaFiltro} options={vendedorOptions} onChange={setCodRcaFiltro} minWidth={260} />
          <DropdownFilter label="Ramo" value={ramoFiltro} options={ramoOptions} onChange={setRamoFiltro} minWidth={230} />
          <div className="h-11 min-w-[280px] flex items-center gap-2 px-4 rounded-2xl" style={{ backgroundColor: '#eef2eb', border: '1px solid #d7dfd3' }}>
            <Search size={16} style={{ color: '#687366' }} />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por cliente ou código"
              className="w-full bg-transparent outline-none text-sm"
              style={{ color: '#425242' }}
            />
          </div>
        </div>
      </section>

      {erro ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fff4dc', color: '#8a5600', border: '1px solid #f2d499' }}>{erro}</div> : null}
      {statusMsg ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e6f4ea', color: '#137432', border: '1px solid #cde7d3' }}>{statusMsg}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#e3e8de' }}>
            <div>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Clientes da carteira</h2>
              <p className="text-sm mt-1" style={{ color: '#657063' }}>{total} clientes encontrados. Clique em uma linha para transferir cliente individualmente.</p>
            </div>
            {loadingDados ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#137432' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}
          </div>

          <div className="validation-hot-wrapper">
            <HotTable
              data={tableRows}
              columns={[
                { data: 'CODCLI', width: 100 },
                { data: 'CLIENTE', width: 300 },
                { data: 'RCA', width: 260 },
                { data: 'RAMO_ATIVIDADE', width: 210 },
                { data: 'CIDADE_UF', width: 150 },
                { data: 'STATUS', width: 100 },
                { data: 'ESCOPO', width: 130 },
              ]}
              colHeaders={['Código', 'Cliente', 'Vendedor/RCA', 'Ramo', 'Cidade/UF', 'Status', 'Escopo']}
              rowHeaders
              height={460}
              width="100%"
              stretchH="none"
              manualColumnResize
              columnSorting={{ indicator: true, headerAction: true }}
              afterSelectionEnd={(row) => setSelected(clientes[row] || null)}
              readOnly
              licenseKey="non-commercial-and-evaluation"
              className="ht-theme-main"
            />
          </div>

          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderTop: '1px solid #e3e8de' }}>
            <div className="text-sm" style={{ color: '#4f5d4d' }}>Página {page + 1} de {totalPages}</div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page === 0 || loadingDados} onClick={() => { const next = Math.max(0, page - 1); setPage(next); carregarCarteira(next); }} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Anterior</button>
              <button type="button" disabled={page + 1 >= totalPages || loadingDados} onClick={() => { const next = page + 1; setPage(next); carregarCarteira(next); }} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Próxima</button>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><ArrowRightLeft size={22} /></div>
            <h2 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>Transferir cliente</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: '#657063' }}>{selected ? `${selected.CODCLI} · ${selected.CLIENTE}` : 'Selecione uma linha na tabela.'}</p>
            <DropdownFilter label="Destino" value={destinoCliente} options={vendedorTransferOptions} onChange={setDestinoCliente} minWidth={300} />
            <button type="button" disabled={!selected || !destinoCliente || loadingDados} onClick={transferirCliente} className="mt-4 w-full h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#137432' }}>Transferir cliente</button>
          </section>

          <section className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><Plus size={22} /></div>
            <h2 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>Adicionar cliente</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: '#657063' }}>Inclua um cliente disponível na carteira de um vendedor sob sua gestão.</p>
            <div className="space-y-3">
              <DropdownFilter label="Vendedor" value={adicionarCodRca} options={vendedorTransferOptions} onChange={setAdicionarCodRca} minWidth={300} />
              <div className="h-11 flex items-center gap-2 px-4 rounded-2xl" style={{ backgroundColor: '#eef2eb', border: '1px solid #d7dfd3' }}>
                <Search size={16} style={{ color: '#687366' }} />
                <input
                  value={buscaClienteAdicionar}
                  onChange={(event) => setBuscaClienteAdicionar(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void carregarClientesDisponiveis(); }}
                  placeholder="Buscar cliente disponível"
                  className="w-full bg-transparent outline-none text-sm"
                  style={{ color: '#425242' }}
                />
              </div>
              <button type="button" disabled={!adicionarCodRca || loadingClientesDisponiveis} onClick={carregarClientesDisponiveis} className="w-full h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#137432' }}>
                {loadingClientesDisponiveis ? 'Buscando...' : 'Buscar clientes'}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {loadingClientesDisponiveis ? (
                <div className="rounded-2xl px-3 py-3 text-sm flex items-center gap-2" style={{ backgroundColor: '#eef2eb', color: '#657063' }}><Loader2 size={15} className="animate-spin" /> Carregando clientes...</div>
              ) : clientesDisponiveis.length > 0 ? clientesDisponiveis.map((cliente) => (
                <div key={cliente.ID} className="rounded-2xl p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
                  <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>{cliente.CODCLI || cliente.ID} · {cliente.CLIENTE || 'Cliente sem nome'}</p>
                  <p className="text-xs mt-1" style={{ color: '#657063' }}>{cliente.RAMO_ATIVIDADE || 'Sem ramo'} · {[cliente.CIDADE, cliente.UF].filter(Boolean).join(' / ') || 'Sem cidade'}</p>
                  <button
                    type="button"
                    disabled={addingClienteId === cliente.ID}
                    onClick={() => adicionarClienteCarteira(cliente)}
                    className="mt-3 w-full h-9 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: '#137432' }}
                  >
                    {addingClienteId === cliente.ID ? 'Adicionando...' : 'Adicionar à carteira'}
                  </button>
                </div>
              )) : (
                <div className="rounded-2xl px-3 py-3 text-sm" style={{ backgroundColor: '#eef2eb', color: '#657063' }}>
                  {adicionarCodRca ? 'Busque para ver clientes disponíveis.' : 'Selecione um vendedor para iniciar.'}
                </div>
              )}
            </div>
            {totalDisponiveis > clientesDisponiveis.length ? <p className="mt-3 text-xs" style={{ color: '#657063' }}>Mostrando {clientesDisponiveis.length} de {totalDisponiveis}. Refine a busca para encontrar outros clientes.</p> : null}
          </section>

          <section className="rounded-3xl p-5" style={{ backgroundColor: '#fff8f1', border: '1px solid #f0dfcc', boxShadow: '0 14px 30px rgba(88,55,21,0.07)' }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#fff4dc', color: '#a26a00' }}><UsersRound size={22} /></div>
            <h2 className="font-display text-2xl font-extrabold" style={{ color: '#281b10' }}>Transferir toda carteira</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: '#6f563b' }}>Move todos os clientes de um RCA para outro dentro do seu escopo.</p>
            <div className="space-y-3">
              <DropdownFilter label="Origem" value={origemCarteira} options={vendedorTransferOptions} onChange={setOrigemCarteira} minWidth={300} />
              <DropdownFilter label="Destino" value={destinoCarteira} options={vendedorTransferOptions} onChange={setDestinoCarteira} minWidth={300} />
            </div>
            <button type="button" disabled={!origemCarteira || !destinoCarteira || origemCarteira === destinoCarteira || loadingDados} onClick={transferirCarteiraInteira} className="mt-4 w-full h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#a26a00' }}>Transferir toda carteira</button>
          </section>
        </aside>
      </div>
    </div>
  );
}
