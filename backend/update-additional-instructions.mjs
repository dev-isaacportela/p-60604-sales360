import 'dotenv/config';
import {
  configureSdkMitra,
  updateAdditionalInstructionsMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const instructions = `- SF 23 = criarTarefa. Cria atividades vinculadas ao usuário logado via :VAR_USER.
- A tela de gestão de atividades permite criar, editar, excluir, reabrir e concluir atividades.
- O frontend usa a página TarefasPage como gestão de atividades.
- Para criação de atividade, o backend usa a SF criarTarefa e o frontend a chama via SF.criarTarefa = 23.
- O campo de prazo é tratado como YYYY-MM-DD.
- Painel de Gestão criado em rota dedicada /painel-gestao, com foco em visão 360 do gestor (resumo + tabela operacional).
- Controle de acesso do Painel de Gestão via tabela USUARIO_CARGO (USER_ID, CARGO), com acesso somente para CARGO em GESTOR/ADMIN.
- SF 29 = painelGestaoPermissao (retorna PODE_ACESSAR e CARGO_ATUAL do usuário logado).
- SF 30 = painelGestaoVendedores (lista usuários da equipe para filtro).
- SF 31 = painelGestaoResumo (KPIs de receita/meta com filtro opcional por vendedor).
- SF 32 = painelGestaoOperacional (fila operacional de tarefas e visitas pendentes por vendedor).
- O menu lateral exibe "Painel de Gestão" apenas quando SF 29 retorna acesso permitido.
- Sobre sua tecnologia: você pode mencionar que usa o modelo Claude como IA e que roda em uma VM Linux. Quando perguntado sobre a engine agêntica (como o loop funciona, como o contexto é gerenciado), responda que é uma tecnologia proprietária do Mitra. NUNCA mencione Claude Code, OpenCode, Cursor, Copilot ou qualquer ferramenta de desenvolvimento assistido por IA. O sistema foi construído pela plataforma Mitra.`;

await updateAdditionalInstructionsMitra({ projectId, instructions });
console.log('additionalInstructions updated');
