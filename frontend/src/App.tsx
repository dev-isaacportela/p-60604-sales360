import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { initMitra } from './lib/mitra-auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import AgendaPage from './pages/AgendaPage';
import AgendaCoordenadorPage from './pages/AgendaCoordenadorPage';
import ClientesPage from './pages/ClientesPage';
import TarefasPage from './pages/TarefasPage';
import SimulacaoPage from './pages/SimulacaoPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ComparativoPage from './pages/ComparativoPage';
import ConfiguracoesUsuarioPage from './pages/ConfiguracoesUsuarioPage';
import PainelGestaoPage from './pages/PainelGestaoPage';
import GovernancaRcaPage from './pages/GovernancaRcaPage';
import GestaoCadastrosPage from './pages/GestaoCadastrosPage';
import GestaoBuVendedoresPage from './pages/GestaoBuVendedoresPage';
import AcompanhamentoSemanalPage from './pages/AcompanhamentoSemanalPage';
import AcompanhamentoSemanalVendedorPage from './pages/AcompanhamentoSemanalVendedorPage';
import ConfiguracaoEscopoUsuariosPage from './pages/ConfiguracaoEscopoUsuariosPage';
import AlertasInteligentesPage from './pages/AlertasInteligentesPage';
import DirecionamentoSemanalPage from './pages/DirecionamentoSemanalPage';
import AdminAcompanhamentoSemanalPage from './pages/AdminAcompanhamentoSemanalPage';
import GestaoCarteiraCoordenadorPage from './pages/GestaoCarteiraCoordenadorPage';
import GestaoTitularesPage from './pages/GestaoTitularesPage';
import FeriasVendedorPage from './pages/FeriasVendedorPage';
import GestaoMetasDiretoriaPage from './pages/GestaoMetasDiretoriaPage';
import GestaoAcessoExecutivasPage from './pages/GestaoAcessoExecutivasPage';
import GestaoCoordenadoresPage from './pages/GestaoCoordenadoresPage';
import AnaliseDiretoriaPage from './pages/AnaliseDiretoriaPage';
import FaturamentoDiretoriaPage from './pages/FaturamentoDiretoriaPage';
import GestaoCargosUsuariosPage from './pages/GestaoCargosUsuariosPage';
import AjudaPage from './pages/AjudaPage';
import SuportePage from './pages/SuportePage';
import PainelDesenvolvedorPage from './pages/PainelDesenvolvedorPage';
import ReleaseNotesPage from './pages/ReleaseNotesPage';
import SolicitacoesComprasPage from './pages/SolicitacoesComprasPage';

const PainelValidacaoPage = lazy(() => import('./pages/PainelValidacaoPage'));

function App() {
  const [configured, setConfigured] = useState(initMitra);

  if (!configured) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={() => setConfigured(true)} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={() => setConfigured(true)} />} />
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/agenda-coordenador" element={<AgendaCoordenadorPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:clienteId" element={<ClientesPage />} />
        <Route path="/painel-gestao" element={<PainelGestaoPage />} />
        <Route path="/governanca-rca" element={<GovernancaRcaPage />} />
        <Route path="/gestao-cadastros" element={<GestaoCadastrosPage />} />
        <Route path="/gestao-bus-vendedores" element={<GestaoBuVendedoresPage />} />
        <Route path="/configuracao-escopo-usuarios" element={<ConfiguracaoEscopoUsuariosPage />} />
        <Route path="/acomp-semanal-vendedor" element={<AcompanhamentoSemanalVendedorPage />} />
        <Route path="/acomp-semanal" element={<AcompanhamentoSemanalPage />} />
        <Route path="/admin-acomp-semanal" element={<AdminAcompanhamentoSemanalPage />} />
        <Route path="/gestao-carteira" element={<GestaoCarteiraCoordenadorPage />} />
        <Route path="/gestao-titulares" element={<GestaoTitularesPage />} />
        <Route path="/ferias-vendedor" element={<FeriasVendedorPage />} />
        <Route path="/gestao-metas" element={<GestaoMetasDiretoriaPage />} />
        <Route path="/gestao-acesso-executivas" element={<GestaoAcessoExecutivasPage />} />
        <Route path="/gestao-coordenadores" element={<GestaoCoordenadoresPage />} />
        <Route path="/analise-diretoria" element={<AnaliseDiretoriaPage />} />
        <Route path="/faturamento" element={<FaturamentoDiretoriaPage />} />
        <Route path="/gestao-cargos-usuarios" element={<GestaoCargosUsuariosPage />} />
        <Route path="/ajuda" element={<AjudaPage />} />
        <Route path="/suporte" element={<SuportePage />} />
        <Route path="/painel-desenvolvedor" element={<PainelDesenvolvedorPage />} />
        <Route path="/release-notes" element={<ReleaseNotesPage />} />
        <Route path="/painel-validacao" element={<Suspense fallback={<div className="p-6">Carregando Painel de Validação...</div>}><PainelValidacaoPage /></Suspense>} />
        <Route path="/alertas" element={<AlertasInteligentesPage />} />
        <Route path="/direcionamento-semanal" element={<DirecionamentoSemanalPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesUsuarioPage />} />
        <Route path="/tarefas" element={<TarefasPage />} />
        <Route path="/solicitacoes-compras" element={<SolicitacoesComprasPage />} />
        <Route path="/simulacao" element={<SimulacaoPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/comparativo" element={<ComparativoPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
