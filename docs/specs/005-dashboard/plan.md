# Plan: Dashboard (tela inicial)

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

O Dashboard só mostra números que outras specs definem. Regra deste plano:
**o bloco que já tem SF em outra spec chama essa SF** (o número bate com a outra
tela por construção, C-004 da 000). Faturamento, meta do mês e vendas por dia
vêm das SFs do Analytics (007), a data da carga da 006 e a visibilidade do
alerta da 008 (D-509, troca dos fragmentos provisórios). SQL próprio da 005 só
para a meta semanal configurável e a lista curta de alertas.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta; D2/D4 de `pendencias-consolidadas.md` aplicadas (meta só do planejamento; sem Painel de Gestão) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-005-dashboard.mjs` só roda no sandbox, depois dele `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | **um acréscimo**: tabela `META_SEMANAL_VISITAS` (aprovado em A2/A3), `CREATE TABLE IF NOT EXISTS` + carga inicial idempotente pelo `runDdlMitra` no sandbox; nada em `backend/migrations/` |
| Leitura e escrita por Server Function | sim | 3 SFs novas + 7 reusadas; nenhum acesso direto (RNFT-005) |
| Simulador cobre a feature | sim | `simulator/seeds/005-dashboard.mjs` (ids 5001+, usuários próprios), `simulator/smoke/005-dashboard.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira um `teste()` no smoke ou um `test()` em `novo/frontend/tests/dashboard.test.mjs` (mapa abaixo) |
| Design tokens, sem cor literal | sim | vocabulário de `components/page.tsx`; círculo e barras em SVG com `currentColor`/tokens |
| Simplicidade | sim | nenhuma dependência nova (gráfico de 7 barras em SVG à mão); contas da tela (percentual, projeção, selo, variação, relato) em função pura |

## Contexto técnico

- Mesmo stack da 001. Nenhuma dependência nova.
- **Reuso no backend:** `lib/002-carteira.mjs` (`ESCOPO_SQL`, `escopoAlvo`,
  `vendaDoVendedor`, `cod`, `dia`), `lib/003-agenda.mjs` (`pessoasEscopo`,
  `HOJE_BR`), `lib/guardas.mjs` (`SEM_BLOQUEIO`, `temPapel`).
- **Reuso no frontend:** `FiltroEscopo`/`useEscopo` + `paraInput` (RNT-003),
  `useBloco` (falha por bloco, C-007 da 000), `formato.ts` (moeda, datas,
  `hojeBrasilia`), `agenda.ts` (`semanaDe`, `meta`, `rotuloStatus`),
  `atividades.ts`, `AVISO_NAO_CONFIGURADO` da 001 (o aviso que hoje está no
  `EmConstrucao` de `/` passa para o Dashboard).

## Modelo de dados

| Entidade (spec) | Tabela | Campos usados | Observação |
|---|---|---|---|
| Meta semanal de visitas | **`META_SEMANAL_VISITAS`** (nova) | `PERFIL` (`VENDEDOR`/`COORDENADOR`), `VALOR`, `VIGENCIA_INICIO` (segunda `AAAA-MM-DD`), `ALTERADO_POR`, `ALTERADO_EM` | UNIQUE (`PERFIL`, `VIGENCIA_INICIO`); carga inicial 16 e 8 com vigência `2000-01-03`; grava |
| Meta mensal do vendedor | `METAS_BU_VENDEDOR` | `VENDEDOR_ID`, `CODFILIAL`, `CODEPTO`, `ANO`, `MES`, `META_VALOR` | lida só pela `s360AnalyticsResumo` da 007 (D-509); declarada em `schema-producao/007-metas.mjs` |
| Faturamento | `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS` | — | lidas só pelas SFs do Analytics (007) |
| Última atualização | `ACOMP_SEMANAL_SYNC_LOG` | — | lida só pela `s360SemanalAtualizacao` da 006; declarada em `schema-producao/006-semanal.mjs` |
| Alerta | `ALERTAS_INTELIGENTES` | `ID`, `NOME_CLIENTE`, `TITULO`, `TIPO_ALERTA`, `PRIORIDADE`, `LIDO`, `DATA_GERACAO` | só leitura (declarada pela 001); visibilidade por `alertaVisivel` da 008 |
| Compromisso, atividade | (specs 003 e 004) | — | lidos pelas SFs delas |

A 005 não tem arquivo em `schema-producao/`: o `005-dashboard.mjs` provisório
saiu quando a 006 e a 007 declararam as duas tabelas. `META_SEMANAL_VISITAS` é
declarada no `add-005-dashboard.mjs` (tabela nova, como o `USUARIO_PAPEL` da 001).

## Fragmentos — `novo/backend/lib/005-dashboard.mjs`

| Fragmento | Devolve | Regra |
|---|---|---|
| `ehCoordenador(pessoa)` | predicado: cadastro ativo em `COORDENADORES` | perfil da meta (o mesmo do `metaDe` da 003) |
| `metaPerfil(perfil, segunda)` | inteiro: `VALOR` da linha do perfil com a maior `VIGENCIA_INICIO <= segunda` | RN-005, RF-004 |
| `metaSemanal(pessoa, segunda)` | `metaPerfil` do perfil da pessoa (a 003 usa este como `metaDe`) | RN-005 |
| `META_INICIAL` | carga inicial 16/8 (seed e `add-005`) | A2 |

O que era provisório saiu do arquivo e virou o definitivo da outra spec (D-509):

| Provisório (fase 1) | Definitivo usado agora | Spec |
|---|---|---|
| `vendaNoEscopo` + `metaMensal` (`s360DashboardMes`) | `s360AnalyticsResumo` (`contaNoEscopo` da 006, `filtroMetaEscopo` da 007) com o período "Mês" | 007 |
| `s360DashboardVendasDiarias` | `s360AnalyticsEvolucao` com `porDia = '1'`, linhas `TIPO = 'L'` | 007 |
| `ULTIMA_CARGA` | `s360SemanalAtualizacao` (`FIM_EM`) | 006 |
| `alertaNoEscopo` | `alertaVisivel('A', ESCOPO_SQL)` | 008 |

## Contratos de backend

Arquivo `novo/backend/add-005-dashboard.mjs`. Toda SF resolve quem chama por
`:VAR_USER` e leva `SEM_BLOQUEIO`. "Escopo" = os sete parâmetros da 002
(`modo`, `coordenador`, `vendedor`, `filial`, `depto`, `secao`, `hoje`).

### SFs novas

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360DashboardAlertas` | SQL | escopo | até 5: `ID`, `TITULO`, `CLIENTE`, `TIPO_ALERTA`, `DATA_GERACAO`, `VENDEDOR`; não lidos, `PRIORIDADE = 'ALTA'`, visíveis por `alertaVisivel` da 008, mais recentes primeiro | RF-007, RN-010 |
| `s360MetaVisitasObter` | SQL | `segunda` | 1 linha: `VENDEDOR`, `COORDENADOR` (valores da semana pedida), `PROX_VENDEDOR`, `PROX_COORDENADOR`, `PROX_VIGENCIA` (a mudança já marcada para a semana seguinte, se houver), `PODE_EDITAR` (DIRETORIA/ADMIN) | RN-005 (texto da meta composta), RF-004 |
| `s360MetaVisitasSalvar` | SQL | `perfil` (`VENDEDOR`/`COORDENADOR`), `valor` (inteiro 1–99) | linhas afetadas; só DIRETORIA/ADMIN; vigência = próxima segunda pelo relógio do servidor (Brasília); `UPDATE` da linha daquela vigência + `INSERT … WHERE NOT EXISTS` | RF-004 |

- Mês e dias vêm da tela, calculados de `hojeBrasilia()` (como a 002); férias
  e "próxima segunda" vêm do relógio do servidor (como a 003, D-302).
- Faturamento e meta: a tela manda o escopo + `paramsRecorte(1º dia, último
  dia do mês, sem ramo/cliente/produto)` do Analytics (`entradaMes`), a mesma
  entrada do período "Mês" da tela Analytics; `LIQUIDO = BRUTO − DEVOLVIDO` e a
  soma dos dias do mês = `LIQUIDO` do card (RN-009). Sem distribuição a 007
  devolve `META` 0: a tela mostra `Meta não distribuída`.
- Vendas diárias: `entradaDiarias` pede de 8 dias úteis para trás até hoje com
  `porDia = '1'`; `diasDaEvolucao` fica com as linhas de líquido e
  `serieDiaria` preenche com zero os dias úteis sem linha.

### SFs reusadas (sem mudança de contrato)

| SF (spec) | Bloco | Como |
|---|---|---|
| `s360EscopoOpcoes` (002) | filtro de escopo | igual às outras telas |
| `s360AgendaListar` (003) | compromissos de hoje (RN-002) e Resumo da Semana (RN-012) | **uma** chamada com `de` = segunda e `ate` = domingo da semana; a tela tira os de hoje não cancelados e as visitas/prospecções da semana |
| `s360AgendaResumo` (003) | Meta semanal: `REALIZADO`, `META`, `PESSOAS` | o mesmo painel da Agenda; com a troca abaixo, a meta passa a ser a configurada |
| `s360AtividadesAbertas` (004) | Últimas Atividades (RN-011) | filtros vazios; a tela ordena por prazo (vencidas primeiro, sem prazo por último) e mostra 3 |
| `s360AnalyticsResumo` (007) | Meta mensal: `BRUTO`, `DEVOLVIDO`, `LIQUIDO`, `META` | `entradaMes` (D-509) |
| `s360AnalyticsEvolucao` (007) | Vendas líquidas diárias | `entradaDiarias` + `diasDaEvolucao` |
| `s360SemanalAtualizacao` (006) | "Atualizado em" do card mensal (RF-010) | `FIM_EM`; falha da chamada não derruba o card |

Total na carga: 9 consultas (RNF-002); tocar numa barra não consulta nada.

### Troca na 003 (edição pontual, D-502)

A 003 deixou a meta fixa com `ponytail:` para a 005 trocar (D-307 do plan
dela). Três linhas em arquivos da 003:
- `lib/003-agenda.mjs`: `metaDe(pessoa, segunda)` passa a ser `metaSemanal` da 005.
- `add-003-agenda.mjs` (`RESUMO`): `metaDe('PES.PESSOA_ID', "'{{segunda}}'")` e
  a contagem de coordenadores por `ehCoordenador` (hoje é `metaDe(...) = 8`, que
  quebra quando a meta muda).
- `pages/AgendaPage.tsx`: lê `?modo=DIA&data=AAAA-MM-DD` no estado inicial
  (RF-008/C-002 "abre a Agenda na visão Dia de hoje").

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/` | aviso de usuário sem configuração (RN-017 da 001), saudação, frase de compromissos com a janela, filtro de escopo, cards Meta semanal e Meta mensal, Vendas líquidas diárias, Alertas não lidos, Últimas Atividades, Resumo da Semana; cada bloco com o próprio `useBloco` (C-011) | `pages/DashboardPage.tsx` (`.rota = '/'`) e blocos em `pages/dashboard/*.tsx` |
| `/configuracoes`, seção `Meta semanal de visitas` (só DIRETORIA/ADMIN; usuário, 2026-11-03) | valores vigentes e o já marcado para a semana seguinte; dois campos (vendedor, coordenador), aviso "vale a partir de dd/mm (próxima segunda)", `Salvar` → linhas afetadas (RNT-013) | `pages/dashboard/MetaVisitasConfig.tsx`; `ConfiguracoesPage.tsx` (001) ganha uma linha que monta a seção |
| links | `Abrir agenda completa`/`Abrir agenda do dia` → `/agenda?modo=DIA&data=<hoje>`; `Ver agenda completa` → `/agenda`; `Ver todos` → `/alertas`; alerta → `/alertas?alertaId=<id>` (a `AlertasPage` da 008 ainda não lê o parâmetro: abre a lista; anotado no relatório); `Ver histórico completo` → `/tarefas` | — |

Regra pura em `novo/frontend/src/lib/dashboard.ts` (o que os testes importam):

| Função | Regra |
|---|---|
| `saudacao(horaBrasilia, nome, email)` | RN-001 |
| `fraseCompromissos(n, escopo, nomeVendedor)` | RN-002, C-012 |
| `compromissosDeHoje(itens, hoje)` | RN-002 (sem cancelados) |
| `textoMetaComposta(meta, valores, pessoas)` | RN-005 (inclui `Nenhuma pessoa no filtro atual.`) |
| `diasUteis(inicioMes, fimMes, hoje)` → `{ decorridos, total }` | RN-007, RNT-016 |
| `cardMensal({ liquido, meta, hoje, inicio, fim })` → `{ percentual, circulo, projecao, selo }` | RN-006/007/008 |
| `ultimosDiasUteis(hoje, 7)`, `serieDiaria(linhas, dias)`, `variacao(atual, anterior)` | RN-009 |
| `ultimasAtividades(abertas)` | RN-011 |
| `resumoSemana(itens, hoje)` | RN-012 (relato, data do relato, ordem, 12) |
| `proximaSegunda(hoje)` | texto "vale a partir de" do RF-004 |

## Simulador

- Sem `schema-producao/005` (ver Modelo de dados).
- `simulator/seeds/005-dashboard.mjs` (semana de 02 a 06/11/2026, hoje =
  03/11/2026, ids 5001+): usuários próprios por `ctx.usuario` — vendedoras
  Dalva e Dora, vendedor Davi, coordenador Caetano (cadastro 5001) — numa BU
  que só a 005 usa; clientes 5001–5010 nas carteiras deles; vendas e devoluções
  de outubro e novembro; metas distribuídas em novembro para Dalva e Davi (Dora
  sem distribuição, C-007); visitas, prospecções, interno e deslocamento da
  semana; 3 atividades pendentes; alertas altos e médios. A execução da carga
  vem do seed da 006; o teste do RF-010 insere as suas. Nada nos usuários 1..11.
- `simulator/smoke/005-dashboard.mjs`: banco descartável; cada teste monta os
  dados do cenário (datas da spec) e fixa o relógio quando a regra usa o do
  servidor (padrão do smoke da 003).
- `CHECK_INPUT`: não muda (parâmetro ausente vira texto vazio e as SFs de leitura rodam sem erro no `sim:check`).

## Testes

Backend em `simulator/smoke/005-dashboard.mjs`; tela em
`novo/frontend/tests/dashboard.test.mjs`. O título de cada teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-001 | tests | 08:30 + `ana.souza@…` sem nome → `Bom dia, Ana Souza.`; 11:59 Bom dia, 12:00 Boa tarde, 18:00 Boa noite; sem nome nem e-mail → `você`; nome com "@" usa o e-mail |
| C-002 / RN-002 | smoke + tests | SF `s360AgendaListar` do dia com 3 visitas (1 cancelada), 1 prospecção, 1 interna → `compromissosDeHoje` = 4; compromisso às 23:30 de Brasília (relógio em UTC no dia seguinte) está em hoje |
| C-012 | tests | `O time tem 9 compromissos para hoje.`; `Ana tem 4 compromissos para hoje.`; Meu painel 0 → `Você não tem nenhum compromisso para hoje.` |
| C-003 / RN-003 / RN-004 | smoke | semana 09–13/11: 10 visitas + 2 prospecções + 1 deslocamento concluídos, 1 interna concluída, 2 Em andamento, 1 visita no sábado → `REALIZADO` 13, `META` 16; tela: restantes 3, 81%; visita no domingo 15/11 fora das semanas 09 e 16 |
| C-004 | smoke + tests | Caetano `TEAM` com 3 vendedores e ele → `META` 56; deslocamento concluído com 2 pessoas soma 2; texto `Meta composta do filtro atual: vendedores 16/semana e coordenadores 8/semana.` |
| RN-005 / RF-004 | smoke + tests | diretoria salva 14 para vendedor com relógio em 12/11 → vigência 16/11; `s360AgendaResumo` semana 09/11 → 16 por vendedor, semana 16/11 → 14; vendedor salvando → 0 linhas; filtro vazio → `META` 0 e `Nenhuma pessoa no filtro atual.` |
| C-004 da 000 (D-509) | smoke + tests | card do mês: a `s360AnalyticsResumo` com `entradaMes` = com a entrada do período "Mês" do Analytics, em Meu painel, time e vendedor específico; alertas: os 5 IDs do Dashboard = os 5 altos não lidos mais recentes da `s360AlertasListar` (Meu painel e time); tela: `entradaMes` = `periodo('MES')` + `paramsRecorte` |
| C-005 / RN-006 / RN-007 | smoke + tests | SF: bruto 70.000, devolução 5.000, meta distribuída 100.000 → `LIQUIDO` 65.000, `META` 100.000; tela com hoje 20/11/2026 → 15 de 21 dias úteis, 65,0%, projeção 91.000, `No ritmo` |
| C-006 | tests | meta 50.000, líquido 60.000 → `120,0%`, círculo 100, `Acima da meta` |
| C-007 | smoke + tests | sem `METAS_BU_VENDEDOR` → `META` 0 (regra da 007); tela com 0 ou nula → `Meta não distribuída`, sem selo. As tabelas legadas nem existem no simulador: nenhuma SF usada as cita |
| RN-006 (recorte) | smoke | Dalva com escopo e meta também na Filial 4 → time 200.000; Filial 3 · BU da 005 → 180.000; Filial 4 → 20.000 |
| RN-007 (bordas) | tests | outubro consultado em novembro → projeção = realizado; sábado 21/11/2026 → 15 decorridos (20/11 conta); sábado 01/08/2026 → 0 decorridos, projeção = realizado |
| RN-008 | tests | meta 100.000: projeção 100.000 Acima, 90.000 No ritmo, 89.999 Abaixo; realizado 85.000 com projeção 88.000 → Abaixo; a função não recebe o escopo (mesmo selo em todos) |
| C-008 / RN-009 | smoke + tests | `s360AnalyticsEvolucao` por dia: série do cenário e soma de novembro = `LIQUIDO` do card; tela: 7 dias de 04/11 a 12/11, 12/11 = `-25,0%`, 06/11 = `—`; 0 e 0 → `0,0%`; anterior −200 → `—`; sábado 14/11 → última barra 13/11 |
| C-009 / RN-012 | smoke + tests | SF `s360AgendaListar` da semana com as 5 do cenário → tela: `Ok` (11/11/2026), `Relato pendente`, `—`, `Cancelada`, `Ok`; 15 itens → 12; Em andamento de ontem → `Relato pendente` |
| C-010 / RN-010 | smoke | 7 altos + 3 médios não lidos → 5, todos ALTA, mais recentes primeiro; alerta alto de outra BU do vendedor fora do recorte aberto não aparece; alerta lido não aparece |
| RN-011 | smoke + tests | SF `s360AtividadesAbertas` sem a concluída; `ultimasAtividades` → prazos 10/11, 20/11, sem prazo; 5 pendentes → 3; descrição vazia → texto padrão |
| C-011 | tests | `useBloco` não é testável sem React: teste da função `estadoBloco(erro, dados)` que dá a mensagem padrão; conferência manual no simulador com a SF de vendas diárias renomeada |
| RF-010 | smoke | `s360SemanalAtualizacao` → `FIM_EM` da última execução concluída; execução com falha mais recente não conta |
| RNT-007 | smoke | venda de cliente fora da carteira, ou em filial sem escopo, não entra no bruto |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-501 | Compromissos, Resumo da Semana, meta semanal e atividades pelas SFs da 003 e da 004 | SFs `s360Dashboard*` próprias | o número do Dashboard é o da Agenda e de Atividades por construção (RF-014 da 003, C-004 da 000); menos SQL |
| D-502 | Meta semanal em tabela nova por perfil e vigência (segunda); a 003 troca `metaDe` pela da 005 | manter 16/8 fixo na 003 | RF-004/A2; sem a troca a Agenda e o Dashboard divergem na primeira mudança |
| D-503 | Faturamento pela `vendaDoVendedor` da 002, uma vez por linha de venda no total do escopo (usuário, 2026-11-03) | somar pessoa a pessoa | uma venda não vira duas no total do time; cada vendedor sozinho continua vendo a venda |
| D-508 | Configuração da meta semanal em Configurações, seção só da diretoria (usuário, 2026-11-03) | botão no card do Dashboard | escolha do usuário; o componente fica nos arquivos da 005 e a tela da 001 só o monta |
| D-504 | Meta mensal = `METAS_BU_VENDEDOR` (C3), recortada por filial/departamento | ler o planejamento direto | RNT-009/D2: o planejamento chega distribuído (hoje pela regra da 007, D-509) |
| D-505 | Contas da tela (percentual, projeção, selo, variação, relato) em `lib/dashboard.ts` | no SQL | testáveis sem banco; a SF devolve só somas |
| D-506 | Gráfico e círculo em SVG à mão | biblioteca de gráfico | 7 barras; nenhuma dependência nova |
| D-507 | Links com parâmetro (`/agenda?modo=DIA&data=`, `/alertas?alertaId=`) | estado de navegação | sobrevive a recarregar; a 008 só lê o parâmetro |
| D-509 | Card do mês, gráfico, data da carga e alertas pelas SFs/fragmentos da 006, 007 e 008 (usuário, "Sim, trocar") | manter os fragmentos provisórios da 005 | o número é o da tela de origem por construção (C-004 da 000); a regra mora numa spec só |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `vendaDoVendedor` por linha de venda no modo Todos os coordenadores | passar de 5 s (RNF-001) | janela de datas antes do `EXISTS`; T-120 mede no sandbox |
| Valor de `STATUS` concluído em `ACOMP_SEMANAL_SYNC_LOG` | data de atualização vazia | regra da 006; sem linha a tela não mostra o texto (RN-016 da 006) |
| A 007 conta meta só em filial/departamento de uma linha de escopo do próprio vendedor | meta do Dashboard menor que o planejado quando a distribuição cai fora do escopo | é a regra do Analytics; o Dashboard só a repete (anotado no relatório) |
| Overview da 007 rotula a projeção só como Acima/Abaixo; a RN-008 tem `No ritmo` (≥ 90%) | mesmo número, rótulo diferente entre 90% e 100% da meta | o selo é regra da 005 e fica; anotado no relatório para a 007 decidir |
| Edição em arquivos da 003 conflitar com a etapa 2 da Agenda | merge | três linhas, citadas no relatório |
