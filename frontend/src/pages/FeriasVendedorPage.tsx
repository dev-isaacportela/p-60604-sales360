import { useEffect, useMemo, useRef, useState } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plane, RefreshCw, SquareX } from 'lucide-react';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { callSF, callSFSingle, callSFWithMeta, formatDate, SF } from '../hooks/useMitra';
import { dedupeOptions } from '../lib/utils';

registerAllModules();

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

interface PermissaoCoordenador {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface VendedorOption {
  USER_ID: number;
  COD_RCA: number;
  RCA: string;
}

interface FeriasRow {
  AUTO_ID: number;
  COD_RCA: number;
  RCA: string;
  DT_INICIO: string;
  DT_FIM: string;
  COD_RCA_SUBSTITUTO: number;
  RCA_SUBSTITUTO: string;
  STATUS_FERIAS: string;
  CREATED_AT: string;
}

interface Option {
  value: string;
  label: string;
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCalendarBase(value: string) {
  if (isValidDate(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date();
}

function DatePickerField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => getCalendarBase(value));
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isValidDate(value)) setViewDate(getCalendarBase(value));
  }, [value]);

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

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(viewDate);
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 ? day : null;
  });

  function changeMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function selectDay(day: number) {
    onChange(toDateInputValue(new Date(viewDate.getFullYear(), viewDate.getMonth(), day)));
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-11 w-full px-4 rounded-2xl text-sm outline-none flex items-center justify-between gap-3" style={{ backgroundColor: '#eef2eb', color: value ? '#425242' : '#9aa59a', border: '1px solid #d7dfd3' }}>
        <span>{value || placeholder}</span>
        <CalendarDays size={16} style={{ color: '#657063' }} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl p-3 z-40 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#eef2eb', color: '#425242' }} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold capitalize" style={{ color: '#1b1c1a' }}>{monthLabel}</span>
            <button type="button" onClick={() => changeMonth(1)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#eef2eb', color: '#425242' }} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => (
              <div key={`${day}-${index}`} className="h-7 flex items-center justify-center text-[11px] font-bold" style={{ color: '#7b857b' }}>{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              const currentValue = day ? toDateInputValue(new Date(viewDate.getFullYear(), viewDate.getMonth(), day)) : '';
              const selected = currentValue === value;
              return day ? (
                <button key={currentValue} type="button" onClick={() => selectDay(day)} className="h-8 rounded-xl text-sm font-semibold transition-all" style={{ backgroundColor: selected ? '#137432' : '#f3f6f1', color: selected ? '#ffffff' : '#425242' }}>
                  {day}
                </button>
              ) : (
                <div key={`empty-${index}`} className="h-8" />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DropdownFilter({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value)?.label || 'Selecione';

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
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-11 w-full px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}>
        <span className="truncate">{label}: {selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-full min-w-[300px] max-h-[300px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          {options.map((option) => (
            <button key={`${label}-${option.value}`} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className="w-full text-left rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: value === option.value ? '#dfeadf' : 'transparent', color: value === option.value ? '#1f6f39' : '#4e5a4e', fontWeight: value === option.value ? 700 : 500 }}>
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
  let output = response?.result?.output;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { /* keep as string */ }
  }
  // INSERT/UPDATE fora do escopo do usuario conclui sem erro, mas sem afetar linhas.
  if (output && typeof output === 'object' && Number((output as any).rowCount) === 0) {
    throw new Error('Nenhum registro foi gravado. Verifique se o vendedor e o substituto estão dentro do seu escopo.');
  }
}

function vendedorLabel(vendedor: VendedorOption) {
  return String(vendedor.RCA || '').trim() || `Vendedor ${vendedor.COD_RCA}`;
}

export default function FeriasVendedorPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoCoordenador | null>(null);
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);
  const [ferias, setFerias] = useState<FeriasRow[]>([]);
  const [codRca, setCodRca] = useState('');
  const [codRcaSubstituto, setCodRcaSubstituto] = useState('');
  const [dtInicio, setDtInicio] = useState('');
  const [dtFim, setDtFim] = useState('');
  const [selected, setSelected] = useState<FeriasRow | null>(null);
  const [erro, setErro] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;

  // A SF de escopo devolve uma linha por combinacao filial/departamento/secao,
  // entao o mesmo vendedor vinha repetido varias vezes na lista.
  const vendedorOptions = useMemo<Option[]>(() => dedupeOptions(vendedores.map((vendedor) => ({
    value: String(vendedor.COD_RCA),
    label: vendedorLabel(vendedor),
  }))), [vendedores]);

  const tableRows = useMemo(() => ferias.map((row) => ({
    RCA: `${row.COD_RCA} · ${row.RCA || 'Sem nome'}`,
    DT_INICIO: formatDate(row.DT_INICIO || ''),
    DT_FIM: formatDate(row.DT_FIM || ''),
    SUBSTITUTO: `${row.COD_RCA_SUBSTITUTO} · ${row.RCA_SUBSTITUTO || 'Sem nome'}`,
    STATUS_FERIAS: row.STATUS_FERIAS || '-',
    CREATED_AT: formatDate(row.CREATED_AT || ''),
  })), [ferias]);

  async function carregarDados() {
    setLoadingDados(true);
    setErro('');
    const [vendedoresResp, feriasResp] = await Promise.allSettled([
      callSF(SF.gestaoCarteiraCoordenadorVendedores),
      callSFWithMeta(SF.feriasVendedorListar),
    ]);
    if (vendedoresResp.status === 'fulfilled') setVendedores(vendedoresResp.value as VendedorOption[]);
    if (feriasResp.status === 'fulfilled') {
      setFerias(feriasResp.value.rows as FeriasRow[]);
      if (feriasResp.value.error) setErro(feriasResp.value.error);
    }
    setSelected(null);
    setLoadingDados(false);
  }

  async function cadastrarFerias() {
    setErro('');
    setStatusMsg('');
    if (!codRca || !codRcaSubstituto) {
      setErro('Selecione o vendedor e o substituto.');
      return;
    }
    if (codRca === codRcaSubstituto) {
      setErro('O substituto deve ser diferente do vendedor em férias.');
      return;
    }
    if (!isValidDate(dtInicio) || !isValidDate(dtFim)) {
      setErro('Informe as datas no formato AAAA-MM-DD.');
      return;
    }
    if (dtInicio > dtFim) {
      setErro('A data de início deve ser anterior ou igual à data de fim.');
      return;
    }
    try {
      await runMutation(SF.feriasVendedorCadastrar, { codRca, codRcaSubstituto, dtInicio, dtFim });
      setStatusMsg('Férias cadastradas. O substituto já passa a ver a carteira do vendedor durante o período.');
      setCodRca('');
      setCodRcaSubstituto('');
      setDtInicio('');
      setDtFim('');
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao cadastrar férias.');
    }
  }

  async function encerrarFerias() {
    if (!selected) return;
    setErro('');
    setStatusMsg('');
    try {
      await runMutation(SF.feriasVendedorEncerrar, { feriasId: selected.AUTO_ID });
      setStatusMsg('Férias encerradas antecipadamente.');
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao encerrar férias.');
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
    carregarDados();
  }, [podeAcessar]);

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
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Férias de Vendedores</h1>
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
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Férias de Vendedores</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>Cadastre férias e defina substitutos para preservar a cobertura de carteira.</p>
        </div>
        <button type="button" onClick={carregarDados} disabled={loadingDados} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-60" style={{ backgroundColor: '#137432' }}>
          {loadingDados ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </div>

      {erro ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fff4dc', color: '#8a5600', border: '1px solid #f2d499' }}>{erro}</div> : null}
      {statusMsg ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e6f4ea', color: '#137432', border: '1px solid #cde7d3' }}>{statusMsg}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-5">
        <section className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><Plane size={22} /></div>
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Cadastrar férias</h2>
          <p className="text-sm mt-1 mb-4" style={{ color: '#657063' }}>Use datas no formato AAAA-MM-DD.</p>
          <div className="space-y-3">
            <DropdownFilter label="Vendedor" value={codRca} options={vendedorOptions} onChange={setCodRca} />
            <DropdownFilter label="Substituto" value={codRcaSubstituto} options={vendedorOptions} onChange={setCodRcaSubstituto} />
            <DatePickerField value={dtInicio} onChange={setDtInicio} placeholder="Data início: AAAA-MM-DD" />
            <DatePickerField value={dtFim} onChange={setDtFim} placeholder="Data fim: AAAA-MM-DD" />
          </div>
          <button type="button" onClick={cadastrarFerias} disabled={loadingDados} className="mt-4 w-full h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#137432' }}>Cadastrar férias</button>
        </section>

        <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#e3e8de' }}>
            <div>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Férias ativas e futuras</h2>
              <p className="text-sm mt-1" style={{ color: '#657063' }}>Selecione uma linha para encerrar antecipadamente.</p>
            </div>
            <button type="button" onClick={encerrarFerias} disabled={!selected || loadingDados} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-50" style={{ backgroundColor: '#b42318' }}>
              <SquareX size={16} />
              Encerrar selecionada
            </button>
          </div>
          <div className="validation-hot-wrapper">
            <HotTable
              data={tableRows}
              columns={[
                { data: 'RCA', width: 260 },
                { data: 'DT_INICIO', width: 120 },
                { data: 'DT_FIM', width: 120 },
                { data: 'SUBSTITUTO', width: 260 },
                { data: 'STATUS_FERIAS', width: 110 },
                { data: 'CREATED_AT', width: 120 },
              ]}
              colHeaders={['Vendedor', 'Início', 'Fim', 'Substituto', 'Status', 'Criado em']}
              rowHeaders
              height={430}
              width="100%"
              stretchH="none"
              manualColumnResize
              columnSorting={{ indicator: true, headerAction: true }}
              afterSelectionEnd={(row) => setSelected(ferias[row] || null)}
              readOnly
              licenseKey="non-commercial-and-evaluation"
              className="ht-theme-main"
            />
          </div>
        </section>
      </div>

      <div className="mt-5 rounded-3xl p-5 flex items-start gap-3" style={{ backgroundColor: '#fff8f1', border: '1px solid #f0dfcc' }}>
        <CalendarDays size={20} style={{ color: '#a26a00' }} />
        <p className="text-sm" style={{ color: '#6f563b' }}>
          A aplicação da substituição automática nas telas existentes será feita na Parte 6, quando os ajustes globais de menu e visibilidade forem executados.
        </p>
      </div>
    </div>
  );
}
