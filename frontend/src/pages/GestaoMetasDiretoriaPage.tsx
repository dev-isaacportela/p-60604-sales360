import { useEffect, useMemo, useRef, useState } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { ChevronDown, Loader2, RefreshCw, Save, Target } from 'lucide-react';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { callSF, callSFSingle, callSFWithMeta, formatCurrency, formatDate, SF } from '../hooks/useMitra';

registerAllModules();

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

interface PermissaoDiretoria {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface BuOption {
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
}

interface MetaComparativo {
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
  MES: number;
  ANO: number;
  META_VALOR: number;
  FATURAMENTO_BRUTO: number;
  DEVOLVIDO: number;
  REALIZADO_LIQUIDO: number;
  PERCENTUAL_META: number;
}

interface MetaHistorico {
  AUTO_ID: number;
  CODFILIAL: number;
  CODEPTO: number;
  MES: number;
  ANO: number;
  META_VALOR: number;
  CRIADO_POR: string;
  CREATED_AT: string;
  UPDATED_AT: string;
}

interface Option {
  value: string;
  label: string;
}

const MONTHS: Option[] = [
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
];

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function currentPeriod() {
  const now = new Date();
  return { mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) };
}

function parseBu(value: string) {
  const [codfilial, codepto] = value.split('|');
  return { codfilial, codepto };
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
        <div className="absolute right-0 mt-2 w-full min-w-[280px] max-h-[300px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
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
}

export default function GestaoMetasDiretoriaPage() {
  const initialPeriod = currentPeriod();
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoDiretoria | null>(null);
  const [bus, setBus] = useState<BuOption[]>([]);
  const [comparativo, setComparativo] = useState<MetaComparativo[]>([]);
  const [historico, setHistorico] = useState<MetaHistorico[]>([]);
  const [mes, setMes] = useState(initialPeriod.mes);
  const [ano, setAno] = useState(initialPeriod.ano);
  const [buSelecionada, setBuSelecionada] = useState('');
  const [formBu, setFormBu] = useState('');
  const [formMes, setFormMes] = useState(initialPeriod.mes);
  const [formAno, setFormAno] = useState(initialPeriod.ano);
  const [metaValor, setMetaValor] = useState('');
  const [erro, setErro] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;

  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => String(base - 3 + index)).map((year) => ({ value: year, label: year }));
  }, []);

  const buOptions = useMemo<Option[]>(() => bus.map((bu) => ({
    value: `${bu.CODFILIAL}|${bu.CODEPTO}`,
    label: `Filial ${bu.CODFILIAL} · Depto ${bu.CODEPTO} — ${bu.DEPARTAMENTO || 'Sem descrição'}`,
  })), [bus]);

  const buFilterOptions = useMemo<Option[]>(() => [{ value: '', label: 'Todas' }, ...buOptions], [buOptions]);

  const comparativoFiltrado = useMemo(() => {
    if (!buSelecionada) return comparativo;
    const { codfilial, codepto } = parseBu(buSelecionada);
    return comparativo.filter((row) => String(row.CODFILIAL) === codfilial && String(row.CODEPTO) === codepto);
  }, [buSelecionada, comparativo]);

  const comparativoRows = useMemo(() => comparativoFiltrado.map((row) => ({
    BU: `Filial ${row.CODFILIAL} · Depto ${row.CODEPTO}`,
    DEPARTAMENTO: row.DEPARTAMENTO,
    META_VALOR: formatCurrency(toNumber(row.META_VALOR)),
    FATURAMENTO_BRUTO: formatCurrency(toNumber(row.FATURAMENTO_BRUTO)),
    DEVOLVIDO: formatCurrency(toNumber(row.DEVOLVIDO)),
    REALIZADO_LIQUIDO: formatCurrency(toNumber(row.REALIZADO_LIQUIDO)),
    PERCENTUAL_META: formatPercent(toNumber(row.PERCENTUAL_META)),
  })), [comparativoFiltrado]);

  const historicoRows = useMemo(() => historico.map((row) => ({
    BU: `Filial ${row.CODFILIAL} · Depto ${row.CODEPTO}`,
    PERIODO: `${String(row.MES).padStart(2, '0')}/${row.ANO}`,
    META_VALOR: formatCurrency(toNumber(row.META_VALOR)),
    CRIADO_POR: row.CRIADO_POR || '-',
    CREATED_AT: formatDate(row.CREATED_AT || ''),
    UPDATED_AT: formatDate(row.UPDATED_AT || ''),
  })), [historico]);

  async function carregarDados() {
    setLoadingDados(true);
    setErro('');
    const { codfilial, codepto } = parseBu(buSelecionada);
    const [busResp, comparativoResp, historicoResp] = await Promise.allSettled([
      callSF(SF.gestaoMetasDiretoriaBus),
      callSFWithMeta(SF.gestaoMetasDiretoriaListar, { mes, ano }),
      callSFWithMeta(SF.gestaoMetasDiretoriaHistorico, { codfilial: codfilial || '', codepto: codepto || '', ano }),
    ]);
    if (busResp.status === 'fulfilled') setBus(busResp.value as BuOption[]);
    if (comparativoResp.status === 'fulfilled') {
      setComparativo(comparativoResp.value.rows as MetaComparativo[]);
      if (comparativoResp.value.error) setErro(comparativoResp.value.error);
    }
    if (historicoResp.status === 'fulfilled') {
      setHistorico(historicoResp.value.rows as MetaHistorico[]);
      if (historicoResp.value.error) setErro(historicoResp.value.error);
    }
    setLoadingDados(false);
  }

  function preencherFormulario(row: MetaComparativo) {
    setFormBu(`${row.CODFILIAL}|${row.CODEPTO}`);
    setFormMes(String(row.MES));
    setFormAno(String(row.ANO));
    setMetaValor(String(toNumber(row.META_VALOR)).replace('.', ','));
  }

  async function salvarMeta() {
    setErro('');
    setStatusMsg('');
    if (!formBu) {
      setErro('Selecione uma BU.');
      return;
    }
    const normalizedValue = metaValor.replace(/\./g, '').replace(',', '.').trim();
    if (!normalizedValue || Number.isNaN(Number(normalizedValue))) {
      setErro('Informe um valor de meta válido.');
      return;
    }
    const { codfilial, codepto } = parseBu(formBu);
    try {
      await runMutation(SF.gestaoMetasDiretoriaSalvar, { codfilial, codepto, mes: formMes, ano: formAno, metaValor: normalizedValue });
      setStatusMsg('Meta salva com sucesso.');
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar meta.');
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingPermissao(true);
      const row = await callSFSingle(SF.gestaoMetasDiretoriaPermissao);
      if (!active) return;
      setPermissao(row as PermissaoDiretoria | null);
      setLoadingPermissao(false);
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!podeAcessar) return;
    carregarDados();
  }, [podeAcessar, mes, ano, buSelecionada]);

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
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Metas</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Esta tela está disponível apenas para o perfil Diretoria.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>Perfil atual: <strong>{permissao?.CARGO_ATUAL || 'NÃO DEFINIDO'}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: '#137432' }}>Camada Diretoria</p>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Metas</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>Metas mensais por BU com comparativo meta vs realizado.</p>
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
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><Target size={22} /></div>
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Cadastrar ou editar meta</h2>
          <p className="text-sm mt-1 mb-4" style={{ color: '#657063' }}>Clique em uma linha do comparativo para carregar a BU no formulário.</p>
          <div className="space-y-3">
            <DropdownFilter label="BU" value={formBu} options={buOptions} onChange={setFormBu} />
            <DropdownFilter label="Mês" value={formMes} options={MONTHS} onChange={setFormMes} />
            <DropdownFilter label="Ano" value={formAno} options={yearOptions} onChange={setFormAno} />
            <input value={metaValor} onChange={(event) => setMetaValor(event.target.value)} placeholder="Meta em R$" className="h-11 w-full px-4 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }} />
          </div>
          <button type="button" onClick={salvarMeta} disabled={loadingDados} className="mt-4 w-full h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ backgroundColor: '#137432' }}><Save size={16} />Salvar meta</button>
        </section>

        <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#e3e8de' }}>
            <div>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Comparativo meta vs realizado</h2>
              <p className="text-sm mt-1" style={{ color: '#657063' }}>Selecione período e BU para analisar meta, bruto, devolvido e líquido.</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <DropdownFilter label="Mês" value={mes} options={MONTHS} onChange={setMes} />
              <DropdownFilter label="Ano" value={ano} options={yearOptions} onChange={setAno} />
              <DropdownFilter label="BU" value={buSelecionada} options={buFilterOptions} onChange={setBuSelecionada} />
            </div>
          </div>
          <div className="validation-hot-wrapper">
            <HotTable
              data={comparativoRows}
              columns={[
                { data: 'BU', width: 170 },
                { data: 'DEPARTAMENTO', width: 220 },
                { data: 'META_VALOR', width: 140 },
                { data: 'FATURAMENTO_BRUTO', width: 150 },
                { data: 'DEVOLVIDO', width: 130 },
                { data: 'REALIZADO_LIQUIDO', width: 150 },
                { data: 'PERCENTUAL_META', width: 120 },
              ]}
              colHeaders={['BU', 'Departamento', 'Meta', 'Bruto', 'Devolvido', 'Realizado Líquido', '% Meta']}
              rowHeaders
              height={360}
              width="100%"
              stretchH="none"
              manualColumnResize
              columnSorting={{ indicator: true, headerAction: true }}
              afterSelectionEnd={(row) => {
                const selected = comparativoFiltrado[row];
                if (selected) preencherFormulario(selected);
              }}
              readOnly
              licenseKey="non-commercial-and-evaluation"
              className="ht-theme-main"
            />
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-3xl overflow-hidden" style={{ backgroundColor: '#fff8f1', border: '1px solid #f0dfcc', boxShadow: '0 14px 30px rgba(88,55,21,0.07)' }}>
        <div className="p-5 border-b" style={{ borderColor: '#f0dfcc' }}>
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#281b10' }}>Histórico de metas</h2>
          <p className="text-sm mt-1" style={{ color: '#6f563b' }}>Histórico filtrado pelo ano e pela BU selecionados no comparativo.</p>
        </div>
        <div className="validation-hot-wrapper">
          <HotTable
            data={historicoRows}
            columns={[
              { data: 'BU', width: 170 },
              { data: 'PERIODO', width: 110 },
              { data: 'META_VALOR', width: 140 },
              { data: 'CRIADO_POR', width: 210 },
              { data: 'CREATED_AT', width: 120 },
              { data: 'UPDATED_AT', width: 120 },
            ]}
            colHeaders={['BU', 'Período', 'Meta', 'Criado por', 'Criado em', 'Atualizado em']}
            rowHeaders
            height={300}
            width="100%"
            stretchH="none"
            manualColumnResize
            columnSorting={{ indicator: true, headerAction: true }}
            readOnly
            licenseKey="non-commercial-and-evaluation"
            className="ht-theme-main"
          />
        </div>
      </section>
    </div>
  );
}
