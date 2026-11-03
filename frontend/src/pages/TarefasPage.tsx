import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Check,
  ChevronDown,
  Filter,
  Loader2,
  Plus,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { callSF, callSFMutation, formatDate, getBrasiliaDate, getBrasiliaTimestamp, SF } from '../hooks/useMitra';
import { sincronizarGoogleAgenda } from '../lib/googleAgenda';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import { normalizeSearchText, smartSearchScore } from '../lib/smartSearch';

interface Tarefa {
  ID: number;
  VENDEDOR_ID?: number;
  RESPONSAVEL?: string;
  CLIENTE_ID?: number;
  CLIENTE?: string;
  TITULO: string;
  DESCRICAO: string;
  STATUS: string;
  PRIORIDADE: string;
  DATA_LIMITE: string;
  CRIADO_EM?: string;
  DATA_CADASTRO?: string;
}

interface TaskFormState {
  titulo: string;
  descricao: string;
  prioridade: string;
  dataLimite: string;
  clienteId: string;
}

interface CarteiraCliente {
  ID: number;
  NOME_FANTASIA?: string;
  RAZAO_SOCIAL?: string;
  CNPJ?: string;
  CIDADE?: string;
  UF?: string;
  WINTHOR_CODCLI?: number | string;
  CODCLI?: number | string;
}

interface ClienteOption {
  id: string;
  codigo: string;
  label: string;
  searchText: string;
}

interface AtividadeLog {
  ID: number;
  ID_ATIVIDADE: number;
  CAMPO_ALTERADO: string;
  VALOR_ANTERIOR?: string;
  VALOR_NOVO?: string;
  DATA_ALTERACAO: string;
  ID_USUARIO?: number;
  USUARIO?: string;
}

type TaskStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';
type ViewMode = 'LISTA' | 'KANBAN';

const STATUS_META: Record<string, { label: string; chipBg: string; chipText: string }> = {
  PENDENTE: { label: 'A Fazer', chipBg: '#eceff5', chipText: '#35455a' },
  EM_ANDAMENTO: { label: 'Em Andamento', chipBg: '#e8f3e7', chipText: '#4f7a4f' },
  CONCLUIDA: { label: 'Concluída', chipBg: '#e7f5ea', chipText: '#17783f' },
};

const PRIORIDADE_META: Record<string, { bg: string; text: string }> = {
  ALTA: { bg: '#ffe7e6', text: '#c63c3c' },
  MEDIA: { bg: '#fff4da', text: '#b57b12' },
  BAIXA: { bg: '#e7f6ea', text: '#27884c' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDENTE', label: 'A Fazer' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDA', label: 'Concluída' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' },
];

const DEFAULT_FORM: TaskFormState = {
  titulo: '',
  descricao: '',
  prioridade: 'MEDIA',
  dataLimite: '',
  clienteId: '',
};

function normalizeSearch(value: string) {
  return normalizeSearchText(value);
}

function getClienteNome(cliente: CarteiraCliente) {
  return cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || `Cliente ${cliente.ID}`;
}

function getClienteCodigo(cliente: CarteiraCliente) {
  return String(cliente.WINTHOR_CODCLI ?? cliente.CODCLI ?? cliente.ID ?? '').trim();
}

function formatClienteOption(cliente: CarteiraCliente) {
  return `${getClienteNome(cliente)} — Cód. ${getClienteCodigo(cliente)}`;
}

function ClienteSearchDropdown({
  value,
  selectedId,
  options,
  loading,
  disabled,
  onSearchChange,
  onSelect,
}: {
  value: string;
  selectedId: string;
  options: ClienteOption[];
  loading: boolean;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (option: ClienteOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [options]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setFocusedIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && open && options[focusedIndex]) {
      event.preventDefault();
      onSelect(options[focusedIndex]);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 relative" ref={containerRef}>
      <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Cliente</label>
      <input
        value={value}
        onChange={(event) => {
          onSearchChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Carregando clientes...' : 'Digite nome ou código do cliente'}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
          ['--tw-ring-color' as string]: 'var(--color-primary-light)',
        }}
      />

      {open && !disabled ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border shadow-lg py-1"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {loading ? (
            <div className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando clientes...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum cliente encontrado.</div>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === selectedId}
                onMouseEnter={() => setFocusedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors"
                style={{
                  backgroundColor: focusedIndex === index ? 'var(--color-primary-bg)' : 'transparent',
                  color: option.id === selectedId ? 'var(--color-primary)' : 'var(--color-text)',
                }}
              >
                <span className="truncate">{option.label}</span>
                {option.id === selectedId ? <Check size={16} style={{ color: 'var(--color-primary)' }} /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const CONTENT_SCALE_STYLE = {
  transform: 'scale(0.75)',
  transformOrigin: 'top left',
  width: '133.333333%',
};

function todayValue() {
  return getBrasiliaDate();
}

function statusLabel(status: string) {
  return STATUS_META[status]?.label ?? status;
}

const STATUS_ORDER: Record<string, number> = {
  PENDENTE: 1,
  EM_ANDAMENTO: 2,
  CONCLUIDA: 3,
};

function formatCreatedAt(tarefa: Tarefa) {
  const value = tarefa.DATA_CADASTRO || tarefa.CRIADO_EM || '';
  return value ? formatDate(value.slice(0, 10)) : '-';
}

function getResponsavelLabel(tarefa: Tarefa) {
  const responsavel = String(tarefa.RESPONSAVEL || '').trim();
  if (responsavel) return responsavel;
  return tarefa.VENDEDOR_ID ? `#${tarefa.VENDEDOR_ID}` : '';
}

export default function TarefasPage() {
  const { toasts, addToast, removeToast } = useToast();
  const coordinatorScope = useCoordinatorScope('atividades');
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Tarefa | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tarefa | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<'DADOS' | 'LOG'>('DADOS');
  const [activityLogs, setActivityLogs] = useState<AtividadeLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<TaskStatus, boolean>>({
    PENDENTE: false,
    EM_ANDAMENTO: false,
    CONCLUIDA: true,
  });
  const [viewMode, setViewMode] = useState<ViewMode>('LISTA');
  const [fStatus, setFStatus] = useState('');
  const [fPrioridade, setFPrioridade] = useState('');
  const [fData, setFData] = useState('');
  const [carteiraClientes, setCarteiraClientes] = useState<CarteiraCliente[]>([]);
  const [loadingCarteiraClientes, setLoadingCarteiraClientes] = useState(false);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clienteSearchQuery, setClienteSearchQuery] = useState('');
  const clientesRequestRef = useRef(0);

  const [form, setForm] = useState<TaskFormState>(DEFAULT_FORM);

  const loadCarteiraClientes = useCallback(async (busca = '') => {
    const requestId = ++clientesRequestRef.current;
    setLoadingCarteiraClientes(true);
    try {
      // A SF exige TODOS os placeholders: parametro ausente permanece literal no SQL
      // ('{{segmento}}' = '' fica falso) e a consulta devolve zero clientes.
      const rows = await callSF(SF.minhaCarteiraClientes, {
        busca: busca.trim(),
        idBu: '',
        segmento: '',
        ramoCliente: '',
        status: '',
        cidade: '',
        uf: '',
        limit: '80',
        offset: '0',
        ...coordinatorScope.scopeParams,
      });

      if (requestId !== clientesRequestRef.current) return;
      setCarteiraClientes(rows as CarteiraCliente[]);
    } catch (error) {
      console.error(error);
      if (requestId === clientesRequestRef.current) setCarteiraClientes([]);
    } finally {
      if (requestId === clientesRequestRef.current) setLoadingCarteiraClientes(false);
    }
  }, [coordinatorScope.scopeParams]);

  const load = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    setLoading(true);
    const rows = await callSF(SF.listarTarefas, { status: fStatus, prioridade: fPrioridade, ...coordinatorScope.scopeParams });
    setTarefas(rows as Tarefa[]);
    setLoading(false);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams, fStatus, fPrioridade]);

  async function syncGoogleAgendaTask(tarefaId: number) {
    if (!tarefaId) return;
    await sincronizarGoogleAgenda('TAREFA', Number(tarefaId));
  }

  async function findCreatedTaskId(): Promise<number | null> {
    const rows = await callSF(SF.listarTarefas, { status: '', prioridade: '', ...coordinatorScope.scopeParams });
    const found = (rows as Tarefa[]).find((task) => (
      task.TITULO === form.titulo.trim()
      && (task.DATA_LIMITE || '') === form.dataLimite
      && String(task.CLIENTE_ID || '') === String(form.clienteId.trim() || '')
    ));
    return found?.ID || null;
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showForm || activeFormTab !== 'DADOS') return;
    const timer = window.setTimeout(() => {
      void loadCarteiraClientes(clienteSearchQuery);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeFormTab, clienteSearchQuery, loadCarteiraClientes, showForm]);

  const filtered = useMemo(() => {
    return tarefas.filter((t) => {
      if (fData && t.DATA_LIMITE !== fData) return false;
      return true;
    });
  }, [tarefas, fData]);

  const grouped = useMemo(
    () => ({
      PENDENTE: filtered.filter((t) => t.STATUS === 'PENDENTE'),
      EM_ANDAMENTO: filtered.filter((t) => t.STATUS === 'EM_ANDAMENTO'),
      CONCLUIDA: filtered.filter((t) => t.STATUS === 'CONCLUIDA'),
    }),
    [filtered],
  );

  const openTasks = useMemo(() => {
    return [...grouped.PENDENTE, ...grouped.EM_ANDAMENTO].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.STATUS] || 99) - (STATUS_ORDER[b.STATUS] || 99);
      if (statusDiff !== 0) return statusDiff;
      return (a.DATA_LIMITE || '9999-99-99').localeCompare(b.DATA_LIMITE || '9999-99-99');
    });
  }, [grouped]);

  const summary = useMemo(() => {
    const overdue = filtered.filter((t) => t.DATA_LIMITE && t.DATA_LIMITE < todayValue() && t.STATUS !== 'CONCLUIDA').length;
    return {
      total: filtered.length,
      pendentes: grouped.PENDENTE.length,
      andamento: grouped.EM_ANDAMENTO.length,
      concluida: grouped.CONCLUIDA.length,
      atraso: overdue,
    };
  }, [filtered, grouped]);

  const clienteOptions = useMemo<ClienteOption[]>(() => {
    return carteiraClientes.map((cliente) => {
      const label = formatClienteOption(cliente);
      const codigo = getClienteCodigo(cliente);
      return {
        id: String(cliente.ID),
        codigo,
        label,
        searchText: normalizeSearch(`${label} ${cliente.CNPJ || ''} ${cliente.CIDADE || ''} ${cliente.UF || ''}`),
      };
    });
  }, [carteiraClientes]);

  const visibleClienteOptions = useMemo(() => {
    const term = normalizeSearch(clienteSearchQuery);
    if (!term) return clienteOptions;
    return clienteOptions
      .map((option) => ({
        option,
        score: smartSearchScore([option.label, option.codigo, option.searchText], term),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label, 'pt-BR'))
      .map(({ option }) => option);
  }, [clienteOptions, clienteSearchQuery]);

  function openCreate() {
    setEditingTask(null);
    setForm(DEFAULT_FORM);
    setClienteBusca('');
    setClienteSearchQuery('');
    setActiveFormTab('DADOS');
    setActivityLogs([]);
    setShowForm(true);
  }

  async function loadActivityLogs(taskId: number) {
    setLoadingLogs(true);
    try {
      const rows = await callSF(SF.atividadesListarLog, { tarefaId: String(taskId) });
      setActivityLogs(rows as AtividadeLog[]);
    } finally {
      setLoadingLogs(false);
    }
  }

  function openEdit(task: Tarefa) {
    setEditingTask(task);
    setForm({
      titulo: task.TITULO,
      descricao: task.DESCRICAO || '',
      prioridade: task.PRIORIDADE || 'MEDIA',
      dataLimite: task.DATA_LIMITE || '',
      clienteId: task.CLIENTE_ID ? String(task.CLIENTE_ID) : '',
    });
    setClienteBusca(task.CLIENTE ? `${task.CLIENTE} — Cód. ${task.CLIENTE_ID || ''}` : task.CLIENTE_ID ? `Cód. ${task.CLIENTE_ID}` : '');
    setClienteSearchQuery('');
    setActiveFormTab('DADOS');
    setShowForm(true);
    void loadActivityLogs(task.ID);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingTask(null);
    setForm(DEFAULT_FORM);
    setClienteBusca('');
    setClienteSearchQuery('');
    setActiveFormTab('DADOS');
    setActivityLogs([]);
  }

  async function saveTask() {
    if (!form.titulo.trim()) {
      addToast('error', 'Informe o título da atividade.');
      return;
    }

    if (!form.dataLimite) {
      addToast('error', 'Informe o prazo da atividade.');
      return;
    }

    setSaving(true);
    try {
      if (editingTask) {
        const prazoAnterior = editingTask.DATA_LIMITE || '';
        const novoPrazo = form.dataLimite || '';
        const ok = await callSFMutation(SF.tarefasAtualizarDados, {
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          prioridade: form.prioridade,
          dataLimite: form.dataLimite,
          clienteId: form.clienteId.trim(),
          clienteCodigo: form.clienteId.trim(),
          tarefaId: String(editingTask.ID),
        });
        if (!ok) {
          throw new Error('Não foi possível atualizar a atividade.');
        }
        if (prazoAnterior !== novoPrazo) {
          await callSFMutation(SF.atividadesRegistrarLog, {
            tarefaId: String(editingTask.ID),
            campoAlterado: 'DATA_LIMITE',
            valorAnterior: prazoAnterior,
            valorNovo: novoPrazo,
            dataAlteracao: getBrasiliaTimestamp(),
          });
        }
        await syncGoogleAgendaTask(editingTask.ID);
        addToast('success', 'Atividade atualizada.');
      } else {
        const ok = await callSFMutation(SF.criarTarefa, {
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          prioridade: form.prioridade,
          dataLimite: form.dataLimite,
          criadoEm: getBrasiliaTimestamp(),
          clienteId: form.clienteId.trim(),
          clienteCodigo: form.clienteId.trim(),
        });
        if (!ok) {
          throw new Error('Não foi possível criar a atividade.');
        }
        const createdTaskId = await findCreatedTaskId();
        if (createdTaskId) await syncGoogleAgendaTask(createdTaskId);
        addToast('success', 'Atividade criada com sucesso.');
      }

      closeForm();
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível salvar a atividade.');
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(tarefa: Tarefa, novoStatus: string) {
    setLoadingActionId(tarefa.ID);
    try {
      const ok = await callSFMutation(SF.tarefasAtualizarStatusSeguro, {
        tarefaId: String(tarefa.ID),
        novoStatus,
      });
      if (!ok) throw new Error('Mutation failed');
      addToast('success', `Atividade marcada como ${statusLabel(novoStatus).toLowerCase()}.`);
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível alterar o status.');
    } finally {
      setLoadingActionId(null);
    }
  }

  async function removeTask() {
    if (!deleteTarget) return;
    setLoadingActionId(deleteTarget.ID);
    try {
      const ok = await callSFMutation(SF.tarefasExcluirSeguro, {
        tarefaId: String(deleteTarget.ID),
      });
      if (!ok) {
        throw new Error('Não foi possível excluir a atividade.');
      }
      addToast('success', 'Atividade removida.');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível excluir a atividade.');
    } finally {
      setLoadingActionId(null);
    }
  }

  const StatusDropdown = ({ tarefa }: { tarefa: Tarefa }) => (
    <Select
      value={tarefa.STATUS}
      onChange={(value) => {
        if (value && value !== tarefa.STATUS) void moveTask(tarefa, value);
      }}
      options={STATUS_OPTIONS.filter((option) => option.value)}
      disabled={loadingActionId === tarefa.ID}
    />
  );

  const OpenTasksTable = ({ items }: { items: Tarefa[] }) => (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>Atividades abertas</h2>
          <p className="text-sm" style={{ color: '#6a7367' }}>A Fazer no topo, Em Andamento logo abaixo.</p>
        </div>
        <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: '#eceff5', color: '#35455a' }}>
          {items.length} {items.length === 1 ? 'atividade' : 'atividades'}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        <div className="hidden grid-cols-12 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] md:grid" style={{ color: '#7c8579', backgroundColor: '#ffffff', borderBottom: '1px solid #e4e9df' }}>
          <div className="col-span-1">#</div>
          <div className="col-span-4">Atividade</div>
          <div className="col-span-2">Prioridade</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Prazo</div>
          <div className="col-span-1 text-right">Editar</div>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-lg" style={{ color: '#7f887d' }}>
            Nenhuma atividade aberta.
          </div>
        ) : (
          items.map((tarefa) => {
            const p = PRIORIDADE_META[tarefa.PRIORIDADE] || PRIORIDADE_META.MEDIA;
            const overdue = tarefa.DATA_LIMITE && tarefa.DATA_LIMITE < todayValue() && tarefa.STATUS !== 'CONCLUIDA';
            const status = STATUS_META[tarefa.STATUS] || STATUS_META.PENDENTE;
            const responsavel = getResponsavelLabel(tarefa);

            return (
              <div key={tarefa.ID} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-12 md:items-center" style={{ borderTop: '1px solid #eef2eb' }}>
                <div className="md:col-span-1">
                  <span className="text-sm font-semibold" style={{ color: '#7a8379' }}>
                    {tarefa.ID}
                  </span>
                </div>

                <div className="min-w-0 md:col-span-4 md:pr-3">
                  <button type="button" onClick={() => openEdit(tarefa)} className="block w-full text-left text-base font-semibold transition-colors md:truncate" style={{ color: '#1b1c1a' }}>
                    {tarefa.TITULO}
                  </button>
                  {tarefa.DESCRICAO ? <p className="text-sm md:truncate" style={{ color: '#536172' }}>{tarefa.DESCRICAO}</p> : null}
                  {tarefa.CLIENTE || tarefa.CLIENTE_ID ? (
                    <p className="mt-1 truncate text-xs font-medium" style={{ color: '#315d44' }}>
                      {tarefa.CLIENTE ? `Cliente: ${tarefa.CLIENTE}` : 'Cliente não cadastrado'}
                      {tarefa.CLIENTE_ID ? ` • Código: ${tarefa.CLIENTE_ID}` : ''}
                    </p>
                  ) : null}
                  {responsavel ? (
                    <p className="mt-1 truncate text-xs font-medium" style={{ color: '#6a7367' }}>
                      Responsável: {responsavel}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 md:col-span-2 md:block">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Prioridade</span>
                  <span className="text-sm font-semibold" style={{ color: p.text }}>
                    {tarefa.PRIORIDADE === 'MEDIA' ? 'Média' : tarefa.PRIORIDADE === 'ALTA' ? 'Alta' : 'Baixa'}
                  </span>
                </div>

                <div className="md:col-span-2">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Status</span>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.chipText }} />
                    <StatusDropdown tarefa={tarefa} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm font-semibold md:col-span-2 md:block" style={{ color: overdue ? '#b13434' : '#536172' }}>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Prazo</span>
                  {tarefa.DATA_LIMITE ? formatDate(tarefa.DATA_LIMITE) : '-'}
                </div>

                <div className="flex items-center justify-end gap-2 md:col-span-1">
                  <button
                    onClick={() => openEdit(tarefa)}
                    className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
                    style={{ backgroundColor: 'transparent', color: '#57715d' }}
                    title="Editar"
                  >
                    <PencilLine size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}

        <button
          onClick={openCreate}
          className="w-full px-4 py-3 text-left text-base font-medium transition-colors"
          style={{ color: '#57715d', borderTop: '1px solid #eef2eb', backgroundColor: '#ffffff' }}
        >
          + Adicionar atividade
        </button>
      </div>
    </section>
  );

  const CompletedSection = ({ statusKey, items }: { statusKey: TaskStatus; items: Tarefa[] }) => {
    const s = STATUS_META[statusKey];
    const collapsed = collapsedSections[statusKey];
    return (
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setCollapsedSections((prev) => ({ ...prev, [statusKey]: !prev[statusKey] }))}
            className="flex items-center justify-center rounded-full p-1 transition-transform"
            aria-label={collapsed ? `Expandir ${s.label}` : `Ocultar ${s.label}`}
          >
            <ChevronDown size={18} style={{ color: '#7d857a', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }} />
          </button>
          <span className="px-3 py-1 rounded-xl text-lg font-semibold" style={{ backgroundColor: s.chipBg, color: s.chipText }}>
            {s.label.toUpperCase()}
          </span>
          <span className="text-lg" style={{ color: '#6a7367' }}>
            {items.length} {items.length === 1 ? 'Atividade' : 'Atividades'}
          </span>
        </div>

        {collapsed ? null : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
          <div className="hidden grid-cols-12 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] md:grid" style={{ color: '#7c8579', backgroundColor: '#ffffff', borderBottom: '1px solid #e4e9df' }}>
            <div className="col-span-1">#</div>
            <div className="col-span-5">Atividade</div>
            <div className="col-span-2">Prioridade</div>
            <div className="col-span-2">Prazo</div>
            <div className="col-span-1">Criado em</div>
            <div className="col-span-1 text-right">Editar</div>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-lg" style={{ color: '#7f887d' }}>
              Nenhuma atividade neste estágio.
            </div>
          ) : (
            items.map((tarefa) => {
              const p = PRIORIDADE_META[tarefa.PRIORIDADE] || PRIORIDADE_META.MEDIA;
              const overdue = tarefa.DATA_LIMITE && tarefa.DATA_LIMITE < todayValue() && tarefa.STATUS !== 'CONCLUIDA';
              const responsavel = getResponsavelLabel(tarefa);

              return (
                <div key={tarefa.ID} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-12 md:items-center" style={{ borderTop: '1px solid #eef2eb' }}>
                  <div className="md:col-span-1">
                    <span className="text-sm font-semibold" style={{ color: '#7a8379' }}>
                      {tarefa.ID}
                    </span>
                  </div>
                  <div className="min-w-0 md:col-span-5 md:pr-3">
                    <p className="text-base font-semibold md:truncate" style={{ color: '#1b1c1a' }}>
                      {tarefa.TITULO}
                    </p>
                    {tarefa.DESCRICAO ? (
                      <p className="text-sm md:truncate" style={{ color: '#6e766c' }}>
                        {tarefa.DESCRICAO}
                      </p>
                    ) : null}
                    {tarefa.CLIENTE || tarefa.CLIENTE_ID ? (
                      <p className="text-sm truncate mt-1" style={{ color: '#315d44' }}>
                        {tarefa.CLIENTE ? `Cliente: ${tarefa.CLIENTE}` : 'Cliente não cadastrado'}
                        {tarefa.CLIENTE_ID ? ` • Código: ${tarefa.CLIENTE_ID}` : ''}
                      </p>
                    ) : null}
                    {responsavel ? (
                      <p className="text-sm truncate mt-1" style={{ color: '#6a7367' }}>
                        Responsável: {responsavel}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 md:col-span-2 md:block">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Prioridade</span>
                    <span className="text-sm font-semibold" style={{ color: p.text }}>
                      {tarefa.PRIORIDADE === 'MEDIA' ? 'Média' : tarefa.PRIORIDADE === 'ALTA' ? 'Alta' : 'Baixa'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-sm font-semibold md:col-span-2 md:block" style={{ color: overdue ? '#b13434' : '#536172' }}>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Prazo</span>
                    {tarefa.DATA_LIMITE ? formatDate(tarefa.DATA_LIMITE) : '-'}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-sm font-semibold md:col-span-1 md:block" style={{ color: '#536172' }}>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden" style={{ color: '#7c8579' }}>Criado em</span>
                    {formatCreatedAt(tarefa)}
                  </div>

                  <div className="flex items-center justify-end gap-2 md:col-span-1">
                    <button
                      onClick={() => openEdit(tarefa)}
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
                      style={{ backgroundColor: 'transparent', color: '#57715d' }}
                      title="Editar"
                    >
                      <PencilLine size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          <button
            onClick={openCreate}
            className="w-full text-left px-4 py-3 text-lg transition-colors"
            style={{ color: '#8a9488', borderTop: '1px solid #edf0ea' }}
          >
            + Adicionar atividade
          </button>
          </div>
        )}
      </section>
    );
  };

  const KanbanColumn = ({ statusKey, items }: { statusKey: TaskStatus; items: Tarefa[] }) => {
    const s = STATUS_META[statusKey];
    return (
      <section className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e8ece4' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="px-3 py-1 rounded-xl text-base font-semibold" style={{ backgroundColor: s.chipBg, color: s.chipText }}>
            {s.label.toUpperCase()}
          </span>
          <span className="text-base font-medium" style={{ color: '#6a7367' }}>
            {items.length} {items.length === 1 ? 'Atividade' : 'Atividades'}
          </span>
        </div>

        <div className="space-y-3 mt-3 min-h-24">
          {items.length === 0 ? (
            <div className="rounded-xl p-4 text-base" style={{ backgroundColor: '#ffffff', color: '#7f887d' }}>
              Nenhuma atividade neste estágio.
            </div>
          ) : (
            items.map((tarefa) => {
              const p = PRIORIDADE_META[tarefa.PRIORIDADE] || PRIORIDADE_META.MEDIA;
              const overdue = tarefa.DATA_LIMITE && tarefa.DATA_LIMITE < todayValue() && tarefa.STATUS !== 'CONCLUIDA';
              const responsavel = getResponsavelLabel(tarefa);
              return (
                <article key={`kanban-${tarefa.ID}`} className="rounded-xl p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0ea' }}>
                  <p className="text-xl font-semibold leading-tight" style={{ color: '#1b1c1a' }}>
                    {tarefa.TITULO}
                  </p>
                  <p className="text-base mt-1 line-clamp-2" style={{ color: '#6e766c' }}>
                    {tarefa.DESCRICAO || 'Sem descrição'}
                  </p>
                  {tarefa.CLIENTE || tarefa.CLIENTE_ID ? (
                    <p className="text-sm mt-1" style={{ color: '#315d44' }}>
                      {tarefa.CLIENTE ? `Cliente: ${tarefa.CLIENTE}` : 'Cliente não cadastrado'}
                      {tarefa.CLIENTE_ID ? ` • Código: ${tarefa.CLIENTE_ID}` : ''}
                    </p>
                  ) : null}
                  {responsavel ? (
                    <p className="text-sm mt-1" style={{ color: '#6a7367' }}>
                      Responsável: {responsavel}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: p.bg, color: p.text }}>
                      {tarefa.PRIORIDADE === 'MEDIA' ? 'Média' : tarefa.PRIORIDADE === 'ALTA' ? 'Alta' : 'Baixa'}
                    </span>
                    <span className="text-sm" style={{ color: overdue ? '#b13434' : '#536172' }}>
                      {tarefa.DATA_LIMITE ? formatDate(tarefa.DATA_LIMITE) : 'Sem prazo'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-44">
                      <StatusDropdown tarefa={tarefa} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(tarefa)}
                        className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
                        style={{ backgroundColor: '#edf2ee', color: '#57715d' }}
                        title="Editar"
                      >
                        <PencilLine size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(tarefa)}
                        className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
                        style={{ backgroundColor: '#f8eceb', color: '#ab3d3a' }}
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div style={CONTENT_SCALE_STYLE}>
        <div className="mb-5">
          <CoordinatorScopeFilter scope={coordinatorScope} />
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-extrabold sm:text-5xl" style={{ color: '#1b1c1a' }}>
              Gestão de Atividades
            </h1>
            <p className="mt-1 text-base sm:text-2xl" style={{ color: '#444f44' }}>
              Acompanhe seus follow-ups, pendências e entregas.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="inline-flex w-full rounded-lg p-1 sm:w-auto" style={{ backgroundColor: '#edf0eb' }}>
              <button
                type="button"
                onClick={() => setViewMode('LISTA')}
                className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors sm:flex-none"
                style={{
                  backgroundColor: viewMode === 'LISTA' ? '#ffffff' : 'transparent',
                  color: viewMode === 'LISTA' ? '#1b1c1a' : '#6a7367',
                }}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setViewMode('KANBAN')}
                className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors sm:flex-none"
                style={{
                  backgroundColor: viewMode === 'KANBAN' ? '#ffffff' : 'transparent',
                  color: viewMode === 'KANBAN' ? '#1b1c1a' : '#6a7367',
                }}
              >
                Kanban
              </button>
            </div>
            <button onClick={openCreate} className="btn-pill-primary flex w-full items-center justify-center gap-2 px-6 py-3 text-base font-semibold sm:w-auto sm:text-lg">
              <Plus size={18} /> Nova Atividade
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-12">
            <div className="grid grid-cols-2 gap-3 mb-4 lg:grid-cols-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7' }}>
                <p className="text-sm label-ui" style={{ color: '#778176' }}>Total</p>
                <p className="text-3xl font-extrabold mt-1 sm:text-4xl" style={{ color: '#1b1c1a' }}>{summary.total}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#e8f3e7' }}>
                <p className="text-sm label-ui" style={{ color: '#5f705d' }}>Em andamento</p>
                <p className="text-3xl font-extrabold mt-1 sm:text-4xl" style={{ color: '#4f7a4f' }}>{summary.andamento}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#fff4e5' }}>
                <p className="text-sm label-ui" style={{ color: '#b37d18' }}>Atrasadas</p>
                <p className="text-3xl font-extrabold mt-1 sm:text-4xl" style={{ color: '#b26d0c' }}>{summary.atraso}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#edf7ef' }}>
                <p className="text-sm label-ui" style={{ color: '#3b8551' }}>Concluídas</p>
                <p className="text-3xl font-extrabold mt-1 sm:text-4xl" style={{ color: '#1f7a43' }}>{summary.concluida}</p>
              </div>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7' }}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <Select label="Status" value={fStatus} onChange={setFStatus} options={STATUS_OPTIONS} />
                <Select label="Prioridade" value={fPrioridade} onChange={setFPrioridade} options={PRIORITY_OPTIONS} />
                <Input
                  label="Prazo exato"
                  type="date"
                  value={fData}
                  onChange={(e) => setFData(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    onClick={() => {
                      setFStatus('');
                      setFPrioridade('');
                      setFData('');
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors sm:w-auto"
                    style={{ backgroundColor: '#edf2ee', color: '#57715d' }}
                  >
                    <Filter size={16} /> Limpar filtros
                  </button>
                  <button
                    onClick={load}
                    className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors sm:w-auto"
                    style={{ backgroundColor: '#e8f3e7', color: '#4f7a4f' }}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Atualizar
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl p-6 text-lg" style={{ backgroundColor: '#f8faf7', color: '#6a7367' }}>
                Carregando atividades...
              </div>
            ) : (
              viewMode === 'LISTA' ? (
                <>
                  <OpenTasksTable items={openTasks} />
                  <CompletedSection statusKey="CONCLUIDA" items={grouped.CONCLUIDA} />
                </>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <KanbanColumn statusKey="PENDENTE" items={grouped.PENDENTE} />
                  <KanbanColumn statusKey="EM_ANDAMENTO" items={grouped.EM_ANDAMENTO} />
                  <KanbanColumn statusKey="CONCLUIDA" items={grouped.CONCLUIDA} />
                </div>
              )
            )}
          </div>

        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4" style={{ backgroundColor: 'rgba(20,22,20,0.35)' }}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] p-4 sm:p-6" style={{ backgroundColor: '#fff' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{editingTask ? 'Editar Atividade' : 'Nova Atividade'}</h3>
                <p className="text-sm mt-1 sm:text-base" style={{ color: '#6e766c' }}>
                  {editingTask ? 'Atualize os dados da atividade selecionada.' : 'Crie uma nova atividade vinculada ao seu usuário.'}
                </p>
              </div>
              <button onClick={closeForm} className="text-sm font-medium" style={{ color: '#6e766c' }}>
                Fechar
              </button>
            </div>

            {editingTask ? (
              <div className="mt-4 inline-flex rounded-lg p-1" style={{ backgroundColor: '#edf0eb' }}>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('DADOS')}
                  className="px-4 py-1.5 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: activeFormTab === 'DADOS' ? '#ffffff' : 'transparent', color: activeFormTab === 'DADOS' ? '#1b1c1a' : '#6a7367' }}
                >
                  Dados
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('LOG')}
                  className="px-4 py-1.5 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: activeFormTab === 'LOG' ? '#ffffff' : 'transparent', color: activeFormTab === 'LOG' ? '#1b1c1a' : '#6a7367' }}
                >
                  Log
                </button>
              </div>
            ) : null}

            {activeFormTab === 'DADOS' ? (
              <div className="space-y-3 mt-4">
                <Input
                  label="Título"
                  placeholder="Título da atividade"
                  value={form.titulo}
                  onChange={(e) => setForm((v) => ({ ...v, titulo: e.target.value }))}
                  disabled={saving}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Descrição</label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => setForm((v) => ({ ...v, descricao: e.target.value }))}
                    rows={4}
                    placeholder="Detalhe rapidamente o objetivo da atividade"
                    disabled={saving}
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 resize-none"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                      ['--tw-ring-color' as string]: 'var(--color-primary-light)',
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <ClienteSearchDropdown
                      value={clienteBusca}
                      selectedId={form.clienteId}
                      options={visibleClienteOptions}
                      loading={loadingCarteiraClientes}
                      disabled={saving}
                      onSearchChange={(value) => {
                        setClienteBusca(value);
                        setClienteSearchQuery(value);
                        if (!value.trim()) {
                          setForm((current) => ({ ...current, clienteId: '' }));
                        }
                      }}
                      onSelect={(option) => {
                        setForm((current) => ({ ...current, clienteId: option.id }));
                        setClienteBusca(option.label);
                        setClienteSearchQuery('');
                      }}
                    />
                    <p className="text-xs mt-1" style={{ color: '#6e766c' }}>
                      Selecione um cliente da sua carteira para salvar o ID e o código na atividade.
                    </p>
                  </div>
                  <Select
                    label="Prioridade"
                    value={form.prioridade}
                    onChange={(value) => setForm((v) => ({ ...v, prioridade: value }))}
                    options={PRIORITY_OPTIONS.filter((option) => option.value)}
                    disabled={saving}
                  />
                  <Input
                    label="Prazo"
                    type="date"
                    value={form.dataLimite}
                    onChange={(e) => setForm((v) => ({ ...v, dataLimite: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    disabled={saving}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl" style={{ border: '1px solid #e5e9e1', backgroundColor: '#f8faf7' }}>
                {loadingLogs ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: '#6a7367' }}>Carregando log...</div>
                ) : activityLogs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: '#6a7367' }}>Nenhuma alteração de prazo registrada.</div>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.ID} className="px-4 py-3" style={{ borderTop: '1px solid #edf0ea' }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>
                          {log.CAMPO_ALTERADO === 'DATA_LIMITE' ? 'Prazo alterado' : log.CAMPO_ALTERADO}
                        </p>
                        <p className="text-xs" style={{ color: '#6a7367' }}>
                          {formatDate(String(log.DATA_ALTERACAO || '').slice(0, 10))} {String(log.DATA_ALTERACAO || '').slice(11, 16)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm" style={{ color: '#536172' }}>
                        De <strong>{log.VALOR_ANTERIOR ? formatDate(String(log.VALOR_ANTERIOR).slice(0, 10)) : 'sem prazo'}</strong> para <strong>{log.VALOR_NOVO ? formatDate(String(log.VALOR_NOVO).slice(0, 10)) : 'sem prazo'}</strong>
                      </p>
                      <p className="mt-1 text-xs" style={{ color: '#6e766c' }}>Usuário: {log.USUARIO || `#${log.ID_USUARIO}`}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={closeForm} className="px-4 py-2 rounded-xl text-base sm:text-lg" style={{ backgroundColor: '#eceee9' }} disabled={saving}>
                Cancelar
              </button>
              {activeFormTab === 'DADOS' ? (
                <button onClick={saveTask} className="btn-pill-primary inline-flex items-center justify-center gap-2 px-5 py-2 text-base sm:text-lg" disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {editingTask ? 'Salvar alterações' : 'Salvar'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center p-3 sm:items-center sm:p-4" style={{ backgroundColor: 'rgba(20,22,20,0.35)' }}>
          <div className="w-full max-w-lg rounded-[26px] p-4 sm:p-6" style={{ backgroundColor: '#fff' }}>
            <h3 className="font-display text-2xl font-extrabold sm:text-3xl">Excluir atividade</h3>
            <p className="text-base mt-2" style={{ color: '#6e766c' }}>
              Tem certeza que deseja excluir <strong>{deleteTarget.TITULO}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl text-base sm:text-lg" style={{ backgroundColor: '#eceee9' }} disabled={loadingActionId === deleteTarget.ID}>
                Cancelar
              </button>
              <button onClick={removeTask} className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-base sm:text-lg" style={{ backgroundColor: '#c93e3b', color: '#fff' }} disabled={loadingActionId === deleteTarget.ID}>
                {loadingActionId === deleteTarget.ID ? <Loader2 size={16} className="animate-spin" /> : null}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
