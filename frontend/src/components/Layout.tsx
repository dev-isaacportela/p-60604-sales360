import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Users, CheckSquare, Calculator, BarChart3, Bell, Settings, CircleHelp, Search, Menu, X, UserCog, BriefcaseBusiness, ShieldCheck, Boxes, Link2, Repeat, Target, FileSearch, Bug, Code2, ReceiptText, ClipboardList, UserX, UserCheck, Compass, Sun, Moon, GitCompare, Megaphone } from 'lucide-react';
import { closeChatMitra } from 'mitra-interactions-sdk';
import { clearSession } from '../lib/mitra-auth';
import { callSFSingle, SF } from '../hooks/useMitra';
import { useTema } from '../hooks/useTema';
import { TEMA_ESCURO_LIGADO } from '../lib/temaLigado';
import ReleaseNotesPopup from './ReleaseNotesPopup';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [alertasNaoLidos, setAlertasNaoLidos] = useState(0);
  const [canSeePainelGestao, setCanSeePainelGestao] = useState(false);
  const [canSeeAdminAcomp, setCanSeeAdminAcomp] = useState(false);
  const [canSeePainelCoordenador, setCanSeePainelCoordenador] = useState(false);
  const [canSeeDiretoria, setCanSeeDiretoria] = useState(false);
  const [isDiretorUser, setIsDiretorUser] = useState(false);
  const [canSeePainelDev, setCanSeePainelDev] = useState(false);
  const [canSeeSolicitacoesCompras, setCanSeeSolicitacoesCompras] = useState(false);
  const [canSeeAcessoExecutivas, setCanSeeAcessoExecutivas] = useState(false);
  const navigate = useNavigate();
  const { escuro, alternar } = useTema();

  useEffect(() => {
    function carregarContadores() {
      Promise.allSettled([
        callSFSingle(SF.contarTarefasPendentes),
        callSFSingle(SF.painelGestaoPermissao),
        callSFSingle(SF.alertasInteligentesContarNaoLidos, {}),
        callSFSingle(SF.dadosUsuarioLogado),
        callSFSingle(SF.painelCoordenadorPermissao),
        callSFSingle(SF.gestaoMetasDiretoriaPermissao),
        callSFSingle(SF.suportePainelPermissao),
        callSFSingle(SF.solicitacoesComprasPermissaoGestao),
        callSFSingle(SF.meuAcessoBloqueado),
        callSFSingle(SF.gestaoAcessoExecutivasPermissao),
      ]).then(([tarefasResp, permissaoResp, alertasResp, usuarioResp, coordenadorResp, diretoriaResp, painelDevResp, solicitacoesResp, bloqueioResp, acessoExecutivasResp]) => {
      // Executiva desativada por um gestor: encerra a sessao e volta ao login
      if (bloqueioResp.status === 'fulfilled' && Number(bloqueioResp.value?.BLOQUEADO || 0) === 1) {
        closeChatMitra();
        clearSession();
        window.location.replace('/login?bloqueado=1');
        return;
      }

      if (acessoExecutivasResp.status === 'fulfilled' && acessoExecutivasResp.value) {
        setCanSeeAcessoExecutivas(Number(acessoExecutivasResp.value.PODE_ACESSAR || 0) === 1);
      }

      if (tarefasResp.status === 'fulfilled' && tarefasResp.value) {
        setTarefasPendentes(Number(tarefasResp.value.TOTAL) || 0);
      }

      if (permissaoResp.status === 'fulfilled' && permissaoResp.value) {
        setCanSeePainelGestao(Number(permissaoResp.value.PODE_ACESSAR || 0) === 1);
      }

      if (alertasResp.status === 'fulfilled' && alertasResp.value) {
        setAlertasNaoLidos(Number(alertasResp.value.TOTAL) || 0);
      }

      if (usuarioResp.status === 'fulfilled' && usuarioResp.value) {
        const email = String(usuarioResp.value.DESCR || usuarioResp.value.EMAIL || '').trim().toLowerCase();
        setCanSeeAdminAcomp(email === 'ti@benenutri.com');
      }

      if (coordenadorResp.status === 'fulfilled' && coordenadorResp.value) {
        setCanSeePainelCoordenador(Number(coordenadorResp.value.PODE_ACESSAR || 0) === 1);
      }

      if (diretoriaResp.status === 'fulfilled' && diretoriaResp.value) {
        setCanSeeDiretoria(Number(diretoriaResp.value.PODE_ACESSAR || 0) === 1);
        setIsDiretorUser(String(diretoriaResp.value.CARGO_ATUAL || '').trim().toUpperCase() === 'DIRETORIA');
      }

      if (painelDevResp.status === 'fulfilled' && painelDevResp.value) {
        setCanSeePainelDev(Number(painelDevResp.value.PODE_ACESSAR || 0) === 1);
      }

      if (solicitacoesResp.status === 'fulfilled' && solicitacoesResp.value) {
        setCanSeeSolicitacoesCompras(Number(solicitacoesResp.value.PODE_ACESSAR || 0) === 1);
      }
      });
    }

    carregarContadores();
    const interval = window.setInterval(carregarContadores, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const mainNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={22} /> },
    { label: 'Agenda', path: '/agenda', icon: <CalendarDays size={22} /> },
    { label: 'Clientes', path: '/clientes', icon: <Users size={22} /> },
    { label: 'Atividades', path: '/tarefas', icon: <CheckSquare size={22} />, badge: tarefasPendentes },
    ...(canSeeSolicitacoesCompras ? [{ label: 'Solicitações', path: '/solicitacoes-compras', icon: <ClipboardList size={22} /> }] : []),
    { label: 'Mix Builder', path: '/simulacao', icon: <Calculator size={22} /> },
    { label: 'Analytics', path: '/analytics', icon: <BarChart3 size={22} /> },
    { label: 'Comparativo', path: '/comparativo', icon: <GitCompare size={22} /> },
    { label: 'Alertas', path: '/alertas', icon: <Bell size={22} />, badge: alertasNaoLidos },
    ...(canSeePainelCoordenador || canSeeDiretoria ? [{ label: 'Direcionamento Semanal', path: '/direcionamento-semanal', icon: <Compass size={22} /> }] : []),
  ];

  const coordinatorNavItems: NavItem[] = canSeePainelCoordenador && !isDiretorUser ? [
    { label: 'Agenda dos Vendedores', path: '/agenda-coordenador', icon: <CalendarDays size={22} /> },
    { label: 'Gestão de Carteira', path: '/gestao-carteira', icon: <Users size={22} /> },
    { label: 'Titulares de Clientes', path: '/gestao-titulares', icon: <UserCheck size={22} /> },
    { label: 'Férias de Vendedores', path: '/ferias-vendedor', icon: <CalendarDays size={22} /> },
  ] : [];

  const diretoriaNavItems: NavItem[] = canSeeDiretoria ? [
    ...(!isDiretorUser ? [
      { label: 'Análise Diretoria', path: '/analise-diretoria', icon: <BarChart3 size={22} /> },
      { label: 'Faturamento', path: '/faturamento', icon: <ReceiptText size={22} /> },
    ] : []),
    { label: 'Papéis de Usuários', path: '/gestao-cargos-usuarios', icon: <UserCog size={22} /> },
    ...(!isDiretorUser ? [{ label: 'Gestão de Metas', path: '/gestao-metas', icon: <Target size={22} /> }] : []),
    { label: 'Gestão Coordenadores', path: '/gestao-coordenadores', icon: <ShieldCheck size={22} /> },
    ...(!canSeePainelCoordenador || isDiretorUser ? [{ label: 'Titulares de Clientes', path: '/gestao-titulares', icon: <UserCheck size={22} /> }] : []),
  ] : [];

  const managementNavItems: NavItem[] = [
    ...(canSeePainelGestao ? [{ label: 'Acomp. Semanal', path: '/acomp-semanal', icon: <Repeat size={22} /> }] : []),
    ...(canSeeAdminAcomp ? [{ label: 'Acomp. Semanal Admin', path: '/admin-acomp-semanal', icon: <ShieldCheck size={22} /> }] : []),
    ...(canSeeAdminAcomp ? [{ label: 'Painel de Validação', path: '/painel-validacao', icon: <FileSearch size={22} /> }] : []),
    ...(canSeePainelGestao ? [{ label: 'Painel de Gestão', path: '/painel-gestao', icon: <BriefcaseBusiness size={22} /> }] : []),
    ...(canSeePainelGestao ? [{ label: 'Governança RCA', path: '/governanca-rca', icon: <ShieldCheck size={22} /> }] : []),
    ...(canSeePainelGestao ? [{ label: 'BUs e Vendedores', path: '/gestao-bus-vendedores', icon: <Link2 size={22} /> }] : []),
    ...(canSeePainelGestao ? [{ label: 'Escopo Usuários', path: '/configuracao-escopo-usuarios', icon: <Link2 size={22} /> }] : []),
    ...(canSeePainelGestao ? [{ label: 'Gestão Cadastros', path: '/gestao-cadastros', icon: <Boxes size={22} /> }] : []),
    ...(canSeePainelDev ? [{ label: 'Painel Dev', path: '/painel-desenvolvedor', icon: <Code2 size={22} /> }] : []),
    ...(canSeePainelDev ? [{ label: 'Notas de Versão', path: '/release-notes', icon: <Megaphone size={22} /> }] : []),
  ];

  const acessoExecutivasNavItems: NavItem[] = canSeeAcessoExecutivas ? [
    { label: 'Executivas de Venda', path: '/gestao-acesso-executivas', icon: <UserX size={22} /> },
  ] : [];

  const navSections: NavSection[] = [
    { items: mainNavItems },
    ...(coordinatorNavItems.length > 0 ? [{ title: 'Coordenador', items: coordinatorNavItems }] : []),
    ...(diretoriaNavItems.length > 0 ? [{ title: 'Diretoria', items: diretoriaNavItems }] : []),
    ...(managementNavItems.length > 0 || acessoExecutivasNavItems.length > 0 ? [{ title: 'Gestão', items: [...acessoExecutivasNavItems, ...managementNavItems] }] : []),
    { items: [
    { label: 'Ajuda', path: '/ajuda', icon: <CircleHelp size={22} /> },
    { label: 'Configurações', path: '/configuracoes', icon: <UserCog size={22} /> },
    ] },
  ];

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app-scale-80 flex h-screen min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--shell-bg)' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ backgroundColor: 'var(--shell-overlay)' }} onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(82vw,260px)] flex flex-col transition-transform duration-200 lg:w-[260px] lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        <div className="px-6 pt-8 pb-6">
          <h1 className="font-display text-4xl leading-none font-extrabold" style={{ color: 'var(--brand)' }}>Sales 360</h1>
          <p className="mt-2 text-xs tracking-[0.12em] uppercase" style={{ color: 'var(--nav-muted)' }}>Comercial Externo</p>
          <button className="absolute right-4 top-4 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} style={{ color: 'var(--nav-close)' }} />
          </button>
        </div>

        <nav className="px-4 space-y-4 overflow-y-auto">
          {navSections.map((section, sectionIndex) => (
            <div key={section.title || `main-${sectionIndex}`} className="space-y-1">
              {section.title ? (
                <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--nav-muted)' }}>
                  {section.title}
                </div>
              ) : null}
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'var(--nav-active-bg)' : 'transparent',
                    color: isActive ? 'var(--nav-active-text)' : 'var(--nav-item)',
                    fontWeight: isActive ? 700 : 500,
                  })}
                >
                  {item.icon}
                  <span className="text-[15px] leading-none">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className="ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: item.path === '/alertas' ? 'var(--badge-alert-bg)' : 'var(--badge-ok-bg)', color: item.path === '/alertas' ? 'var(--badge-alert-text)' : 'var(--badge-ok-text)' }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto px-4 pb-6">
          <div className="space-y-2">
            <button onClick={() => navigate('/suporte')} className="flex w-full items-center gap-2 px-4 py-2 text-left rounded-xl text-[14px]" style={{ color: 'var(--nav-link)' }}><Bug size={16} /> Suporte</button>
            <button onClick={handleLogout} className="w-full text-left px-4 py-2 rounded-xl text-[14px]" style={{ color: 'var(--nav-link-strong)' }}>Sair</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full flex flex-col">
        <header className="min-h-[64px] px-4 py-3 flex items-center gap-2 sm:h-[78px] sm:px-6 sm:gap-4" style={{ backgroundColor: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)' }}>
          <button className="lg:hidden rounded-xl p-2" onClick={() => setSidebarOpen(true)} style={{ backgroundColor: 'var(--header-btn-bg)' }}>
            <Menu size={20} />
          </button>
          <div className="font-display text-2xl font-extrabold truncate sm:text-4xl" style={{ color: 'var(--brand)' }}>Benenutri</div>
          <div className="flex-1 min-w-2" />
          <div className="hidden md:flex items-center gap-2 rounded-full px-4 py-2 min-w-0 md:min-w-[260px] lg:min-w-[300px]" style={{ backgroundColor: 'var(--search-bg)' }}>
            <Search size={17} style={{ color: 'var(--search-icon)' }} />
            <input
              placeholder="Buscar clientes, pedidos..."
              className="w-full bg-transparent outline-none text-lg"
              style={{ color: 'var(--search-text)' }}
            />
          </div>
          <div className="hidden sm:block flex-1 min-w-2" />
          <button className="rounded-full p-2" style={{ color: 'var(--icon-btn)' }}><Bell size={20} /></button>
          {TEMA_ESCURO_LIGADO && <button
            onClick={alternar}
            className="rounded-full p-2"
            style={{ color: 'var(--icon-btn)' }}
            title={escuro ? 'Tema claro' : 'Tema escuro'}
            aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          >
            {escuro ? <Sun size={20} /> : <Moon size={20} />}
          </button>}
          <button onClick={() => navigate('/ajuda')} className="hidden sm:inline-flex rounded-full p-2" style={{ color: 'var(--icon-btn)' }}><CircleHelp size={20} /></button>
          <button onClick={() => navigate('/configuracoes')} className="rounded-full p-2" style={{ color: 'var(--icon-btn)' }}><Settings size={20} /></button>
          <div className="hidden h-9 w-9 rounded-full items-center justify-center font-bold sm:flex sm:h-10 sm:w-10" style={{ backgroundColor: 'var(--avatar-bg)', color: 'var(--avatar-text)' }}>RF</div>
        </header>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </div>
      </main>

      <ReleaseNotesPopup />
    </div>
  );
}
