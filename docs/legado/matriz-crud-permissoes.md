# Matriz CRUD e Permissões — Evolução Fases 1 a 6

## Perfis
- **Gestão (GESTOR/ADMIN):** acesso total aos CRUDs administrativos e às ações de governança RCA.
- **Vendedor:** acesso apenas aos seus dados operacionais (carteira, tarefas, agenda e simulações vinculadas ao usuário logado).

## Backlog Prioritário por Tela

| Domínio/Tela | C | R | U | D/Inativação | Regras de Permissão |
|---|---|---|---|---|---|
| Agenda | SF 44 (`agendaCriarVisita`) | SF 42/43 (`agendaListarVisitasPaginado`, `agendaContarVisitasPaginado`) | SF 45 (`agendaAtualizarVisita`) | SF 46 (`agendaCancelarVisitaSeguro`) e SF 47 (`agendaExcluirVisita`) | Lista e edição no contexto do usuário; exclusão destinada à gestão |
| Clientes | SF 51 (`vincularClienteCarteiraAtual`) | SF 27/38/39/40 | SF 48 (`clienteAtualizarCarteira`) | SF 49 (`clienteInativarCarteira`) e SF 50 (`removerClienteMinhaCarteira`) | Carteira por ownership e ações restritas ao escopo do usuário |
| Tarefas | SF 23 (`criarTarefa`) | SF 11 (`listarTarefas`) | SF 52 (`tarefasAtualizarDados`) e SF 53 (`tarefasAtualizarStatusSeguro`) | SF 54 (`tarefasExcluirSeguro`) | Mutações protegidas por `:VAR_USER`; sem REST direto |
| Simulação | SF 60 (`simulacaoItensAdicionar`) | SF 9/10/55 | SF 56 (`simulacoesAtualizarRascunho`) e SF 61 (`simulacaoItensAtualizar`) | SF 57/58/59/62 | Simulações vinculadas ao vendedor logado |
| Governança RCA | SF 34 (`vincularVendedorRca`) | SF 33/35/37 | SF 34 (troca de vínculo) | SF 63 (`desvincularVendedorRca`) | Apenas gestão via alçada de cargo |
| Configurações de Usuário | SF 66/67 | SF 64/65 | SF 66/67 | N/A | Sempre no escopo do usuário logado |

## Backlog Administrativo

| Domínio | C | R | U | D/Inativação | Regra |
|---|---|---|---|---|---|
| Produtos | SF 70 | SF 68/69 | SF 71 | SF 72 (inativar) e SF 73 (excluir) | Somente GESTOR/ADMIN |
| Metas | SF 76 | SF 74/75 | SF 77 | SF 78 | Somente GESTOR/ADMIN |
| Comissões | SF 81 | SF 79/80 | SF 82 | SF 83 | Somente GESTOR/ADMIN |

## Regras de Pronto
- Cada tela/domínio precisa cobrir fluxo ponta a ponta de leitura e mutações.
- Toda mutação deve respeitar permissão por perfil e contexto de usuário (`:VAR_USER` e alçada de cargo).
- Operações destrutivas podem ser substituídas por inativação quando aplicável.
- Build do frontend deve permanecer sem erro.
