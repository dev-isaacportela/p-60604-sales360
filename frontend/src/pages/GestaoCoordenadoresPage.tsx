import { useEffect, useMemo, useRef, useState } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { ChevronDown, Link2, Loader2, RefreshCw, Save, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { executeServerFunctionMitra } from 'mitra-interactions-sdk';
import { callSF, callSFSingle, callSFWithMeta, formatDate, SF } from '../hooks/useMitra';

registerAllModules();

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

interface PermissaoDiretoria {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface UsuarioOption {
  USER_ID: number;
  NOME: string;
  EMAIL: string;
  CARGO: string;
}

interface BuOption {
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
}

interface CoordenadorRow {
  AUTO_ID: number;
  COD_SUPERVISOR: number;
  NOME: string;
  EMAIL: string;
  USER_ID: number | null;
  EMAIL_USUARIO: string;
  ATIVO: boolean | number;
  TOTAL_BUS: number;
  CREATED_AT: string;
}

interface VinculoBuRow {
  AUTO_ID: number;
  COD_SUPERVISOR: number;
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
}

interface Option {
  value: string;
  label: string;
}

interface FormState {
  codSupervisor: string;
  nome: string;
  email: string;
  userId: string;
  ativo: boolean;
}

const EMPTY_FORM: FormState = {
  codSupervisor: '',
  nome: '',
  email: '',
  userId: '',
  ativo: true,
};

function sanitizeSqlText(value: string, maxLength: number) {
  return value.trim().replace(/'/g, "''").slice(0, maxLength);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function parseBu(value: string) {
  const [codfilial, codepto] = value.split('|');
  return { codfilial, codepto };
}

function DropdownFilter({ label, value, options, onChange, minWidth = 240 }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number }) {
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
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-11 w-full px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}>
        <span className="truncate">{label}: {selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-full min-w-[300px] max-h-[320px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
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

async function runMutation(sfId: number, input: Record<string, any>) {
  const response = await executeServerFunctionMitra({ projectId: PROJECT_ID, serverFunctionId: sfId, input });
  const status = String(response?.result?.executionStatus || '');
  const error = String(response?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || error) throw new Error(error || `Execução finalizada com status ${status}`);
}

export default function GestaoCoordenadoresPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoDiretoria | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [bus, setBus] = useState<BuOption[]>([]);
  const [coordenadores, setCoordenadores] = useState<CoordenadorRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoBuRow[]>([]);
  const [selectedCoordenador, setSelectedCoordenador] = useState<CoordenadorRow | null>(null);
  const [selectedVinculo, setSelectedVinculo] = useState<VinculoBuRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busca, setBusca] = useState('');
  const [buParaVincular, setBuParaVincular] = useState('');
  const [erro, setErro] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;

  const usuarioOptions = useMemo<Option[]>(() => [
    { value: '', label: 'Sem usuário vinculado' },
    ...usuarios.map((usuario) => ({
      value: String(usuario.USER_ID),
      label: `${usuario.NOME || usuario.EMAIL || `Usuário ${usuario.USER_ID}`} · ${usuario.CARGO || 'Sem cargo'}`,
    })),
  ], [usuarios]);

  const buOptions = useMemo<Option[]>(() => bus.map((bu) => ({
    value: `${bu.CODFILIAL}|${bu.CODEPTO}`,
    label: `Filial ${bu.CODFILIAL} · Depto ${bu.CODEPTO} — ${bu.DEPARTAMENTO || 'Sem descrição'}`,
  })), [bus]);

  const coordenadorRows = useMemo(() => coordenadores.map((row) => ({
    COD_SUPERVISOR: row.COD_SUPERVISOR,
    NOME: row.NOME,
    EMAIL: row.EMAIL || '-',
    USER_ID: row.USER_ID || '-',
    EMAIL_USUARIO: row.EMAIL_USUARIO || '-',
    STATUS: toBoolean(row.ATIVO) ? 'Ativo' : 'Inativo',
    TOTAL_BUS: Number(row.TOTAL_BUS || 0),
    CREATED_AT: formatDate(row.CREATED_AT || ''),
  })), [coordenadores]);

  const vinculoRows = useMemo(() => vinculos.map((row) => ({
    BU: `Filial ${row.CODFILIAL} · Depto ${row.CODEPTO}`,
    DEPARTAMENTO: row.DEPARTAMENTO || '-',
  })), [vinculos]);

  async function carregarDados() {
    setLoadingDados(true);
    setErro('');
    const [usuariosResp, busResp, coordenadoresResp] = await Promise.allSettled([
      callSF(SF.gestaoCoordenadoresUsuarios),
      callSF(SF.gestaoCoordenadoresBus),
      callSFWithMeta(SF.gestaoCoordenadoresListar, { busca: busca.trim() }),
    ]);

    if (usuariosResp.status === 'fulfilled') setUsuarios(usuariosResp.value as UsuarioOption[]);
    if (busResp.status === 'fulfilled') setBus(busResp.value as BuOption[]);
    if (coordenadoresResp.status === 'fulfilled') {
      setCoordenadores(coordenadoresResp.value.rows as CoordenadorRow[]);
      if (coordenadoresResp.value.error) setErro(coordenadoresResp.value.error);
    }
    setLoadingDados(false);
  }

  async function carregarVinculos(codSupervisor: string | number) {
    if (!codSupervisor) {
      setVinculos([]);
      return;
    }
    const { rows, error } = await callSFWithMeta(SF.gestaoCoordenadoresBuListar, { codSupervisor });
    setVinculos(rows as VinculoBuRow[]);
    setSelectedVinculo(null);
    if (error) setErro(error);
  }

  function preencherFormulario(row: CoordenadorRow) {
    setSelectedCoordenador(row);
    setForm({
      codSupervisor: String(row.COD_SUPERVISOR || ''),
      nome: row.NOME || '',
      email: row.EMAIL || '',
      userId: row.USER_ID ? String(row.USER_ID) : '',
      ativo: toBoolean(row.ATIVO),
    });
    setStatusMsg('');
    setErro('');
    void carregarVinculos(row.COD_SUPERVISOR);
  }

  function novoCoordenador() {
    setSelectedCoordenador(null);
    setSelectedVinculo(null);
    setVinculos([]);
    setForm(EMPTY_FORM);
    setBuParaVincular('');
    setErro('');
    setStatusMsg('');
  }

  async function salvarCoordenador() {
    setErro('');
    setStatusMsg('');
    if (!form.codSupervisor || !/^\d+$/.test(form.codSupervisor)) {
      setErro('Informe um código de supervisor numérico.');
      return;
    }
    if (!form.nome.trim()) {
      setErro('Informe o nome do coordenador.');
      return;
    }

    try {
      await runMutation(SF.gestaoCoordenadoresSalvar, {
        codSupervisor: form.codSupervisor,
        nome: sanitizeSqlText(form.nome, 100),
        email: sanitizeSqlText(form.email, 150),
        userId: form.userId,
        ativo: form.ativo ? '1' : '0',
      });
      setStatusMsg('Coordenador salvo com sucesso.');
      await carregarDados();
      await carregarVinculos(form.codSupervisor);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar coordenador.');
    }
  }

  async function alternarStatus() {
    if (!form.codSupervisor) return;
    const nextStatus = !form.ativo;
    setErro('');
    setStatusMsg('');
    try {
      await runMutation(SF.gestaoCoordenadoresDefinirStatus, { codSupervisor: form.codSupervisor, ativo: nextStatus ? '1' : '0' });
      setForm((prev) => ({ ...prev, ativo: nextStatus }));
      setStatusMsg(nextStatus ? 'Coordenador ativado.' : 'Coordenador inativado.');
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao atualizar status.');
    }
  }

  async function vincularBu() {
    if (!form.codSupervisor || !buParaVincular) return;
    const { codfilial, codepto } = parseBu(buParaVincular);
    setErro('');
    setStatusMsg('');
    try {
      await runMutation(SF.gestaoCoordenadoresBuVincular, { codSupervisor: form.codSupervisor, codfilial, codepto });
      setStatusMsg('BU vinculada ao coordenador.');
      setBuParaVincular('');
      await carregarVinculos(form.codSupervisor);
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao vincular BU.');
    }
  }

  async function desvincularBu() {
    if (!selectedVinculo) return;
    setErro('');
    setStatusMsg('');
    try {
      await runMutation(SF.gestaoCoordenadoresBuDesvincular, { vinculoId: selectedVinculo.AUTO_ID });
      setStatusMsg('BU desvinculada do coordenador.');
      await carregarVinculos(form.codSupervisor);
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao desvincular BU.');
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingPermissao(true);
      const row = await callSFSingle(SF.gestaoCoordenadoresPermissao);
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
  }, [podeAcessar, busca]);

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
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Coordenadores</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Esta tela está disponível apenas para Diretoria ou Admin.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>Perfil atual: <strong>{permissao?.CARGO_ATUAL || 'NÃO DEFINIDO'}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: '#137432' }}>Camada Diretoria</p>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de Coordenadores</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>Cadastre coordenadores e defina quais BUs cada um acompanha.</p>
        </div>
        <button type="button" onClick={carregarDados} disabled={loadingDados} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-60" style={{ backgroundColor: '#137432' }}>
          {loadingDados ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Atualizar
        </button>
      </div>

      {erro ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fff4dc', color: '#8a5600', border: '1px solid #f2d499' }}>{erro}</div> : null}
      {statusMsg ? <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e6f4ea', color: '#137432', border: '1px solid #cde7d3' }}>{statusMsg}</div> : null}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
        <section className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}><UserCog size={22} /></div>
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Cadastro</h2>
          <p className="text-sm mt-1 mb-4" style={{ color: '#657063' }}>Selecione uma linha para editar ou crie um novo coordenador.</p>
          <div className="space-y-3">
            <input value={form.codSupervisor} onChange={(event) => setForm((prev) => ({ ...prev, codSupervisor: event.target.value.replace(/\D/g, '') }))} placeholder="Código supervisor" className="h-11 w-full px-4 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }} />
            <input value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Nome do coordenador" className="h-11 w-full px-4 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }} />
            <input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="E-mail" className="h-11 w-full px-4 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }} />
            <DropdownFilter label="Usuário" value={form.userId} options={usuarioOptions} onChange={(value) => setForm((prev) => ({ ...prev, userId: value }))} minWidth={320} />
            <button type="button" onClick={() => setForm((prev) => ({ ...prev, ativo: !prev.ativo }))} className="h-11 w-full px-4 rounded-2xl text-sm font-semibold flex items-center justify-between" style={{ backgroundColor: form.ativo ? '#e6f4ea' : '#f6dfdf', color: form.ativo ? '#137432' : '#9f2d2d', border: `1px solid ${form.ativo ? '#cde7d3' : '#edc4c4'}` }}>
              Status
              <span>{form.ativo ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={novoCoordenador} className="h-11 rounded-2xl text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Novo</button>
            <button type="button" onClick={salvarCoordenador} disabled={loadingDados} className="h-11 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ backgroundColor: '#137432' }}><Save size={16} />Salvar</button>
          </div>
          {form.codSupervisor ? (
            <button type="button" onClick={alternarStatus} className="mt-3 h-11 w-full rounded-2xl text-sm font-semibold" style={{ backgroundColor: form.ativo ? '#f6dfdf' : '#e6f4ea', color: form.ativo ? '#9f2d2d' : '#137432' }}>
              {form.ativo ? 'Inativar coordenador' : 'Ativar coordenador'}
            </button>
          ) : null}
        </section>

        <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
          <div className="p-5 border-b flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: '#e3e8de' }}>
            <div>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Coordenadores</h2>
              <p className="text-sm mt-1" style={{ color: '#657063' }}>Clique em uma linha para editar o cadastro e os vínculos.</p>
            </div>
            <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar coordenador" className="h-11 min-w-[260px] px-4 rounded-2xl text-sm outline-none" style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }} />
          </div>
          <div className="validation-hot-wrapper">
            <HotTable
              data={coordenadorRows}
              columns={[
                { data: 'COD_SUPERVISOR', width: 120 },
                { data: 'NOME', width: 220 },
                { data: 'EMAIL', width: 220 },
                { data: 'USER_ID', width: 90 },
                { data: 'EMAIL_USUARIO', width: 220 },
                { data: 'STATUS', width: 100 },
                { data: 'TOTAL_BUS', width: 90 },
                { data: 'CREATED_AT', width: 120 },
              ]}
              colHeaders={['Supervisor', 'Nome', 'E-mail', 'User ID', 'Usuário do sistema', 'Status', 'BUs', 'Criado em']}
              rowHeaders
              height={400}
              width="100%"
              stretchH="none"
              manualColumnResize
              columnSorting={{ indicator: true, headerAction: true }}
              afterSelectionEnd={(row) => {
                const selected = coordenadores[row];
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
        <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#f0dfcc' }}>
          <div>
            <h2 className="font-display text-3xl font-extrabold" style={{ color: '#281b10' }}>BUs do coordenador</h2>
            <p className="text-sm mt-1" style={{ color: '#6f563b' }}>{selectedCoordenador ? `Vínculos de ${selectedCoordenador.NOME}` : 'Selecione um coordenador para gerenciar vínculos.'}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DropdownFilter label="BU" value={buParaVincular} options={buOptions} onChange={setBuParaVincular} minWidth={340} />
            <button type="button" onClick={vincularBu} disabled={!form.codSupervisor || !buParaVincular} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-50" style={{ backgroundColor: '#137432' }}><Link2 size={16} />Vincular</button>
            <button type="button" onClick={desvincularBu} disabled={!selectedVinculo} className="h-11 px-4 rounded-2xl text-sm font-semibold flex items-center gap-2 text-white disabled:opacity-50" style={{ backgroundColor: '#b42318' }}><Trash2 size={16} />Remover</button>
          </div>
        </div>
        <div className="validation-hot-wrapper">
          <HotTable
            data={vinculoRows}
            columns={[
              { data: 'BU', width: 190 },
              { data: 'DEPARTAMENTO', width: 320 },
            ]}
            colHeaders={['BU', 'Departamento']}
            rowHeaders
            height={280}
            width="100%"
            stretchH="none"
            manualColumnResize
            columnSorting={{ indicator: true, headerAction: true }}
            afterSelectionEnd={(row) => setSelectedVinculo(vinculos[row] || null)}
            readOnly
            licenseKey="non-commercial-and-evaluation"
            className="ht-theme-main"
          />
        </div>
      </section>

      <div className="mt-5 rounded-3xl p-5 flex items-start gap-3" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <ShieldCheck size={20} style={{ color: '#137432' }} />
        <p className="text-sm" style={{ color: '#4f5d4d' }}>
          Alterações nesta tela impactam o escopo de Gestão de Carteira e Férias de Vendedores. Use apenas para cadastro e manutenção administrativa da camada Diretoria.
        </p>
      </div>
    </div>
  );
}
