import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, Shield, UserCircle2, UserCog2, Users } from 'lucide-react';
import { callSF, callSFMutation, callSFMutationComErro, callSFSingle, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';

interface UsuarioLogado {
  ID: number;
  EMAIL: string;
  NOME_INTERNO: string;
  STATUS_FUNCIONARIO: string;
  ID_SUBSTITUTO: number | null;
  MODO_AGENDA: string;
  EXIBICAO_TAREFAS: string;
  PAGINA_INICIAL: string;
}

interface UsuarioSubstituto {
  ID: number;
  NOME: string;
  EMAIL: string;
}

interface ConfigForm {
  nomeInterno: string;
  statusFuncionario: string;
  idSubstituto: string;
  modoAgenda: string;
  exibicaoTarefas: string;
  paginaInicial: string;
}

interface GoogleAgendaStatus {
  CONFIGURADO: number;
  CALENDAR_ID?: string;
  STATUS?: string;
  ULTIMO_ERRO?: string;
  CONFIGURADO_EM?: string;
  ATUALIZADO_EM?: string;
  ULTIMA_SYNC?: string;
  CLIENT_ID_MASK?: string;
  EMAIL_GOOGLE?: string;
}

interface GoogleOAuthApp {
  CLIENT_ID?: string;
  REDIRECT_URI?: string;
}

interface GoogleCalendario {
  id: string;
  nome: string;
  principal?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'FERIAS', label: 'Férias' },
];

const MODO_AGENDA_OPTIONS = [
  { value: 'DIA', label: 'Dia' },
  { value: 'SEMANA', label: 'Semana' },
  { value: 'MES', label: 'Mês' },
];

const EXIBICAO_TAREFAS_OPTIONS = [
  { value: 'LISTA', label: 'Lista' },
  { value: 'KANBAN', label: 'Kanban' },
];

const PAGINA_INICIAL_OPTIONS = [
  { value: '/', label: 'Dashboard' },
  { value: '/agenda', label: 'Agenda' },
  { value: '/clientes', label: 'Clientes' },
  { value: '/tarefas', label: 'Atividades' },
  { value: '/simulacao', label: 'Mix Builder' },
  { value: '/analytics', label: 'Analytics' },
  { value: '/painel-gestao', label: 'Painel de Gestão' },
];

const DEFAULT_FORM: ConfigForm = {
  nomeInterno: '',
  statusFuncionario: 'ATIVO',
  idSubstituto: '',
  modoAgenda: 'SEMANA',
  exibicaoTarefas: 'LISTA',
  paginaInicial: '/',
};

const GOOGLE_OAUTH_STATE_KEY = 'ce360:googleOAuthState';
const GOOGLE_OAUTH_CALENDAR_KEY = 'ce360:googleOAuthCalendarId';
const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  // Escopo granular: permite listar os calendários do usuário, sem dar acesso ao conteúdo deles.
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'openid',
  'email',
].join(' ');

/** Nonce anti-CSRF do OAuth: liga o retorno do Google a esta aba/usuário. */
function gerarStateOAuth(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function labelTipoAcesso(value?: string) {
  if (!value) return 'Não informado';
  if (value === 'owner') return 'Proprietário';
  if (value === 'dev') return 'Desenvolvedor';
  if (value === 'business') return 'Negócio';
  return value;
}

function labelStatusFuncionario(value?: string) {
  if (!value) return 'Ativo';
  if (value.toUpperCase() === 'FERIAS') return 'Férias';
  if (value.toUpperCase() === 'ATIVO') return 'Ativo';
  return value;
}

function sanitizeCredential(value: string): string {
  return value.trim().replace(/'/g, "''");
}

export default function ConfiguracoesUsuarioPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);
  const [substitutos, setSubstitutos] = useState<UsuarioSubstituto[]>([]);
  const [form, setForm] = useState<ConfigForm>(DEFAULT_FORM);
  const [googleStatus, setGoogleStatus] = useState<GoogleAgendaStatus | null>(null);
  const [googleApp, setGoogleApp] = useState<GoogleOAuthApp | null>(null);
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const [calendarios, setCalendarios] = useState<GoogleCalendario[]>([]);
  const [carregandoCalendarios, setCarregandoCalendarios] = useState(false);
  const [listaIndisponivel, setListaIndisponivel] = useState(false);

  function mapPaginaInicial(value?: string): string {
    if (!value) return '/';
    if (value === '/dashboard') return '/';
    return PAGINA_INICIAL_OPTIONS.some((item) => item.value === value) ? value : '/';
  }

  async function load() {
    setLoading(true);
    const [logged, subs, google, googleAppCfg] = await Promise.allSettled([
      callSFSingle(SF.detalharConfiguracoesUsuario),
      callSF(SF.listarUsuariosSubstitutos),
      callSFSingle(SF.googleAgendaStatus),
      callSFSingle(SF.googleOAuthAppConfig),
    ]);

    if (logged.status === 'fulfilled') {
      const user = (logged.value as UsuarioLogado | null) || null;
      setUsuarioLogado(user);
      if (user) {
        setForm({
          nomeInterno: user.NOME_INTERNO && user.NOME_INTERNO !== user.EMAIL ? String(user.NOME_INTERNO) : '',
          statusFuncionario: String(user.STATUS_FUNCIONARIO || 'ATIVO').toUpperCase(),
          idSubstituto: user.ID_SUBSTITUTO ? String(user.ID_SUBSTITUTO) : '',
          modoAgenda: String(user.MODO_AGENDA || 'SEMANA').toUpperCase(),
          exibicaoTarefas: String(user.EXIBICAO_TAREFAS || 'LISTA').toUpperCase(),
          paginaInicial: mapPaginaInicial(user.PAGINA_INICIAL),
        });
      }
    }

    if (subs.status === 'fulfilled') {
      setSubstitutos(subs.value as UsuarioSubstituto[]);
    }

    if (google.status === 'fulfilled') {
      const status = (google.value as GoogleAgendaStatus | null) || null;
      setGoogleStatus(status);
      setGoogleCalendarId(status?.CALENDAR_ID || 'primary');
    }

    if (googleAppCfg.status === 'fulfilled') {
      setGoogleApp((googleAppCfg.value as GoogleOAuthApp | null) || null);
    }

    setLoading(false);

    const statusGoogle = google.status === 'fulfilled' ? (google.value as GoogleAgendaStatus | null) : null;
    if (statusGoogle?.CONFIGURADO) await carregarCalendarios(statusGoogle.CALENDAR_ID || 'primary');
  }

  /** Passo 1: leva o usuário ao consentimento do Google. */
  function conectarGoogleAgenda() {
    if (!googleApp?.CLIENT_ID || !googleApp?.REDIRECT_URI) {
      addToast('error', 'A integração com o Google ainda não foi liberada pelo TI.');
      return;
    }

    const state = gerarStateOAuth();
    sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state);
    sessionStorage.setItem(GOOGLE_OAUTH_CALENDAR_KEY, googleCalendarId || 'primary');

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', googleApp.CLIENT_ID);
    url.searchParams.set('redirect_uri', googleApp.REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);

    window.location.href = url.toString();
  }

  /** Passo 2: o Google devolveu o código; troca por refresh token e vincula ao usuário logado. */
  async function processarRetornoGoogle(code: string, state: string) {
    const esperado = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY) || '';
    const calendarId = sessionStorage.getItem(GOOGLE_OAUTH_CALENDAR_KEY) || 'primary';
    sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_CALENDAR_KEY);

    if (!esperado || esperado !== state) {
      addToast('error', 'Não foi possível validar a origem da autorização. Tente conectar novamente.');
      return;
    }

    setConectandoGoogle(true);
    try {
      // A SF 365 é JAVASCRIPT: com acesso business ela pode ler e falar com o Google, mas
      // não pode gravar. Por isso ela devolve o token e quem persiste é a SF SQL 366, que
      // resolve :VAR_USER no servidor — a conexão fica amarrada a quem está logado, e não
      // a um id vindo do navegador.
      const troca = await callSFMutationComErro(SF.googleAgendaTrocarCodigo, { code, state });
      if (!troca.ok) {
        addToast('error', troca.error || 'Não foi possível concluir a autorização com o Google.');
        return;
      }

      const refreshToken = String(troca.dados?.refreshToken || '').trim();
      if (!refreshToken) {
        addToast('error', 'O Google não devolveu a autorização completa. Tente conectar novamente.');
        return;
      }

      await callSFMutation(SF.googleAgendaConfirmarConexao, {
        refreshToken: sanitizeCredential(refreshToken),
        emailGoogle: sanitizeCredential(String(troca.dados?.emailGoogle || '')),
        calendarId: sanitizeCredential(calendarId || 'primary'),
      });

      const atualizado = (await callSFSingle(SF.googleAgendaStatus)) as GoogleAgendaStatus | null;
      if (!atualizado?.CONFIGURADO) {
        addToast('error', 'A autorização expirou antes de ser vinculada. Tente conectar novamente.');
        return;
      }

      addToast('success', 'Google Agenda conectado com sucesso.');
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao conectar o Google Agenda.');
    } finally {
      setConectandoGoogle(false);
      await load();
    }
  }

  /**
   * Busca os calendários da conta Google. A SF que fala com o Google é JAVASCRIPT e
   * não enxerga :VAR_USER, então primeiro abrimos um ticket de uso único por uma SF SQL
   * — é ela quem amarra a consulta ao usuário logado, no servidor.
   */
  async function carregarCalendarios(calendarAtual?: string) {
    setCarregandoCalendarios(true);
    try {
      const ticket = gerarStateOAuth();
      const abriu = await callSFMutation(SF.googleAgendaAbrirTicket, { ticket });
      if (!abriu) throw new Error('Não foi possível abrir a consulta de calendários.');

      const itens = (await callSF(SF.googleAgendaListarCalendarios, { ticket })) as GoogleCalendario[];
      // O ticket é de uso único, mas quem o marca como consumido é esta SF SQL: a SF que
      // fala com o Google é JAVASCRIPT e, com acesso business, não pode escrever no banco.
      await callSFMutation(SF.googleAgendaConsumirTicket, { ticket });

      if (!itens || !itens.length) {
        setListaIndisponivel(true);
        setCalendarios([]);
        return;
      }
      setCalendarios(itens);
      setListaIndisponivel(false);

      // O Google aceita 'primary' como apelido da agenda principal, e é assim que ela fica
      // gravada. Se o valor salvo for o id real dela, normaliza para 'primary' — senão o
      // seletor não casaria a opção e salvar seria lido como troca de agenda, recriando
      // todos os eventos sem necessidade.
      const principal = itens.find((cal) => cal.principal);
      const atual = calendarAtual ?? googleCalendarId;
      if (principal && atual === principal.id) setGoogleCalendarId('primary');
    } catch (error) {
      console.error(error);
      // Token antigo (sem o escopo da lista) ou falha de rede: cai para o campo manual.
      setListaIndisponivel(true);
      setCalendarios([]);
    } finally {
      setCarregandoCalendarios(false);
    }
  }

  async function salvarCalendarioGoogle() {
    const destino = (googleCalendarId || 'primary').trim();
    if (destino === (googleStatus?.CALENDAR_ID || 'primary')) {
      addToast('success', 'Esta já é a agenda de destino.');
      return;
    }

    setSavingGoogle(true);
    try {
      const ticket = gerarStateOAuth();
      const abriu = await callSFMutation(SF.googleAgendaAbrirTicket, { ticket });
      if (!abriu) throw new Error('Não foi possível iniciar a troca de agenda.');

      // A SF remove os eventos da agenda anterior antes de trocar: sem isso, os itens já
      // sincronizados continuariam apontando para eventos que não existem no novo destino.
      const troca = await callSFMutationComErro(SF.googleAgendaTrocarCalendario, {
        ticket,
        calendarId: sanitizeCredential(destino),
      });
      if (!troca.ok) throw new Error(troca.error || 'Não foi possível trocar a agenda de destino.');
      await callSFMutation(SF.googleAgendaConsumirTicket, { ticket });

      // A SF 371 é JavaScript e não pode gravar com acesso business, então a escrita vem
      // daqui por SFs SQL (:VAR_USER no servidor). A ordem importa: zerar os vínculos antes
      // de mudar a agenda — o caminho inverso deixaria vínculo da agenda antiga apontando
      // para o destino novo, e a sincronização seguinte quebraria com 404 no Google.
      const zerou = await callSFMutation(SF.googleAgendaZerarVinculos);
      if (!zerou) throw new Error('Não foi possível limpar os vínculos da agenda anterior.');
      const gravou = await callSFMutation(SF.googleAgendaGravarAgendaEscolhida, {
        calendarId: sanitizeCredential(destino),
      });
      if (!gravou) throw new Error('Não foi possível gravar a agenda de destino.');
      await callSFMutation(SF.googleAgendaLogTroca, {
        calendarId: sanitizeCredential(destino),
        anterior: sanitizeCredential(String(troca.dados?.anterior ?? googleStatus?.CALENDAR_ID ?? 'primary')),
        removidos: String(Number(troca.dados?.removidos ?? 0)),
      });

      addToast('success', 'Agenda de destino alterada. Os próximos compromissos vão para ela.');
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', error instanceof Error ? error.message : 'Falha ao trocar a agenda de destino.');
    } finally {
      setSavingGoogle(false);
    }
  }

  async function desconectarGoogleAgenda() {
    setSavingGoogle(true);
    try {
      const ok = await callSFMutation(SF.googleAgendaDesconectar);
      if (!ok) throw new Error('Não foi possível desconectar o Google Agenda.');
      addToast('success', 'Google Agenda desconectado.');
      setGoogleCalendarId('primary');
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao desconectar Google Agenda.');
    } finally {
      setSavingGoogle(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const erroGoogle = params.get('error');

    // Limpa os parâmetros da URL para o retorno não ser reprocessado em um refresh.
    if (code || state || erroGoogle) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (erroGoogle) {
      addToast('error', erroGoogle === 'access_denied'
        ? 'Você recusou o acesso ao Google Agenda.'
        : 'O Google não concluiu a autorização. Tente novamente.');
      sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
      sessionStorage.removeItem(GOOGLE_OAUTH_CALENDAR_KEY);
      load();
      return;
    }

    if (code && state) {
      processarRetornoGoogle(code, state);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvarTudo() {
    setSaving(true);
    try {
      const okDados = await callSFMutation(SF.atualizarDadosUsuario, {
        nomeInterno: form.nomeInterno.trim().replace(/'/g, "''"),
        statusFuncionario: form.statusFuncionario,
        idSubstituto: form.idSubstituto,
      });

      if (!okDados) {
        throw new Error('Não foi possível salvar os dados do usuário.');
      }

      const okPreferencias = await callSFMutation(SF.atualizarPreferenciasUsuario, {
        modoAgenda: form.modoAgenda,
        exibicaoTarefas: form.exibicaoTarefas,
        paginaInicial: form.paginaInicial,
      });

      if (!okPreferencias) {
        throw new Error('Não foi possível salvar as preferências do usuário.');
      }

      addToast('success', 'Configurações atualizadas com sucesso.');
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  const nomeExibicao = useMemo(() => {
    if (usuarioLogado?.NOME_INTERNO && usuarioLogado.NOME_INTERNO !== usuarioLogado.EMAIL) return usuarioLogado.NOME_INTERNO;
    return 'Usuário';
  }, [usuarioLogado]);

  const perfilExibicao = 'Usuário autenticado';
  const tipoExibicao = usuarioLogado?.ID === 0 ? labelTipoAcesso('owner') : 'Usuário';
  const statusExibicao = labelStatusFuncionario(usuarioLogado?.STATUS_FUNCIONARIO);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d4d9d0', borderTopColor: '#137432' }} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="mb-5">
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#165a3a' }}>Configurações do Usuário</h1>
        <p className="mt-1 text-base" style={{ color: '#727d71' }}>
          Edite seus dados de cobertura, substituição e preferências da interface.
        </p>
      </div>

      <div className="rounded-3xl p-6 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#d8e8d7', color: '#1f4c2e' }}>
              <UserCircle2 size={30} />
            </div>
            <div>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{nomeExibicao}</h2>
              <p className="text-sm mt-1" style={{ color: '#6f796d' }}>ID do usuário: {usuarioLogado?.ID ?? '-'}</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: statusExibicao === 'Ativo' ? '#e7f6ea' : '#fff4da', color: statusExibicao === 'Ativo' ? '#1f7d3f' : '#9b6a09' }}>
            <BadgeCheck size={14} />
            <span className="text-xs font-semibold">Status: {statusExibicao}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: '#3e5f47' }}>
            <UserCircle2 size={16} />
            <p className="text-xs label-ui font-semibold">Nome</p>
          </div>
          <p className="text-base font-semibold" style={{ color: '#1b1c1a' }}>{nomeExibicao}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: '#3e5f47' }}>
            <Shield size={16} />
            <p className="text-xs label-ui font-semibold">Tipo de Acesso</p>
          </div>
          <p className="text-base font-semibold" style={{ color: '#1b1c1a' }}>{tipoExibicao}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: '#3e5f47' }}>
            <Users size={16} />
            <p className="text-xs label-ui font-semibold">Perfil</p>
          </div>
          <p className="text-base font-semibold" style={{ color: '#1b1c1a' }}>{perfilExibicao}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: '#3e5f47' }}>
            <UserCog2 size={16} />
            <p className="text-xs label-ui font-semibold">Substituto em Férias</p>
          </div>
          <p className="text-base font-semibold" style={{ color: '#1b1c1a' }}>
            {usuarioLogado?.ID_SUBSTITUTO ? `Usuário #${usuarioLogado.ID_SUBSTITUTO}` : 'Não definido'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5 mt-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Edição de Configurações</h2>
        <p className="text-sm mt-1 mb-4" style={{ color: '#667264' }}>
          Defina cobertura de férias e preferências de navegação.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Nome de exibição"
            placeholder="Digite seu nome"
            value={form.nomeInterno}
            onChange={(event) => setForm((prev) => ({ ...prev, nomeInterno: event.target.value }))}
            disabled={saving}
            maxLength={120}
          />

          <Select
            label="Status do Funcionário"
            options={STATUS_OPTIONS}
            value={form.statusFuncionario}
            onChange={(value) => setForm((prev) => ({ ...prev, statusFuncionario: value }))}
            disabled={saving}
          />

          <Select
            label="Substituto"
            options={[{ value: '', label: 'Sem substituto' }, ...substitutos.map((item) => ({
              value: String(item.ID),
              label: `${item.NOME} (${item.EMAIL})`,
            }))]}
            value={form.idSubstituto}
            onChange={(value) => setForm((prev) => ({ ...prev, idSubstituto: value }))}
            disabled={saving}
          />

          <Select
            label="Modo padrão da Agenda"
            options={MODO_AGENDA_OPTIONS}
            value={form.modoAgenda}
            onChange={(value) => setForm((prev) => ({ ...prev, modoAgenda: value }))}
            disabled={saving}
          />

          <Select
            label="Exibição padrão de Atividades"
            options={EXIBICAO_TAREFAS_OPTIONS}
            value={form.exibicaoTarefas}
            onChange={(value) => setForm((prev) => ({ ...prev, exibicaoTarefas: value }))}
            disabled={saving}
          />

          <Select
            label="Página inicial"
            options={PAGINA_INICIAL_OPTIONS}
            value={form.paginaInicial}
            onChange={(value) => setForm((prev) => ({ ...prev, paginaInicial: value }))}
            disabled={saving}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={salvarTudo}
            disabled={saving}
            className="btn-pill-primary px-5 py-2 text-sm font-semibold disabled:opacity-70"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-5 mt-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2" style={{ color: '#3e5f47' }}>
              <CalendarDays size={18} />
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Google Agenda</h2>
            </div>
            <p className="text-sm mt-1" style={{ color: '#667264' }}>
              Conecte sua conta Google em um clique. Visitas e atividades com prazo passam a ser enviadas para o seu Google Agenda.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: googleStatus?.CONFIGURADO ? '#e7f6ea' : '#fff4da', color: googleStatus?.CONFIGURADO ? '#1f7d3f' : '#9b6a09' }}>
            <BadgeCheck size={14} />
            <span className="text-xs font-semibold">{googleStatus?.CONFIGURADO ? 'Configurado' : 'Não configurado'}</span>
          </div>
        </div>

        {googleStatus?.CONFIGURADO ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
              <p className="text-xs label-ui font-semibold" style={{ color: '#788475' }}>Conta conectada</p>
              <p className="text-sm font-semibold mt-1 break-all" style={{ color: '#263326' }}>{googleStatus.EMAIL_GOOGLE || 'Conta Google autorizada'}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
              <p className="text-xs label-ui font-semibold" style={{ color: '#788475' }}>Calendário</p>
              <p className="text-sm font-semibold mt-1" style={{ color: '#263326' }}>{googleStatus.CALENDAR_ID || 'primary'}</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
              <p className="text-xs label-ui font-semibold" style={{ color: '#788475' }}>Última sincronização</p>
              <p className="text-sm font-semibold mt-1" style={{ color: '#263326' }}>{googleStatus.ULTIMA_SYNC || 'Ainda não sincronizado'}</p>
            </div>
          </div>
        ) : null}

        {googleStatus?.ULTIMO_ERRO ? (
          <div className="rounded-xl p-3 mb-4 text-sm" style={{ backgroundColor: '#fff4da', border: '1px solid #efd28a', color: '#8a5d05' }}>
            Último erro: {googleStatus.ULTIMO_ERRO}
          </div>
        ) : null}

        {googleStatus?.CONFIGURADO ? (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-full md:w-96">
              {calendarios.length > 0 ? (
                <Select
                  label="Agenda de destino"
                  options={calendarios.map((cal) => ({
                    value: cal.principal ? 'primary' : cal.id,
                    label: cal.principal ? `${cal.nome} (principal)` : cal.nome,
                    searchText: cal.id,
                  }))}
                  value={googleCalendarId}
                  onChange={setGoogleCalendarId}
                  disabled={savingGoogle || carregandoCalendarios}
                  searchable={calendarios.length > 8}
                  placeholder={carregandoCalendarios ? 'Carregando agendas...' : 'Selecione a agenda'}
                />
              ) : (
                <Input
                  label="Agenda de destino"
                  placeholder="primary"
                  value={googleCalendarId}
                  onChange={(event) => setGoogleCalendarId(event.target.value)}
                  disabled={savingGoogle || carregandoCalendarios}
                />
              )}
            </div>
            <button
              onClick={salvarCalendarioGoogle}
              disabled={savingGoogle || carregandoCalendarios}
              className="px-5 py-2 text-sm font-semibold rounded-full transition-all disabled:opacity-70"
              style={{ backgroundColor: '#e8eee4', color: '#3e5f47' }}
            >
              {savingGoogle ? 'Salvando...' : 'Salvar agenda'}
            </button>
            <button
              onClick={() => carregarCalendarios()}
              disabled={carregandoCalendarios || savingGoogle}
              className="px-4 py-2 text-sm font-semibold rounded-full transition-all disabled:opacity-70"
              style={{ backgroundColor: 'transparent', color: '#667264', border: '1px solid #e4e9df' }}
            >
              {carregandoCalendarios ? 'Buscando...' : 'Atualizar lista'}
            </button>
          </div>
        ) : null}

        {googleStatus?.CONFIGURADO && listaIndisponivel ? (
          <div className="rounded-xl p-3 mt-3 text-sm" style={{ backgroundColor: '#fff4da', border: '1px solid #efd28a', color: '#8a5d05' }}>
            Não foi possível listar suas agendas do Google. Se você conectou antes desta atualização, clique em
            <strong> Reconectar conta Google</strong> para autorizar a leitura da lista de agendas. Enquanto isso, dá
            para informar o identificador da agenda manualmente.
          </div>
        ) : null}

        <p className="text-xs mt-3" style={{ color: '#788475' }}>
          Escolha em qual das suas agendas do Google os compromissos serão criados. Visitas a clientes, prospecções,
          reuniões internas e deslocamentos vão todos para a agenda selecionada. O sistema só cria e atualiza os
          eventos que ele mesmo gera — seus compromissos pessoais não são lidos nem alterados.
          Ao trocar de agenda, os compromissos já enviados saem da agenda anterior e são recriados na nova
          conforme forem atualizados.
        </p>

        {!googleApp?.CLIENT_ID ? (
          <div className="rounded-xl p-3 mt-4 text-sm" style={{ backgroundColor: '#fff4da', border: '1px solid #efd28a', color: '#8a5d05' }}>
            A integração com o Google ainda não foi liberada pelo TI. Assim que a credencial for cadastrada, o botão de
            conectar fica disponível aqui.
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2 flex-wrap">
          {googleStatus?.CONFIGURADO ? (
            <button
              onClick={desconectarGoogleAgenda}
              disabled={savingGoogle || conectandoGoogle}
              className="px-5 py-2 text-sm font-semibold rounded-full transition-all disabled:opacity-70"
              style={{ backgroundColor: '#f6dfdf', color: '#9f2d2d' }}
            >
              Desconectar
            </button>
          ) : null}
          <button
            onClick={conectarGoogleAgenda}
            disabled={conectandoGoogle || savingGoogle || !googleApp?.CLIENT_ID}
            className="btn-pill-primary px-5 py-2 text-sm font-semibold disabled:opacity-70"
          >
            {conectandoGoogle
              ? 'Conectando...'
              : googleStatus?.CONFIGURADO
                ? 'Reconectar conta Google'
                : 'Conectar Google Agenda'}
          </button>
        </div>
      </div>
    </div>
  );
}
