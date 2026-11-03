# Escopo Comercial — CRM Comercial Externo "Sales 360"

> Documento de levantamento para uso comercial. Mapeia produto, telas, regras de negócio, perfis, integrações e automações implementadas, para servir como base de proposta a um novo cliente que queira aproveitar este CRM como template inicial.

---

## 1. Visão Geral do Produto

**Nome interno:** Sales 360 — Comercial Externo
**Categoria:** CRM operacional para força de vendas externa (representantes/RCAs) com camadas de coordenação, diretoria e governança.
**Público-alvo:** distribuidoras, atacadistas e indústrias com força de venda de campo, operação por território/BU, ERP TOTVS (ou similar) e gestão por coordenadores/regionais.
**Posicionamento:** combina o operacional do RCA em campo (carteira, agenda, check-in, mix builder, atividades) com analytics próprio do vendedor, alertas inteligentes de prospecção, acompanhamento semanal por gestão e visão executiva para diretoria — em um só sistema.

**Vantagens competitivas frente a CRMs de prateleira:**
- Atribuição de venda por **BU/departamento + filial + seção** (não só por código de RCA no ERP), reduzindo desvio de comissão e dando rastreabilidade.
- Painel Coordenador com detecção de **venda fora do território com cliente em carteira** — anomalia que CRMs genéricos não enxergam.
- Alertas inteligentes de prospecção agrupados por produto, com priorização por potencial de faturamento.
- Pipeline de importação TOTVS já modelado, com tabelas `IMP_*` e agregações prontas.
- Acompanhamento semanal estruturado com workflow de validação e admin override.

---

## 2. Perfis de Acesso e Personas

| Perfil | Quem é | O que faz no sistema |
|---|---|---|
| **Vendedor / RCA** | Vendedor externo em campo (representante) | Vê apenas sua carteira; agenda visitas, faz check-in/check-out, registra relato, monta mix, acompanha tarefas, vê seus indicadores |
| **Coordenador** | Coordena uma ou mais BUs e gerencia equipe de vendedores | Gestão de carteira da equipe (transferir clientes), férias de vendedores, painel coordenador com anomalias, ranking da equipe |
| **Diretoria / Gestor** | Liderança comercial | Visão consolidada por BU, ranking de coordenadores, análise executiva, gestão de metas, gestão de coordenadores, papéis de usuários |
| **Administrador / TI** | Time técnico (ex.: TI) | Governança RCA, vínculos BU↔vendedor, escopo por usuário, gestão de cadastros (produtos/metas/comissões), painel de validação dos dados importados |

> Os papéis são definidos em runtime na tela **Papéis de Usuários** (DIRETORIA / COORDENADOR / VENDEDOR), com fallback para e-mail técnico autorizado para acessos admin.

---

## 3. Mapa de Telas (28 telas + 2 utilitárias)

### 3.1 Operação do Vendedor (uso diário em campo)

| # | Tela | Rota | Propósito |
|---|---|---|---|
| 1 | **Login** | `/login` | Autenticação nativa (SSO Google/Microsoft + e-mail/senha + verificação por código) |
| 2 | **Dashboard** | `/` | Home com saudação personalizada, KPIs do dia, fila operacional, próximas visitas, atalhos |
| 3 | **Agenda** | `/agenda` | Calendário de visitas (mês/semana/dia/lista), criação/edição, check-in, check-out com relato obrigatório, cancelamento |
| 4 | **Clientes / Minha Carteira** | `/clientes` e `/clientes/:id` | Listagem paginada da carteira, busca por razão social/fantasia/CNPJ, drill em cliente, inativar, remover, vincular novo |
| 5 | **Histórico de Clientes** | (embutido em `/clientes`) | Histórico de visitas, vendas e relatos por cliente, últimas visitas da semana, evolução de compras |
| 6 | **Atividades / Tarefas** | `/tarefas` | A Fazer, Em Andamento, Concluídas; criação com prioridade e prazo; mudança de status via dropdown inline |
| 7 | **Mix Builder / Simulação** | `/simulacao` | Monta simulação de mix por cliente, com produto, quantidade, preço, desconto %; cálculo automático de subtotal, margem e rentabilidade |
| 8 | **Analytics do Vendedor** | `/analytics` | 7 blocos analíticos para o vendedor logado: meta vs realizado, evolução, mix, carteira, top clientes, frequência de visita, devoluções |
| 9 | **Alertas e Prospecção** | `/alertas` (com aba `prospeccao`) | Inbox de alertas inteligentes agrupados por produto + sub-aba de Prospecção da semana com clientes "vendas perdidas / não explorado" |
| 10 | **Acompanhamento Semanal do Vendedor** | `/acomp-semanal-vendedor` | Visão pessoal da própria tabela semanal de clientes (o que o gestor enxerga, mas filtrado para o vendedor) |
| 11 | **Configurações do Usuário** | `/configuracoes` | Edição de dados pessoais, status de funcionário, substituto em férias, preferências de UI (modo agenda, exibição de tarefas, página inicial), credenciais Google Agenda |

### 3.2 Camada do Coordenador

| # | Tela | Rota | Propósito |
|---|---|---|---|
| 12 | **Painel Coordenador** | embutido no menu coordenador | Visão consolidada da equipe, ranking, anomalias de venda fora do território com cliente em carteira |
| 13 | **Gestão de Carteira (Coordenador)** | `/gestao-carteira` | Transferir cliente entre vendedores da equipe; transferência em lote de carteira inteira |
| 14 | **Férias de Vendedores** | `/ferias-vendedor` | Cadastrar período de férias, designar substituto, listar férias ativas e futuras |
| 15 | **Acompanhamento Semanal (Gestão)** | `/acomp-semanal` | Tabela semanal de toda a equipe, permite intervenções e marcações |

### 3.3 Camada da Diretoria

| # | Tela | Rota | Propósito |
|---|---|---|---|
| 16 | **Análise Diretoria** | `/analise-diretoria` | Visão executiva consolidada: meta total, realizado líquido, gap, devoluções, ranking de BUs e coordenadores, tendência 6 meses, mapa de riscos, drill por BU/coordenador |
| 17 | **Papéis de Usuários** | `/gestao-cargos-usuarios` | Definir papel operacional (Diretoria / Coordenador / Vendedor) de cada usuário do projeto |
| 18 | **Gestão de Metas (Diretoria)** | `/gestao-metas` | Cadastrar/editar meta por vendedor por mês/ano; comparativo meta vs realizado; histórico de metas |
| 19 | **Gestão de Coordenadores** | `/gestao-coordenadores` | Cadastrar coordenador, vincular BUs a ele |

### 3.4 Camada de Gestão / Governança / TI

| # | Tela | Rota | Propósito |
|---|---|---|---|
| 20 | **Painel de Gestão** | `/painel-gestao` | Fila operacional da equipe (tarefas, visitas, pendências) para o gestor agir |
| 21 | **Governança RCA** | `/governanca-rca` | Vínculos atuais usuário ↔ código RCA do TOTVS, com auditoria de alterações |
| 22 | **BUs e Vendedores** | `/gestao-bus-vendedores` | Cadastro de BUs (departamento + filial), vinculação BU ↔ vendedor com filial e seção opcional |
| 23 | **Escopo de Usuários** | `/configuracao-escopo-usuarios` | Configura quais BUs/filiais/seções cada usuário enxerga (escopo fino além do vínculo de RCA) |
| 24 | **Gestão de Cadastros** | `/gestao-cadastros` | Tela administrativa com abas para PRODUTOS, METAS e COMISSÕES |
| 25 | **Painel de Validação** | `/painel-validacao` | Validação dos dados importados do TOTVS (faturamento, devoluções, ramos) — pra TI conferir integridade |
| 26 | **Acompanhamento Semanal Admin** | `/admin-acomp-semanal` | Override administrativo do acompanhamento semanal (apenas TI/ADMIN) |

### 3.5 Utilitárias

| # | Tela | Rota | Propósito |
|---|---|---|---|
| 27 | **Prospecção** | `/prospeccao` (redirect para `/alertas?aba=prospeccao`) | Aba prospecção encapsulada como tela própria |
| 28 | **Agenda Coordenador** | embutido | Variante simplificada da agenda para visão coordenador |

---

## 4. Módulos Funcionais e Regras de Negócio

### 4.1 Autenticação e Identidade
- Login nativo via SSO (Google e Microsoft em popup) + e-mail/senha com cadastro inline + verificação por código de 6 dígitos.
- Sessão persistida em localStorage; logout limpa sessão e fecha chat IA quando aplicável.
- Identidade visual da tela de login pode ser customizada por cliente preservando os fluxos.
- Nenhuma tabela própria de usuários: o sistema usa a tabela `INT_USER` da plataforma — **sem replicar usuários** entre o ERP e o CRM.

### 4.2 Carteira de Clientes
- Cliente tem status `ATIVO` ou `INATIVO`.
- Cliente inativo **não** entra em novas visitas nem em novas simulações sem reativação.
- Listagem sempre paginada (performance).
- Busca textual considera razão social, nome fantasia e CNPJ.
- Operações: vincular cliente à carteira atual, atualizar dados, inativar (preserva histórico), remover (desfaz vínculo sem apagar cliente).

### 4.3 Agenda de Visitas
- Toda visita nasce com status `AGENDADA`.
- **CHECK-IN** muda status para `EM_ANDAMENTO`.
- **CHECK-OUT** muda status para `CONCLUIDA` e exige relato obrigatório.
- **Cancelamento** muda status para `CANCELADA`.
- Visita concluída **não pode** voltar para agendada (estado terminal).
- Campos mínimos: cliente, data, hora início, hora fim, tipo de visita.
- Visualizações suportadas: mês, semana, dia e lista paginada.
- Filtros por data, status e busca textual.

### 4.4 Atividades / Tarefas
- Status: `PENDENTE` → `EM_ANDAMENTO` → `CONCLUIDA`.
- Prioridades: `ALTA`, `MEDIA`, `BAIXA`.
- Tarefa concluída não volta automaticamente — exige ação explícita.
- Lista principal exibe somente "A Fazer" e "Em Andamento" (A Fazer no topo); "Concluídas" ficam em seção compactada.
- Status muda por dropdown customizado direto na linha (sem botões de avançar/voltar).
- Badge de pendentes aparece na navegação lateral (contador em tempo real, atualizado a cada 5 min).

### 4.5 Mix Builder / Simulação
- Simulação obrigatoriamente vinculada a um cliente.
- Mínimo 1 item por simulação.
- Status: `RASCUNHO` (editável) → `FINALIZADA` (somente leitura).
- Item contém produto, quantidade, preço unitário, desconto %.
- Desconto não pode gerar subtotal negativo.

**Fórmulas:**
- `subtotal_item = quantidade * preco_unitario * (1 - desconto_perc / 100)`
- `margem_item = ((subtotal_item - custo_total_item) / subtotal_item) * 100`
- `rentabilidade_geral = ((valor_total - custo_total) / valor_total) * 100`

### 4.6 Analytics do Vendedor (7 blocos)
1. **Meta vs Realizado** — meta, faturamento líquido, progresso, falta para meta, projeção por dias úteis, valor devolvido e % devolução.
2. **Evolução Histórica** — últimos 24 meses, barras de realizado líquido + linha tracejada de meta + tabela.
3. **Mix de Produtos** — top 10 por faturamento líquido + total por departamento/seção + produtos devolvidos.
4. **Análise de Carteira** — cards de total, ativos, inativos, em risco, novos, ticket médio; tabela de inativos/risco.
5. **Top Clientes** — top 10 por faturamento líquido, bruto, devolvido, pedidos, ticket, participação no total do vendedor.
6. **Frequência de Visita** — total realizado, média semanal, tabela da carteira com última visita e alerta para >30 dias.
7. **Devoluções** — tabela paginada com notas, pedido, datas, cliente, produto, quantidade, valor; destaque para devoluções >30 dias.

**Filtros sticky:** período (mês/ano, últimos 3/6/12 meses, intervalo personalizado), multiselect de departamentos, multiselect de ramos, botão `Buscar` (atualização atômica de todos os blocos).

### 4.7 Alertas Inteligentes e Prospecção
- Aba **Alertas**: avisos agrupados por produto, ordenados por prioridade (alta/média/baixa) e potencial de faturamento; ação "marcar todos como lidos"; expansão por grupo de produto mostra clientes envolvidos.
- Aba **Prospecção**: clientes da carteira sem compra recente ("vendas perdidas") ou nunca comprados em uma família/grupo ("não explorado"), priorizados pela semana.
- Badge de não lidos no menu lateral (vermelho).

### 4.8 Regra de Departamento / BU (núcleo do CRM)
- BUs do sistema correspondem a **departamentos vindos do TOTVS** (não criar BU manual).
- Cada RCA pode estar vinculado a uma ou mais BUs.
- Ao vincular, a **filial TOTVS** é obrigatória; a **seção** (`ID_SECAO`) é opcional (NULL = todas as seções).
- **Atribuição de venda** combina: filial (`CODFILIAL`) + BU/departamento (`BU_CODIGO`) + seção (`ID_SECAO` ou todas) **e** o cliente precisa estar na carteira (`EQUIPE_CLIENTE`) do mesmo vendedor.
- Acompanhamento semanal e faturamento sempre filtrados por esse escopo.

### 4.9 Detecção de Anomalia (Painel Coordenador)
- Quando um cliente está na carteira de um vendedor mas a venda ocorreu **fora do território** desse vendedor (BU/filial diferente), a venda **não é atribuída a ninguém**.
- Aparece no Painel Coordenador como **alerta âmbar** com: pedido, vendedor dono da carteira, cliente, território da venda, territórios cadastrados para o vendedor.

### 4.10 Acompanhamento Semanal
- Tabela semanal de clientes com status de evolução, marcações e validação.
- 3 visões: **Vendedor** (próprio), **Gestão** (toda a equipe com permissão), **Admin** (override para TI).
- Permissão por SF (`painelGestaoPermissao`); admin liberado por e-mail técnico autorizado.

### 4.11 Análise Diretoria
- KPIs: meta total, realizado líquido, gap, devoluções, clientes com compra, pedidos, BUs críticas, BUs sem meta, BUs sem coordenador.
- Gráficos: tendência realizado vs meta (6 meses), ranking de BUs, ranking de coordenadores, mapa de riscos.
- Tabelas Handsontable read-only: ranking BUs, performance por coordenador, riscos prioritários.
- Drill executivo: clicar em BU ou coordenador no ranking aplica filtro na página.
- Acesso por permissão (`gestaoMetasDiretoriaPermissao`).

### 4.12 Governança RCA
- Tabela de vínculos atuais usuário ↔ código RCA do TOTVS.
- Auditoria de alterações (quem mudou, quando, de quê para quê).
- Mutações `vincularVendedorRca` e `desvincularVendedorRca` restritas à gestão.

### 4.13 Gestão de Cadastros (admin)
- Três abas: **Produtos**, **Metas**, **Comissões**.
- CRUD completo por aba com permissão `GESTOR/ADMIN`.
- Inativação preferível à exclusão quando aplicável.

### 4.14 Configurações do Usuário
- Dados pessoais: nome, status de funcionário (ativo/férias), substituto.
- Preferências de UI: modo agenda (mês/semana/lista), exibição de tarefas, página inicial.
- Bloco **Google Agenda**: credenciais OAuth individuais (Client ID, Client Secret, Refresh Token, Calendar ID), status da conexão, última sincronização, último erro.

---

## 5. Integrações Inclusas

### 5.1 ERP TOTVS (importação principal)
- Tabelas de origem: `IMP_VENDAS_DASHBOARD_TOTVS_RCA` (~142k linhas), `IMP_DEVOLUCOES_TOTVS` (~2,5k linhas), `IMP_CLIENTES_TOTVS`.
- Importação periódica via Data Loaders (pipeline já modelado).
- Sem chamadas online ao TOTVS no front — tudo via tabelas locais → performance previsível.

### 5.2 Google Agenda (individual por usuário)
- Cada usuário configura suas próprias credenciais OAuth.
- Visitas criadas/editadas/canceladas sincronizam para o calendário do dono.
- Atividades com prazo viram lembrete no Google Agenda.
- Tarefas sem prazo **não** sincronizam.
- Em conflito, **CRM vence**: o próximo envio do CRM sobrescreve o evento no Google.
- Falhas de sincronização não bloqueiam a operação comercial.

### 5.3 E-mail Transacional
- Envio via SDK nativa de e-mail (sem fetch direto, sem token no front).
- Casos atuais: resumo semanal de alertas para o vendedor.

---

## 6. Automações Recorrentes

| Automação | Frequência | Descrição |
|---|---|---|
| **Resumo Semanal de Alertas** | Toda quinta-feira, 03:00 (cron `0 0 3 * * THU`) | Envia 1 e-mail por vendedor com avisos dos últimos 7 dias, agrupados por prioridade. Tem `dryRun` (não envia) e `force` (reprocessa) |
| **Atualização de contadores no menu** | A cada 5 min (front) | Tarefas pendentes, alertas não lidos, permissões — refresh sem precisar recarregar a página |
| **Sincronização Google Agenda** | Sob demanda | Após salvar visita ou atividade com prazo |

---

## 7. Componentes / Diferenciais Técnicos Reutilizáveis

- **Handsontable** padronizado em todas as tabelas operacionais (filtros, ordenação, resize, freeze) — pronto para grids tipo Excel.
- **Recharts** com biblioteca interna `Chart.tsx` (BarChart, LineChart, AreaChart, ComposedChart, PieChart, DataTable) — todos com tematização CSS variables, animação, drill e cross-filter prontos.
- **Cross-filter bidirecional** em dashboards (clicar em qualquer gráfico filtra os demais).
- **Drill-down livre** (qualquer dimensão em qualquer ordem) com breadcrumb.
- **Hooks `useHighlight` e `useDrill`** já documentados e usados.
- **Layout responsivo** com sidebar colapsável em mobile e barra flutuante inferior priorizada para uso em campo.
- **Permissionamento por SF** (`:VAR_USER` + alçada de cargo) — segurança a nível de linha.
- **Tema light verde corporativo** parametrizado via CSS variables (trivial trocar marca/cor por cliente).

---

## 8. Backlog Implementado (referência de maturidade)

### Server Functions críticas (já em produção)

| Domínio | SFs | Cobertura |
|---|---|---|
| Agenda | 42–47 | listar, contar, criar, atualizar, cancelar, excluir |
| Clientes / Carteira | 48–51 | atualizar, inativar, remover, vincular |
| Tarefas | 52–54 | atualizar dados, atualizar status, excluir (todos seguros) |
| Simulações | 55–62 | contar, atualizar, cancelar, excluir, itens add/update/delete |
| Governança RCA | 33–37, 63 | vincular, desvincular, auditoria |
| Configurações de Usuário | 64–67 | detalhar, listar substitutos, atualizar dados, preferências |
| Produtos / Metas / Comissões (admin) | 68–83 | CRUD completo + inativação |
| Análise Diretoria | `analiseDiretoria*` | filtros, resumo, BUs, coordenadores, tendência, riscos |
| Papéis de Usuários | `gestaoCargosUsuarios*` | permissão, resumo, listar, salvar |
| Alertas / Prospecção | `alertasInteligentes*` | contar, listar, prospecção semanal |
| Google Agenda | 209–212 | status, sincronizar, config por usuário |
| Email Semanal | `alertasInteligentesEnviarResumoSemanal` | cron agendado, dryRun, force |

### Matriz de Permissões (resumo)
| Tela / Domínio | Vendedor | Coordenador | Diretoria | Admin/TI |
|---|---|---|---|---|
| Dashboard, Agenda, Clientes, Tarefas, Mix, Analytics, Alertas | ✅ (próprio) | ✅ (equipe) | ✅ | ✅ |
| Gestão de Carteira, Férias | — | ✅ | ✅ | ✅ |
| Análise Diretoria, Metas, Coordenadores, Papéis | — | — | ✅ | ✅ |
| Governança RCA, BUs/Vendedores, Escopo, Cadastros, Validação | — | — | — | ✅ |

---

## 9. Aproveitamento para Novo Cliente

### 9.1 Pronto para reusar sem mudança
- Estrutura completa de navegação (Vendedor / Coordenador / Diretoria / Gestão).
- Login nativo (SSO + e-mail).
- 28 telas com componentes consistentes.
- Pipeline ERP→CRM (tabelas `IMP_*`, atribuição por BU, anomalia de território).
- Regras de status (visita, tarefa, simulação) — universais para CRM comercial.
- Permissionamento por papel e por escopo.
- Componentes de gráfico, tabela e drill prontos.
- Automação de resumo semanal por e-mail.

### 9.2 Parametrizável por configuração (sem código)
- **Marca:** logo, cor primária (CSS variables), nome do app no header e na sidebar.
- **Idioma de labels:** strings de menu e títulos.
- **Domínios de status:** podem ganhar valores se houver aprovação funcional (atual: catálogo fechado por módulo).
- **Cron do resumo semanal:** dia e hora ajustáveis.
- **Permissões por e-mail técnico:** lista de admins.

### 9.3 Exige customização (orçamento estimado por caso)
- **Integração com ERP que não é TOTVS:** mapear novas fontes para o modelo `IMP_*` (Sankhya, SAP B1, Protheus, Senior, etc. — todos têm templates de integração disponíveis).
- **Regras de comissão específicas:** o módulo atual é base; cálculos por cliente são parametrizáveis.
- **Cálculo de meta:** hoje meta é por vendedor/mês — adaptações (meta por BU, por mix, por canal) entram como evolução.
- **Mix Builder com regras adicionais:** desconto escalonado, política de margem mínima, aprovação por alçada — base pronta, regras específicas como evolução.
- **Conectores de calendário além do Google:** Outlook/Exchange (segue o mesmo padrão OAuth por usuário).
- **App mobile nativo:** o front atual é responsivo e pronto para campo, mas wrapper PWA / nativo entra como projeto separado se exigido.

### 9.4 Estimativa de esforço de implantação (referência rápida)
| Cenário | Esforço relativo |
|---|---|
| Cliente com TOTVS, sem customização de regra | Baixo — re-skin + carga de dados + cadastro de BUs |
| Cliente com outro ERP, mesmo modelo de papéis | Médio — recriar pipeline de importação + re-skin |
| Cliente com regras de comissão/meta diferentes | Médio — ajustar módulo de cadastros + SFs específicas |
| Cliente que pede telas/módulos novos (ex.: pedido firme, força de venda interna, B2C) | Alto — discutir como evolução de produto |

---

## 10. Resumo executivo (1 página para proposta)

> **O que é:** CRM operacional para força de vendas externa, com camadas de Vendedor (campo), Coordenador (regional), Diretoria (estratégico) e Administração (TI/governança).
>
> **O que já está em produção (cliente atual):** 28 telas, ~200 server functions, integração TOTVS, integração Google Agenda individual, automação semanal por e-mail, painel coordenador com detecção de anomalia de território, análise diretoria com drill, governança de vínculos RCA, gestão de metas, gestão de coordenadores, gestão de papéis, acompanhamento semanal com 3 visões.
>
> **Diferenciais frente a CRMs de mercado:**
> 1. Atribuição de venda por BU+filial+seção (não só código de RCA).
> 2. Detecção de venda fora do território com cliente em carteira.
> 3. Mix Builder com cálculo automático de margem e rentabilidade.
> 4. Acompanhamento semanal estruturado com workflow.
> 5. Análise Diretoria com cross-filter e drill executivo.
>
> **Tempo de implantação para um cliente equivalente:** 4 a 8 semanas para reaproveitamento direto; 8 a 16 semanas se trocar ERP e/ou regras de comissão; mais que isso entra como evolução de produto.
