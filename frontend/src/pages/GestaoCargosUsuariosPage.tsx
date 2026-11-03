import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { BriefcaseBusiness, ChevronDown, Loader2, RefreshCw, Save, Search, ShieldCheck, Target, UserCog, Users } from 'lucide-react';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { callSFSingle, callSFWithMeta, SF } from '../hooks/useMitra';

registerAllModules();

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

type CargoOperacional = 'DIRETORIA' | 'COORDENADOR' | 'VENDEDOR';

interface PermissaoCargos {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface ResumoCargos {
  TOTAL_DIRETORIA: number;
  TOTAL_COORDENADORES: number;
  TOTAL_VENDEDORES: number;
  TOTAL_OUTROS: number;
  TOTAL_USUARIOS: number;
}

interface UsuarioCargoRow {
  USER_ID: number;
  NOME: string;
  EMAIL: string;
  CARGO: CargoOperacional | string;
  ATUALIZADO_EM: string;
  RCAS: string;
  COD_SUPERVISOR: number | null;
  NOME_COORDENADOR: string;
  COORDENADOR_ATIVO: number;
}

interface Option {
  value: string;
  label: string;
}

const CARGO_OPTIONS: Option[] = [
  { value: '', label: 'Todos os papéis' },
  { value: 'DIRETORIA', label: 'Diretoria' },
  { value: 'COORDENADOR', label: 'Coordenadores' },
  { value: 'VENDEDOR', label: 'Vendedores' },
];

const CARGO_ACTIONS: { value: CargoOperacional; label: string; description: string }[] = [
  { value: 'DIRETORIA', label: 'Diretoria', description: 'Acesso às telas executivas e gestão de papéis.' },
  { value: 'COORDENADOR', label: 'Coordenador', description: 'Acesso aos painéis de coordenação. BUs continuam na Gestão Coordenadores.' },
  { value: 'VENDEDOR', label: 'Vendedor', description: 'Perfil operacional padrão para carteira, visitas e metas individuais.' },
];

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(toNumber(value));
}

function DropdownFilter({ label, value, options, onChange, minWidth = 220 }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number }) {
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
    <div className="relative" ref={ref} style={{ minWidth }}>
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-10 w-full px-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-2" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
        <span className="truncate">{selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-full min-w-[240px] max-h-[280px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          {options.map((option) => (
            <button key={`${label}-${option.value || 'all'}`} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className="w-full text-left rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: value === option.value ? '#dfeadf' : 'transparent', color: value === option.value ? '#1f6f39' : '#4e5a4e', fontWeight: value === option.value ? 700 : 500 }}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, helper, icon, tone = 'green' }: { label: string; value: string; helper: string; icon: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'purple' }) {
  const tones = {
    green: { bg: 'var(--kpi-bg-green)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
    blue: { bg: 'var(--kpi-bg-blue)', color: '#2d5cc5', border: '#2d5cc5' },
    amber: { bg: 'var(--kpi-bg-amber)', color: '#a46a18', border: '#a46a18' },
    purple: { bg: 'var(--kpi-bg-purple)', color: '#6f3db3', border: '#6f3db3' },
  }[tone];

  return (
    <div className="rounded-[22px] p-4 analytics-soft-card relative overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tones.border }} />
      <div className="flex items-start gap-3">
        <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: tones.bg, color: tones.color }}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] label-ui font-semibold" style={{ color: '#8c9489' }}>{label}</p>
          <p className="text-[25px] leading-tight font-extrabold mt-1" style={{ color: 'var(--color-text)' }}>{value}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{helper}</p>
        </div>
      </div>
    </div>
  );
}

async function runMutation(sfId: number, input: Record<string, any>) {
  const response = await executeServerFunctionMitra({ projectId: PROJECT_ID, serverFunctionId: sfId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Execução finalizada com status ${status}`);
}

export default function GestaoCargosUsuariosPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoCargos | null>(null);
  const [resumo, setResumo] = useState<ResumoCargos | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioCargoRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UsuarioCargoRow | null>(null);
  const [cargoSelecionado, setCargoSelecionado] = useState<CargoOperacional>('VENDEDOR');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;

  const usuarioRows = useMemo(() => usuarios.map((row) => ({
    USER_ID: row.USER_ID,
    NOME: row.NOME || '-',
    EMAIL: row.EMAIL || '-',
    CARGO: row.CARGO || 'VENDEDOR',
    RCAS: row.RCAS || '-',
    COORDENADOR: row.COD_SUPERVISOR ? `${row.COD_SUPERVISOR} · ${row.NOME_COORDENADOR || row.NOME}` : '-',
    ATUALIZADO_EM: row.ATUALIZADO_EM || '-',
  })), [usuarios]);

  async function carregarDados(nextCargo = filtroCargo, nextBusca = busca) {
    setLoadingDados(true);
    setErro('');
    const [resumoResp, usuariosResp] = await Promise.allSettled([
      callSFWithMeta(SF.gestaoCargosUsuariosResumo),
      callSFWithMeta(SF.gestaoCargosUsuariosListar, { cargo: nextCargo, busca: nextBusca.trim() }),
    ]);
    if (resumoResp.status === 'fulfilled') {
      setResumo((resumoResp.value.rows[0] as ResumoCargos) || null);
      if (resumoResp.value.error) setErro(resumoResp.value.error);
    }
    if (usuariosResp.status === 'fulfilled') {
      setUsuarios(usuariosResp.value.rows as UsuarioCargoRow[]);
      if (usuariosResp.value.error) setErro(usuariosResp.value.error);
    }
    setLoadingDados(false);
  }

  function selecionarUsuario(row: UsuarioCargoRow) {
    setSelectedUser(row);
    const cargo = String(row.CARGO || 'VENDEDOR').toUpperCase();
    setCargoSelecionado((['DIRETORIA', 'COORDENADOR', 'VENDEDOR'].includes(cargo) ? cargo : 'VENDEDOR') as CargoOperacional);
    setStatusMsg('');
    setErro('');
  }

  async function salvarCargo() {
    if (!selectedUser) {
      setErro('Selecione um usuário na tabela.');
      return;
    }
    setSaving(true);
    setErro('');
    setStatusMsg('');
    try {
      await runMutation(SF.gestaoCargosUsuariosSalvar, { userId: selectedUser.USER_ID, cargo: cargoSelecionado });
      setStatusMsg(`${selectedUser.NOME || selectedUser.EMAIL} definido como ${cargoSelecionado}.`);
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar o papel do usuário.');
    }
    setSaving(false);
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingPermissao(true);
      const row = await callSFSingle(SF.gestaoCargosUsuariosPermissao);
      if (!active) return;
      setPermissao(row as PermissaoCargos | null);
      setLoadingPermissao(false);
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!podeAcessar) return;
    void carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAcessar]);

  if (loadingPermissao) {
    return <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff' }}>Carregando permissões...</div>;
  }

  if (!podeAcessar) {
    return (
      <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <h1 className="font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>Acesso restrito</h1>
        <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>A definição de papéis é exclusiva para Diretoria e administradores.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5 analytics-page mx-auto max-w-[1280px]">
      <div className="rounded-[30px] analytics-hero px-6 py-5 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#137432', color: '#ffffff' }}>
            <UserCog size={24} />
          </div>
          <div>
            <p className="text-[11px] label-ui font-bold" style={{ color: '#137432' }}>Diretoria Comercial</p>
            <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[0.04em]" style={{ color: 'var(--color-text)' }}>PAPÉIS DOS USUÁRIOS</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>Defina quem atua como Diretoria, Coordenador ou Vendedor dentro do Sales 360.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>
          <ShieldCheck size={18} /> Perfil atual: {permissao?.CARGO_ATUAL || 'NÃO DEFINIDO'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Diretoria" value={formatInteger(resumo?.TOTAL_DIRETORIA)} helper="Usuários com acesso executivo." icon={<ShieldCheck size={20} />} tone="green" />
        <MetricCard label="Coordenadores" value={formatInteger(resumo?.TOTAL_COORDENADORES)} helper="Usuários com visão de coordenação." icon={<BriefcaseBusiness size={20} />} tone="blue" />
        <MetricCard label="Vendedores" value={formatInteger(resumo?.TOTAL_VENDEDORES)} helper="Perfil operacional padrão." icon={<Users size={20} />} tone="purple" />
        <MetricCard label="Outros" value={formatInteger(resumo?.TOTAL_OUTROS)} helper={`${formatInteger(resumo?.TOTAL_USUARIOS)} usuário(s) no total.`} icon={<Target size={20} />} tone="amber" />
      </div>

      <section className="rounded-[26px] p-4 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <div className="flex items-center gap-2 mb-3">
          <Search size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Buscar e filtrar usuários</h2>
          {loadingDados ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={14} className="animate-spin" /> Atualizando</span> : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1">
            <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Busca</span>
            <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Nome, e-mail, ID ou RCA" className="h-10 w-full px-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </label>
          <DropdownFilter label="Papel" value={filtroCargo} options={CARGO_OPTIONS} onChange={(value) => setFiltroCargo(value)} minWidth={220} />
          <button type="button" disabled={loadingDados} onClick={() => carregarDados(filtroCargo, busca)} className="h-10 px-5 rounded-xl font-bold inline-flex items-center gap-2 disabled:opacity-70" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
            {loadingDados ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Atualizar
          </button>
        </div>
      </section>

      {(erro || statusMsg) ? (
        <div className="rounded-3xl p-4 text-sm font-semibold" style={{ backgroundColor: erro ? '#fff1f0' : '#edf7ea', border: erro ? '1px solid #ffd8d3' : '1px solid #cfe8c8', color: erro ? '#b42318' : '#137432' }}>
          {erro || statusMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <section className="rounded-[26px] p-5 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
          <div className="pb-3 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display text-[26px] leading-tight font-extrabold" style={{ color: 'var(--color-text)' }}>Usuários do projeto</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Clique em uma linha para alterar o papel operacional.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>{usuarios.length} usuário(s)</span>
          </div>
          <div className="validation-hot-wrapper analytics-detail-table rounded-2xl">
            <HotTable data={usuarioRows} columns={[{ data: 'USER_ID', width: 80 }, { data: 'NOME', width: 220 }, { data: 'EMAIL', width: 240 }, { data: 'CARGO', width: 130 }, { data: 'RCAS', width: 120 }, { data: 'COORDENADOR', width: 220 }, { data: 'ATUALIZADO_EM', width: 140 }]} colHeaders={['ID', 'Nome', 'E-mail', 'Papel', 'RCAs', 'Coordenação', 'Atualizado em']} rowHeaders={false} height={470} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} afterSelectionEnd={(row: number) => { const selected = usuarios[row]; if (selected) selecionarUsuario(selected); }} cells={(row) => (usuarios[row]?.USER_ID === selectedUser?.USER_ID ? { className: 'analytics-hot-selected' } : {})} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </section>

        <aside className="rounded-[26px] p-5 analytics-soft-card self-start" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
          <h2 className="font-display text-[26px] leading-tight font-extrabold" style={{ color: 'var(--color-text)' }}>Definir papel</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Selecione um usuário e escolha o papel desejado.</p>

          <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#f6f7f4', border: '1px solid #edf0eb' }}>
            <p className="text-xs label-ui font-semibold" style={{ color: '#748070' }}>Usuário selecionado</p>
            <p className="mt-1 text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>{selectedUser?.NOME || 'Nenhum usuário selecionado'}</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{selectedUser?.EMAIL || 'Clique em uma linha da tabela.'}</p>
            {selectedUser?.RCAS ? <p className="text-xs mt-2" style={{ color: '#748070' }}>RCA(s): {selectedUser.RCAS}</p> : null}
          </div>

          <div className="mt-4 space-y-2">
            {CARGO_ACTIONS.map((item) => {
              const active = cargoSelecionado === item.value;
              return (
                <button key={item.value} type="button" onClick={() => setCargoSelecionado(item.value)} className="w-full text-left rounded-2xl p-4 transition-all" style={{ backgroundColor: active ? 'var(--color-primary-bg)' : '#f8faf7', border: active ? '1px solid var(--color-primary)' : '1px solid #edf0eb', color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  <span className="font-bold">{item.label}</span>
                  <span className="block text-sm mt-1" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>{item.description}</span>
                </button>
              );
            })}
          </div>

          <button type="button" disabled={!selectedUser || saving} onClick={salvarCargo} className="mt-5 h-11 w-full rounded-2xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar papel
          </button>

          <p className="mt-4 text-xs leading-relaxed" style={{ color: '#748070' }}>A definição de Coordenador libera a visão de coordenação. O vínculo com BUs e o código de supervisor continuam sendo administrados em Gestão Coordenadores.</p>
        </aside>
      </div>
    </div>
  );
}
