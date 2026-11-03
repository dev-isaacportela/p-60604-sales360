import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Search, UserCheck } from 'lucide-react';
import { callSF, callSFSingle, callSFWithMeta, SF } from '../hooks/useMitra';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const PAGE_SIZE = 30;

interface PermissaoGestor {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface FiltroEscopo {
  CODFILIAL: string;
  FILIAL: string;
  CODEPTO: string;
  DEPARTAMENTO: string;
}

interface Combinacao {
  ID_CLIENTE: number;
  CODCLI: number | null;
  CLIENTE: string;
  CODFILIAL: string;
  FILIAL: string;
  CODEPTO: string;
  DEPARTAMENTO: string;
  ID_SECAO: number | null;
  SECAO: string;
  N_SECOES: number;
  N_CANDIDATOS: number;
  CANDIDATOS: string;
  TITULAR_ID: number | null;
  TITULAR: string | null;
  ORIGEM: string | null;
  ATUALIZADO_EM: string | null;
  SITUACAO: string;
  VALOR_12M: number;
}

interface Option {
  value: string;
  label: string;
}

const SITUACAO_OPTIONS: Option[] = [
  { value: 'PENDENTE', label: 'Pendentes (empate)' },
  { value: 'DEFINIDO', label: 'Com titular' },
  { value: 'MANUAL', label: 'Definidos manualmente' },
  { value: 'AUTO', label: 'Definidos automaticamente' },
  { value: '', label: 'Todas' },
];

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoeda(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function parseCandidatos(raw: string): Option[] {
  return String(raw || '').split('|').filter(Boolean).map((item) => {
    const idx = item.indexOf(':');
    return { value: item.slice(0, idx), label: item.slice(idx + 1) || `Usuário ${item.slice(0, idx)}` };
  });
}

function chave(row: Combinacao) {
  return `${row.ID_CLIENTE}-${row.CODFILIAL}-${row.CODEPTO}-${row.ID_SECAO}`;
}

function DropdownFilter({ label, value, options, onChange, minWidth = 190, placeholder = 'Todos' }: { label?: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value)?.label || placeholder;

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
        className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3 w-full"
        style={{ minWidth, backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
      >
        <span className="truncate">{label ? `${label}: ` : ''}{selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute left-0 mt-2 w-[280px] max-h-[300px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          {options.map((option) => (
            <button
              type="button"
              key={`${label || 'opt'}-${option.value || 'all'}`}
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

function SituacaoBadge({ row }: { row: Combinacao }) {
  if (row.SITUACAO === 'PENDENTE') {
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#fff4dc', color: '#8a5600' }}><AlertTriangle size={12} /> Pendente</span>;
  }
  if (row.SITUACAO === 'DEFINIDO') {
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><CheckCircle2 size={12} /> {row.ORIGEM === 'MANUAL' ? 'Manual' : 'Automático'}</span>;
  }
  if (row.SITUACAO === 'MISTO') {
    return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#e8eef8', color: '#2f5b9a' }}>Titulares diferentes por seção</span>;
  }
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#eef2eb', color: '#657063' }}>Sem titular</span>;
}

export default function GestaoTitularesPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [permissao, setPermissao] = useState<PermissaoGestor | null>(null);
  const [filtrosEscopo, setFiltrosEscopo] = useState<FiltroEscopo[]>([]);
  const [codFilial, setCodFilial] = useState('');
  const [codepto, setCodepto] = useState('');
  const [situacao, setSituacao] = useState('PENDENTE');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [rows, setRows] = useState<Combinacao[]>([]);
  const [totais, setTotais] = useState({ TOTAL: 0, PENDENTES: 0, DEFINIDOS: 0, CLIENTES_PENDENTES: 0, GERAL: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
  const totalPages = Math.max(1, Math.ceil(totais.TOTAL / PAGE_SIZE));

  const filialOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    filtrosEscopo.forEach((f) => map.set(f.CODFILIAL, f.FILIAL));
    return [{ value: '', label: 'Todas' }, ...Array.from(map, ([value, label]) => ({ value, label }))];
  }, [filtrosEscopo]);

  const deptoOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    filtrosEscopo.filter((f) => !codFilial || f.CODFILIAL === codFilial).forEach((f) => map.set(f.CODEPTO, f.DEPARTAMENTO));
    return [{ value: '', label: 'Todos' }, ...Array.from(map, ([value, label]) => ({ value, label }))];
  }, [filtrosEscopo, codFilial]);

  async function carregar(nextPage = page) {
    setLoading(true);
    setErro('');
    const input = { codFilial, codepto, situacao, busca, limit: PAGE_SIZE, offset: nextPage * PAGE_SIZE };
    // Totais por situação ignoram o filtro de situação; o total paginado respeita
    const [listaResp, contarResp, resumoResp] = await Promise.allSettled([
      callSFWithMeta(SF.gestaoTitularesListar, input),
      callSFWithMeta(SF.gestaoTitularesContar, input),
      callSFWithMeta(SF.gestaoTitularesContar, { ...input, situacao: '' }),
    ]);
    if (listaResp.status === 'fulfilled') {
      setRows(listaResp.value.rows as Combinacao[]);
      if (listaResp.value.error) setErro(listaResp.value.error);
    }
    if (contarResp.status === 'fulfilled') {
      const t = contarResp.value.rows[0] || {};
      const r = resumoResp.status === 'fulfilled' ? (resumoResp.value.rows[0] || {}) : t;
      setTotais({ TOTAL: toNumber(t.TOTAL), PENDENTES: toNumber(r.PENDENTES), DEFINIDOS: toNumber(r.DEFINIDOS), CLIENTES_PENDENTES: toNumber(r.CLIENTES_PENDENTES), GERAL: toNumber(r.TOTAL) });
      if (contarResp.value.error) setErro(contarResp.value.error);
    }
    setEscolhas({});
    setLoading(false);
  }

  async function salvarTitular(row: Combinacao) {
    const key = chave(row);
    const vendedorId = escolhas[key];
    if (!vendedorId) return;
    setSalvando(key);
    setStatusMsg('');
    setErro('');
    try {
      const response = await executeServerFunctionMitra({
        projectId: PROJECT_ID,
        serverFunctionId: SF.gestaoTitularesDefinir,
        input: { idCliente: String(row.ID_CLIENTE), codFilial: row.CODFILIAL, codepto: row.CODEPTO, idSecao: row.ID_SECAO == null ? '' : String(row.ID_SECAO), vendedorId },
      });
      const result = response?.result;
      if (result?.executionStatus !== 'COMPLETED' || result?.error) throw new Error(result?.error || 'Falha ao salvar titular.');
      let output: any = result.output;
      if (typeof output === 'string') { try { output = JSON.parse(output); } catch { /* mantém */ } }
      if (toNumber(output?.affectedRows) === 0) throw new Error('Titular não salvo: o vendedor precisa ter o cliente na carteira e esta seção no escopo, e a combinação precisa estar sob sua gestão.');
      const nome = parseCandidatos(row.CANDIDATOS).find((c) => c.value === vendedorId)?.label || 'vendedor';
      setStatusMsg(`${row.CLIENTE} · ${row.DEPARTAMENTO} / ${row.SECAO}: titular definido para ${nome}.`);
      await carregar(page);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar titular.');
    } finally {
      setSalvando(null);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const row = await callSFSingle(SF.painelCoordenadorPermissao);
      if (!active) return;
      setPermissao(row as PermissaoGestor | null);
      setLoadingPermissao(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!podeAcessar) return;
    callSF(SF.gestaoTitularesFiltros).then((data) => setFiltrosEscopo(data as FiltroEscopo[])).catch(() => setFiltrosEscopo([]));
  }, [podeAcessar]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBusca(buscaInput.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [buscaInput]);

  useEffect(() => {
    if (!podeAcessar) return;
    setPage(0);
    carregar(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAcessar, codFilial, codepto, situacao, busca]);

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
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Titulares de Clientes</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Esta tela está disponível apenas para coordenadores e diretoria.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>Perfil atual: <strong>{permissao?.CARGO_ATUAL || 'NÃO DEFINIDO'}</strong>.</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Pendentes', value: totais.PENDENTES, hint: `${totais.CLIENTES_PENDENTES} clientes com empate`, bg: '#fff4dc', color: '#8a5600', onClick: () => setSituacao('PENDENTE') },
    { label: 'Com titular', value: totais.DEFINIDOS, hint: 'Automáticos e manuais', bg: '#e6f4ea', color: '#137432', onClick: () => setSituacao('DEFINIDO') },
    { label: 'Combinações', value: totais.GERAL, hint: 'Cliente × filial × departamento (seção em Enfermagem)', bg: '#e8eef8', color: '#2f5b9a', onClick: () => setSituacao('') },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: '#137432' }}>Carteira por Departamento</p>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Titulares de Clientes</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>Defina qual vendedor é o dono de cada cliente em cada filial, departamento e seção.</p>
        </div>
        <button type="button" onClick={() => carregar(page)} disabled={loading} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-60" style={{ backgroundColor: '#137432' }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {kpis.map((kpi) => (
          <button key={kpi.label} type="button" onClick={kpi.onClick} className="text-left rounded-3xl p-5 transition-all duration-200 hover:-translate-y-0.5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
            <div className="flex items-center gap-3">
              <span className="rounded-full p-2" style={{ backgroundColor: kpi.bg, color: kpi.color }}><UserCheck size={18} /></span>
              <span className="text-sm font-semibold" style={{ color: '#515b51' }}>{kpi.label}</span>
            </div>
            <p className="font-display text-4xl font-extrabold mt-3" style={{ color: '#1b1c1a' }}>{kpi.value.toLocaleString('pt-BR')}</p>
            <p className="text-xs mt-1" style={{ color: '#7b857b' }}>{kpi.hint}</p>
          </button>
        ))}
      </div>

      <section className="rounded-3xl p-5 mb-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownFilter label="Situação" value={situacao} options={SITUACAO_OPTIONS} onChange={setSituacao} minWidth={250} placeholder="Todas" />
          <DropdownFilter label="Filial" value={codFilial} options={filialOptions} onChange={(v) => { setCodFilial(v); setCodepto(''); }} minWidth={180} placeholder="Todas" />
          <DropdownFilter label="Departamento" value={codepto} options={deptoOptions} onChange={setCodepto} minWidth={240} />
          <div className="h-11 min-w-[280px] flex-1 flex items-center gap-2 px-4 rounded-2xl" style={{ backgroundColor: '#eef2eb', border: '1px solid #d7dfd3' }}>
            <Search size={16} style={{ color: '#687366' }} />
            <input value={buscaInput} onChange={(e) => setBuscaInput(e.target.value)} placeholder="Buscar por cliente ou código" className="w-full bg-transparent outline-none text-sm" style={{ color: '#425242' }} />
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: '#7b857b' }}>
          Exceto em Enfermagem, o titular é definido por departamento e vale para todas as seções. Em Enfermagem, a definição é por seção. Enquanto uma combinação estiver pendente, o cliente continua aparecendo para todos os vendedores candidatos. Só aparecem como candidatos os vendedores que têm o cliente na carteira e aquela filial/departamento/seção no escopo (BUs e Vendedores).
        </p>
      </section>

      {erro ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fff4dc', color: '#8a5600', border: '1px solid #f2d499' }}>{erro}</div> : null}
      {statusMsg ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e6f4ea', color: '#137432', border: '1px solid #cde7d3' }}>{statusMsg}</div> : null}

      <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#eef2eb', color: '#515b51' }}>
                <th className="text-left font-semibold px-4 py-3">Cliente</th>
                <th className="text-left font-semibold px-4 py-3">Filial / Departamento / Seção</th>
                <th className="text-right font-semibold px-4 py-3">Venda 12m</th>
                <th className="text-left font-semibold px-4 py-3">Situação</th>
                <th className="text-left font-semibold px-4 py-3 min-w-[300px]">Titular</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: '#657063' }}><Loader2 size={18} className="animate-spin inline mr-2" />Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: '#657063' }}>
                  {situacao === 'PENDENTE' ? 'Nenhum empate pendente no filtro atual.' : 'Nenhuma combinação encontrada.'}
                </td></tr>
              ) : rows.map((row) => {
                const key = chave(row);
                const candidatos = parseCandidatos(row.CANDIDATOS);
                const escolhido = escolhas[key] ?? (row.TITULAR_ID ? String(row.TITULAR_ID) : '');
                const mudou = !!escolhas[key] && escolhas[key] !== String(row.TITULAR_ID || '');
                return (
                  <tr key={key} className="transition-colors hover:bg-[#f1f5ee]" style={{ borderTop: '1px solid #e3e8de' }}>
                    <td className="px-4 py-3">
                      <p className="font-bold" style={{ color: '#1b1c1a' }}>{row.CLIENTE}</p>
                      <p className="text-xs" style={{ color: '#7b857b' }}>Código {row.CODCLI ?? '-'}</p>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#425242' }}>
                      <p className="font-semibold">{row.FILIAL} · {row.DEPARTAMENTO}</p>
                      <p className="text-xs" style={{ color: '#7b857b' }}>{row.SECAO}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: toNumber(row.VALOR_12M) > 0 ? '#1b1c1a' : '#a0a89d' }}>{formatMoeda(toNumber(row.VALOR_12M))}</td>
                    <td className="px-4 py-3"><SituacaoBadge row={row} /></td>
                    <td className="px-4 py-3">
                      <DropdownFilter
                        value={escolhido}
                        options={candidatos}
                        onChange={(v) => setEscolhas((prev) => ({ ...prev, [key]: v }))}
                        minWidth={280}
                        placeholder={`Escolher entre ${candidatos.length} candidato(s)`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!mudou || salvando === key}
                        onClick={() => salvarTitular(row)}
                        className="h-11 px-4 rounded-2xl text-sm font-semibold text-white disabled:opacity-40 transition-all duration-200"
                        style={{ backgroundColor: '#137432' }}
                      >
                        {salvando === key ? 'Salvando...' : 'Salvar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderTop: '1px solid #e3e8de' }}>
          <div className="text-sm" style={{ color: '#4f5d4d' }}>Página {page + 1} de {totalPages} · {totais.TOTAL.toLocaleString('pt-BR')} combinações</div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0 || loading} onClick={() => { const next = Math.max(0, page - 1); setPage(next); carregar(next); }} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Anterior</button>
            <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => { const next = page + 1; setPage(next); carregar(next); }} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Próxima</button>
          </div>
        </div>
      </section>
    </div>
  );
}
