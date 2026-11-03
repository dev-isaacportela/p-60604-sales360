import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Search, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { callSF, callSFWithMeta, formatCurrency, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';

const ADMIN_EMAIL = 'ti@benenutri.com';

interface OptionItem {
  value: string;
  label: string;
}

interface LinhaAdminAcomp {
  CLIENTE: string;
  CODCLI: number;
  RAMO_CLIENTE: string;
  SEMANA: number;
  TOTAL: number;
  COD_RCA: number | null;
  VENDEDOR_BU_USER_ID: number;
  VENDEDOR_BU_NOME: string;
  NA_CARTEIRA: string;
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  widthClass = 'min-w-[220px]',
}: {
  label: string;
  value: string;
  options: OptionItem[];
  onChange: (next: string) => void;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

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
    <div className={`relative ${widthClass}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-11 w-full px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-2"
        style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
      >
        <span className="truncate">{label}: {selected?.label || 'Selecione'}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl p-2 animate-scaleIn"
          style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}
        >
          {options.map((item) => (
            <button
              key={`${label}-${item.value || 'all'}`}
              type="button"
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
              className="w-full text-left rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: value === item.value ? '#dfeadf' : 'transparent',
                color: value === item.value ? '#1f6f39' : '#4e5a4e',
                fontWeight: value === item.value ? 700 : 500,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, helper, icon }: { title: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <div className="rounded-3xl p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e7dd', boxShadow: '0 10px 24px rgba(32,45,31,0.06)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: '#778277' }}>{title}</p>
          <p className="mt-2 font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>{value}</p>
          <p className="mt-2 text-sm" style={{ color: '#687368' }}>{helper}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#e6f4ea', color: '#1f7d3f' }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatSemana(value: number) {
  if (!value) return '-';
  return `${value}ª sem`;
}

function parseLinha(row: any): LinhaAdminAcomp {
  return {
    CLIENTE: String(row.CLIENTE || 'Cliente sem nome'),
    CODCLI: Number(row.CODCLI || 0),
    RAMO_CLIENTE: String(row.RAMO_CLIENTE || 'Sem ramo'),
    SEMANA: Number(row.SEMANA || 0),
    TOTAL: Number(row.TOTAL || 0),
    COD_RCA: row.COD_RCA === null || row.COD_RCA === undefined ? null : Number(row.COD_RCA),
    VENDEDOR_BU_USER_ID: Number(row.VENDEDOR_BU_USER_ID || 0),
    VENDEDOR_BU_NOME: String(row.VENDEDOR_BU_NOME || `Usuário ${row.VENDEDOR_BU_USER_ID || ''}`),
    NA_CARTEIRA: String(row.NA_CARTEIRA || 'Nao'),
  };
}

export default function AdminAcompanhamentoSemanalPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadingTabela, setLoadingTabela] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [vendedores, setVendedores] = useState<OptionItem[]>([]);
  const [ramos, setRamos] = useState<OptionItem[]>([]);
  const [linhas, setLinhas] = useState<LinhaAdminAcomp[]>([]);

  const [vendedorId, setVendedorId] = useState('');
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState('2026');
  const [ramoCliente, setRamoCliente] = useState('');

  const mesesOptions = useMemo<OptionItem[]>(() => [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ], []);

  const anosOptions = useMemo<OptionItem[]>(() => [
    { value: '2024', label: '2024' },
    { value: '2025', label: '2025' },
    { value: '2026', label: '2026' },
    { value: '2027', label: '2027' },
  ], []);

  const ramosOptions = useMemo<OptionItem[]>(() => [
    { value: '', label: 'Todos' },
    ...ramos,
  ], [ramos]);

  const resumo = useMemo(() => {
    const total = linhas.reduce((sum, item) => sum + item.TOTAL, 0);
    const clientesFora = new Set(
      linhas
        .filter((item) => item.NA_CARTEIRA.toLowerCase() === 'nao')
        .map((item) => item.CODCLI),
    );

    return {
      totalGeral: total,
      totalAtribuido: total,
      totalClientesFora: clientesFora.size,
    };
  }, [linhas]);

  const buscar = useCallback(async () => {
    if (!vendedorId) {
      addToast('error', 'Selecione um vendedor antes de buscar.');
      return;
    }

    setLoadingTabela(true);
    try {
      const result = await callSFWithMeta(SF.adminAcompSemanalListar, {
        userId: vendedorId,
        mes,
        ano,
        ramoCliente,
      });

      if (result.error) throw new Error(result.error);
      setLinhas((result.rows || []).map(parseLinha));
    } catch (error) {
      setLinhas([]);
      addToast('error', error instanceof Error ? error.message : 'Falha ao buscar acompanhamento semanal admin.');
    } finally {
      setLoadingTabela(false);
    }
  }, [addToast, ano, mes, ramoCliente, vendedorId]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      const [usuarioResp, vendedoresResp, ramosResp] = await Promise.allSettled([
        callSF(SF.dadosUsuarioLogado),
        callSF(SF.adminListarVendedores),
        callSF(SF.listarRamosClientesTotvs),
      ]);

      if (!mounted) return;

      const usuario = usuarioResp.status === 'fulfilled' ? usuarioResp.value?.[0] : null;
      const email = String(usuario?.DESCR || usuario?.EMAIL || '').trim().toLowerCase();
      const isAdmin = email === ADMIN_EMAIL;

      setUsuarioEmail(email);
      setAuthorized(isAdmin);

      if (isAdmin && vendedoresResp.status === 'fulfilled') {
        const options = (vendedoresResp.value || []).map((row: any) => ({
          value: String(row.USER_ID),
          label: `${row.NOME || row.EMAIL || `Usuário ${row.USER_ID}`} (${row.USER_ID})`,
        }));
        setVendedores(options);
        if (options.length > 0) setVendedorId((current) => current || options[0].value);
      }

      if (isAdmin && ramosResp.status === 'fulfilled') {
        const seen = new Set<string>();
        const options: OptionItem[] = [];
        for (const row of ramosResp.value || []) {
          const nome = String(row.NOME || '').trim();
          if (!nome) continue;
          const key = nome.toUpperCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({ value: nome, label: nome });
        }
        setRamos(options);
      }

      setLoading(false);
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#fff4dc', color: '#a26a00' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Acomp. Semanal — Admin</h1>
            <p className="mt-1 text-lg" style={{ color: '#636d63' }}>Esta página é restrita ao usuário {ADMIN_EMAIL}.</p>
          </div>
        </div>
        <p className="mt-4 text-sm" style={{ color: '#7b857b' }}>Usuário atual: <strong>{usuarioEmail || 'não identificado'}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold mb-3" style={{ backgroundColor: '#e6f4ea', color: '#1f7d3f' }}>
            <ShieldCheck size={16} /> Validação interna
          </div>
          <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Acomp. Semanal — Admin</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>
            Conferência das compras atribuídas por BU_VENDEDOR, incluindo clientes fora da carteira.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-5">
        <SummaryCard title="Total geral do período" value={formatCurrency(resumo.totalGeral)} helper={`${linhas.length} linha(s) encontradas`} icon={<WalletCards size={22} />} />
        <SummaryCard title="Total via BU_VENDEDOR" value={formatCurrency(resumo.totalAtribuido)} helper="Soma atribuída pelo escopo BU" icon={<ShieldCheck size={22} />} />
        <SummaryCard title="Clientes fora da carteira" value={String(resumo.totalClientesFora)} helper="Com compra no período selecionado" icon={<Users size={22} />} />
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex flex-wrap gap-3 items-center">
          <FilterDropdown label="Vendedor" value={vendedorId} options={vendedores} onChange={setVendedorId} widthClass="min-w-[310px]" />
          <FilterDropdown label="Mês" value={mes} options={mesesOptions} onChange={setMes} widthClass="min-w-[180px]" />
          <FilterDropdown label="Ano" value={ano} options={anosOptions} onChange={setAno} widthClass="min-w-[140px]" />
          <FilterDropdown label="Ramo" value={ramoCliente} options={ramosOptions} onChange={setRamoCliente} widthClass="min-w-[260px]" />
          <button
            type="button"
            onClick={buscar}
            disabled={loadingTabela || vendedores.length === 0}
            className="h-11 rounded-2xl px-5 text-sm font-bold inline-flex items-center gap-2"
            style={{
              backgroundColor: loadingTabela || vendedores.length === 0 ? '#d9e2d7' : '#137432',
              color: loadingTabela || vendedores.length === 0 ? '#5f6a5d' : '#ffffff',
              cursor: loadingTabela || vendedores.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <Search size={17} />
            {loadingTabela ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Resultados</h2>
          {loadingTabela ? <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #d5dbd3', borderTopColor: '#137432' }} /> : null}
        </div>

        {linhas.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#ffffff', color: '#6e786d' }}>
            Nenhum registro encontrado. Selecione os filtros e clique em Buscar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">CLIENTE</th>
                  <th className="px-3 py-3">CODCLI</th>
                  <th className="px-3 py-3">RAMO_CLIENTE</th>
                  <th className="px-3 py-3">SEMANA</th>
                  <th className="px-3 py-3">TOTAL</th>
                  <th className="px-3 py-3">VENDEDOR TOTVS (COD_RCA)</th>
                  <th className="px-3 py-3">VENDEDOR BU (via BU_VENDEDOR)</th>
                  <th className="px-3 py-3">NA CARTEIRA?</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, index) => {
                  const foraCarteira = linha.NA_CARTEIRA.toLowerCase() === 'nao';
                  return (
                    <tr key={`${linha.CODCLI}-${linha.SEMANA}-${linha.COD_RCA || 'sem-rca'}-${index}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                      <td className="px-3 py-3 text-sm font-semibold whitespace-nowrap" style={{ color: '#2a312a' }}>
                        <span className="text-xs text-gray-400 mr-1">[{linha.CODCLI}]</span>
                        <span>{linha.CLIENTE}</span>
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.CODCLI || '-'}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.RAMO_CLIENTE}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{formatSemana(linha.SEMANA)}</td>
                      <td className="px-3 py-3 text-sm font-bold" style={{ color: '#1f6f39' }}>{formatCurrency(linha.TOTAL)}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.COD_RCA || '-'}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.VENDEDOR_BU_NOME} ({linha.VENDEDOR_BU_USER_ID})</td>
                      <td className="px-3 py-3">
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ backgroundColor: foraCarteira ? '#fff4dc' : '#e6f4ea', color: foraCarteira ? '#a26a00' : '#1f7d3f' }}
                        >
                          {foraCarteira ? 'Não' : 'Sim'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
