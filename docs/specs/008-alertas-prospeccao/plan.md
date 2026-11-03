# Plan: Alertas inteligentes, direcionamento semanal e prospecção

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Constrói `/alertas` (abas Alertas e Prospecção), `/direcionamento-semanal`, o
conteúdo da aba Prospects de `/clientes` (lugar reservado pela 002), a fila de
geração de alertas e os dois e-mails semanais. Reusa o esqueleto da 001, a
carteira, o escopo e a regra de venda da 002 (`lib/002-carteira.mjs`), as
regras puras da 002 (`lib/002-regras.mjs`: temperatura, curva) e a agenda da
003 (`lib/003-agenda.mjs`: relógio do servidor, `podeOperar`).

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | spec sem pendência aberta; D4 (2026-11-03) tira o botão `Gerar novos alertas` |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-008-alertas.mjs` só roda no sandbox, depois `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nem coluna nova; só SFs `s360*` |
| Leitura e escrita por Server Function | sim | 19 SFs; escrita da tela só por SF SQL; as 3 rotinas são SF JAVASCRIPT agendadas |
| Simulador cobre a feature | sim | `schema-producao/008-alertas.mjs`, `simulator/seeds/008-alertas.mjs` (ids 8001+), `simulator/smoke/008-alertas.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira `teste()` no smoke ou `test()` em `novo/frontend/tests/` (mapa abaixo) |
| Design tokens, sem cor literal | sim | vocabulário de `components/page.tsx`; linha compacta e altura padrão em toda lista |
| Simplicidade | sim | uma dependência nova só, `exceljs` (a mesma do sistema antigo), carregada sob demanda no clique de exportar (D-807) |

## Contexto técnico

- **Reuso backend:** `SEM_BLOQUEIO`, `temPapel`, `COORDENADOR_ATIVO`
  (`guardas.mjs`); `cod`, `num`, `pagina`, `dia`, `nomeCliente`, `nomeUsuario`,
  `semAcento`, `ramoDe`, `naoPessoaFisica`, `titularesCobertos`, `titularDeOutro`,
  `escopoAlvo`, `carteiraVisivel`, `vendaConta`, `ESCOPO_SQL`, `ESCOPO_MARCADO`
  (`002-carteira.mjs`); `temperatura`, `classeTemperatura`, `scoreRanking`,
  `curvaAuto`, `diasEntre`, `somarDias`, `normalizarBusca` (`002-regras.mjs`);
  `HOJE_BR`, `AGORA_BR`, `podeOperar`, `textoOk` (`003-agenda.mjs`).
- **Reuso frontend:** `FiltroEscopo`/`useEscopo` + `paraInput` (escopo),
  `useBloco`/`gravar`, `Confirmacao`, `avisarContadores` (contador do menu,
  C-008), `formato.ts` (moeda, datas), `NovoProspect` da 002 (cadastro, RF-015
  já pronto), diálogos da Agenda (003).
- **Regras do servidor em JavaScript puro**, como a 002 (D-001 de lá):
  `novo/backend/lib/008-regras.mjs` sem import; as SF JAVASCRIPT levam o
  texto das funções (`fn.toString()`). O smoke testa as funções direto nas
  bordas e as SFs ponta a ponta no simulador (o runtime dele executa SF
  JAVASCRIPT com `runQueryMitra`, `runDmlMitra` e `sendEmailMitra` locais).
- **Venda:** `IMP_VENDAS_DASHBOARD_TOTVS_RCA` (bruto, RN-001) e
  `IMP_DEVOLUCOES_TOTVS` (líquido, RNT-008), pela `vendaConta` da 002 — a
  mesma fonte da carteira (D-801). Pedido = `NUMPED`.

## Modelo de dados

Nenhum acréscimo. Lidas ou gravadas:

| Entidade (spec) | Tabela | Uso | Arquivo de schema |
|---|---|---|---|
| Alerta | `ALERTAS_INTELIGENTES` | lê; grava `LIDO`/`DATA_LEITURA` (tela) e linhas novas (rotina) | `001-acesso.mjs` (já existe) |
| Execução da fila | `ALERTAS_PROCESSAMENTO` | rotina grava | **`008-alertas.mjs`** |
| Envio semanal | `ALERTAS_EMAIL_SEMANAL`, `RELATORIO_SEMANAL_COORDENADORES_LOG` | rotinas gravam | **`008-alertas.mjs`** |
| Meta do vendedor (RN-018) | `METAS_BU_VENDEDOR` | lê (RNT-009) | **`008-alertas.mjs`**, DDL inteiro do modelo (se a 006/007 declarar, uma cópia sai no merge; nota na pasta compartilhada) |
| Prospect, contato | `PROSPECTS`, `PROSPECT_CONTATOS` | lê; grava etapa, contato, conversão | `002-carteira.mjs` |
| Visita de prospecção | `PROSPECT_VISITAS` | lê; grava `OBJECOES`, `PROXIMO_PASSO`, `DATA_PROXIMO_PASSO` | `003-agenda.mjs` |
| Visita | `VISITAS` | lê | `002-carteira.mjs` |
| Carteira, escopo, cadastro, venda | `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `CLIENTES`, `IMP_*`, `COORDENADORES*`, `FERIAS_VENDEDOR`, `VENDEDOR_RCA`, `INT_USER` | lê | 000/001/002 |

Formato de `ALERTAS_INTELIGENTES` gravado pela rotina (igual ao antigo):
`TIPO_ALERTA` ∈ `PRODUTO_PERDIDO`, `SAZONALIDADE`, `REPOSICAO`,
`VOLUME_CRESCENTE`, `NAO_EXPLORADO`, `PEDIDO_INCOMPLETO`; `CODFILIAL` INT,
`CODEPTO` texto, `ID_SECAO` texto (vazio = BU sem seção), `MES_REFERENCIA`
`AAAA-MM`, `PRODUTO_REFERENCIA` = `CODPROD - DESCRICAO`. T-801 confere no
sandbox os valores gravados hoje.

## Fragmentos — `novo/backend/lib/008-alertas.mjs`

| Fragmento | Devolve | Regra |
|---|---|---|
| `alertasVisiveis(p)` | `ALERTAS_INTELIGENTES` × linha de `carteiraVisivel(p)` do mesmo vendedor, cliente, filial, departamento (e seção quando o escopo define); colunas do alerta + `COBERTURA` | RN-009 (escopo da BU do alerta; cliente fora da carteira ou da BU some) |
| `podeMarcar(alerta, hoje)` | predicado: dono = `:VAR_USER` ou titular coberto com férias ATIVAS | RN-011 |
| `ALERTAS_MARCAVEIS` | contagem dos não lidos visíveis em Meu painel e marcáveis, com `HOJE_BR` | RN-013 (contador do menu, sem parâmetro) |
| `carteiraDoVendedor(v)` | mesmo formato de `carteiraVisivel`, para um vendedor dado (a rotina roda sem usuário de tela) | RN-001 |
| `podeDirecionar` | coordenador ativo, DIRETORIA ou ADMIN | RN-025 |
| `TIPOS_ALERTA` | os 6 códigos e rótulos | RF-001 |

## Contratos de backend

Arquivo `novo/backend/add-008-alertas.mjs`. Escopo = os sete parâmetros da 002
(`modo`, `coordenador`, `vendedor`, `filial`, `depto`, `secao`, `hoje`).
Toda SF resolve quem chama por `:VAR_USER` e leva `SEM_BLOQUEIO`.

### Alertas (aba Alertas)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360AlertasPainel` | SQL | escopo | linhas por `TIPO_LINHA`: `RESUMO` (`PENDENTES` = não lidos do escopo, `MARCAVEIS` = não lidos que posso marcar), `RAMO` (ramos dos alertas do escopo), `PRODUTO` (Produto Perdido + Não Explorado não lidos por produto: `N`, `POTENCIAL`, por potencial) | RF-006, RN-010, RN-012 |
| `s360AlertasListar` | SQL | escopo + `busca`, `ramo`, `tipo`, `valorMin`, `situacao` (`NAO_LIDOS` padrão, `LIDOS`, `TODOS`), `clienteId`, `produto`, `pagina` | 50 por página; alerta + `CLIENTE`, `CNPJ`, `RAMO`, `ESCOPO`, `VENDEDOR`, `PODE_MARCAR`, `N_CLIENTE`, `POTENCIAL_CLIENTE` e, em toda linha, `TOTAL` e `POTENCIAL` do filtro inteiro (`COUNT/SUM OVER ()`); ordem: potencial do cliente ↓, cliente, valor ↓, prioridade | RF-002/003, RN-009/010/012, C-001, C-006, C-007 |
| `s360AlertaMarcarLido` | SQL | `id`, `hoje` | linhas afetadas; só não lido, visível e marcável | RF-004, RN-011, C-005 |
| `s360AlertasMarcarTodos` | SQL | `filial`, `depto`, `secao`, `hoje` | linhas afetadas; não lidos marcáveis visíveis em Meu painel no recorte | RF-004, RN-011, C-004 |
| `s360AlertaHistorico` | SQL | `alertaId`, `hoje` | meses com compra dos 12 anteriores + atual: `MES`, `VALOR`, `PEDIDOS` do produto (Sazonalidade, Reposição) ou do cliente (Volume Crescente) na BU do alerta | RF-007, RN-014 |
| `s360AlertaSugestoes` | SQL | `alertaId`, `hoje` | até 5 produtos: primeiro os de outros alertas do cliente, depois os comprados em 12 meses por clientes do mesmo ramo na BU | RF-008, RN-005 |

- **Contador do menu (RN-013):** `s360ContadoresObter` da 001 passa a contar
  `ALERTAS_MARCAVEIS` no lugar de `ID_VENDEDOR = :VAR_USER AND LIDO = 0`
  (edição pontual em `add-001-acesso.mjs`; nenhum parâmetro novo, data do
  relógio do servidor). A tela chama `avisarContadores()` depois de marcar.
- Mensagens (RNT-013): 1 alterado → "Alerta marcado como lido."; N →
  "N alertas marcados como lidos."; 0 com `PODE_MARCAR = 0` → "Nada foi
  alterado: o alerta pertence a outro vendedor."; 0 em `Marcar tudo` →
  "Nada foi alterado: não há alertas seus não lidos neste recorte."
  `Marcar tudo` fica desabilitado com a dica da C-005 quando `MARCAVEIS = 0`.

### Geração (rotina agendada, RN-001…008, RN-016)

| Nome | Tipo | Agenda | O que faz |
|---|---|---|---|
| `s360AlertasProcessarFila` | JAVASCRIPT | `*/10 6-19 * * *` e `0 20 * * *` (6h às 20h, a cada 10 min) | 1) primeira execução do dia: cria a fila (`RUN_ID` = dia) com todo vendedor com BU ativa, se não existe fila do dia; 2) item `PROCESSANDO` há mais de 20 min → `ERRO`; 3) pega até 3 `PENDENTE`: lê carteira (`carteiraDoVendedor`), vendas de 12 meses e alertas não lidos do vendedor, gera com `gerarAlertas()` e grava os que não têm igual não lido (RN-008); falha do vendedor inteiro → um item por cliente; falha de item de cliente → `ERRO`; 4) apaga alertas com mais de 60 dias |

Regras puras em `lib/008-regras.mjs` (o que o smoke testa nas bordas):
`produtoPerdido`, `sazonalidade`, `reposicao`, `volumeCrescente`,
`naoExplorado`, `pedidoIncompleto` (RN-002…007, uma por tipo, recebem as
linhas de venda do cliente e `hoje`), `gerarAlertas` (junta e aplica os
limites "até 3"), `chaveAlerta` + `semDuplicados` (RN-008), `planoFila`
(quem vira erro, quem processa agora, RN-016/RNF-001).

### E-mails semanais (rotinas agendadas)

| Nome | Tipo | Agenda | O que faz |
|---|---|---|---|
| `s360AlertasResumoSemanal` | JAVASCRIPT | `0 3 * * 4` | por vendedor com avisos gerados nos 7 dias anteriores: se não há linha `ENVIADO` em `ALERTAS_EMAIL_SEMANAL` para a semana, envia "Resumo semanal de avisos comerciais" (30 linhas por prioridade e data, nota quando há mais) ao e-mail de acesso e grava `ENVIADO`; falha → `ERRO` com a mensagem, segue para o próximo |
| `s360RelatorioSemanalCoordenadores` | JAVASCRIPT | `0 8 * * 1` | por coordenador ativo com e-mail: última semana operacional encerrada (RNT-005), nas BUs dele; bruto, devolução, líquido, pedidos, ranking de vendedores e 12 clientes em líquido, BUs, vendas por dia, produtos, meta proporcional (`METAS_BU_VENDEDOR`) e análises; idempotente por `RELATORIO_SEMANAL_COORDENADORES_LOG` |

Regras puras: `linhasResumo` (RN-017), `periodoRelatorio(execucao)`,
`metaProporcional`, `analises` (RN-018), `semanasOperacionais(mes)` (RNT-005)
e os dois `htmlEmail`.

### Prospecção (aba Prospecção)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360ProspeccaoListar` | JAVASCRIPT | escopo + `tendencia` (vazio = todos), `busca`, `pagina` | `{ ok, semana, mes, altas, total, linhas[] }` — linha: cliente, `CURVA`, `TEMPERATURA` (classe), `CICLO`, `DIAS_SEM_COMPRAR`, `ULTIMA_COMPRA`, `PADRAO` (compras na semana), `TENDENCIA` (`ALTA`, `MEDIA`, `BAIXA`, `INATIVO`), `ATRASADO` (dias > ciclo); 20 por página | RF-014, RN-020, C-013, C-014 |

- 3 consultas por `runQueryMitra`: carteira visível (`carteiraVisivel`) com
  curva manual; dias de compra e valores por cliente pela `vendaConta`;
  visitas concluídas pelo dono. Temperatura e curva automática pelas funções
  da 002 (D-803). `Atualizar` só chama esta SF de novo (correção 11).
- `Agendar visita` abre `/agenda?clienteId=<id>`: a Agenda abre "Nova visita"
  com o cliente preenchido (edição pontual na 003, D-806).

### Prospects (aba Prospects de `/clientes`)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360ProspectsListar` | SQL | `etapa`, `busca`, `pagina`, `hoje` | 20 por página com `TOTAL`: prospect + `RESPONSAVEL`, contato principal, `VISITAS`, `ULTIMA_VISITA`, `PROXIMO_PASSO`, `PODE_EDITAR` | RF-016, RN-021 |
| `s360ProspectDetalhe` | SQL | `prospectId`, `hoje` | `TIPO_LINHA` `CONTATO` (nome, cargo, telefone, e-mail, principal) e `VISITA` (data, executivo, situação, resumo, objeções, próximo passo e data) | RF-016 |
| `s360ProspectEtapaMudar` | SQL | `prospectId`, `etapa`, `hoje` | linhas afetadas; qualquer etapa menos Convertido; Convertido não muda | RN-022, C-016 |
| `s360ProspectContatoAdicionar` | SQL | `prospectId`, `nome`, `cargo`, `telefone`, `email`, `principal`, `hoje` | linhas afetadas (principal novo desmarca o anterior na mesma SF) | RF-016 |
| `s360ProspectConverter` | SQL | `prospectId`, `codigo`, `hoje` | linhas afetadas; exige `CLIENTES.ID = codigo`; grava código, `CONVERTIDO_EM`, etapa `CONVERTIDO`; não toca a carteira | RN-023, C-017 |
| `s360ProspectVisitaResultado` | SQL | `visitaId`, `objecoes`, `proximoPasso`, `dataProximoPasso` | linhas afetadas; só visita `CONCLUIDA` que o usuário opera (`podeOperar`) | RF-017, RN-024 |

- Visibilidade (RN-021): responsável = `:VAR_USER`, titular coberto
  (RNT-010), equipe do coordenador (`escopoAlvo` `TEAM`), DIRETORIA/ADMIN.
  Quem age sobre o prospect: ver P-1 abaixo.
- Concluir a visita de prospecção (check-out da 003) já exige o resumo e já
  leva Novo/Visita agendada a Visitado; o diálogo do check-out ganha os
  campos objeções, próximo passo e data quando a origem é prospecção e chama
  `s360ProspectVisitaResultado` depois do check-out (edição pontual na 003).
- 0 linhas no converter → "Código de cliente não encontrado no ERP." quando o
  código não existe (a tela pergunta `s360ProspectDetalhe` de novo e vê que a
  etapa não mudou); "Nada foi alterado: …" nas outras recusas.

### Direcionamento Semanal

Toda SF começa por `podeDirecionar` e recebe escopo + `semana` (segunda,
`AAAA-MM-DD`) e `hoje`. Sem permissão = zero linhas (C-021).

| Nome | Tipo | Entrada extra | Saída | Atende |
|---|---|---|---|---|
| `s360DirecionamentoAgenda` | SQL | — | um compromisso por linha (visitas a clientes e de prospecção dos executivos do escopo, segunda a sexta): `EXECUTIVO_ID`, `EXECUTIVO`, `ORIGEM`, `DATA`, `HORA`, `CLIENTE`, `STATUS`, `CONCLUIDA`, `NAO_CONCLUIDA`, `SEM_RELATO`, `VENCIDA`, `REAGENDADA`, `CANCELADA`, `SITUACAO` | RF-018, RN-026, C-018 |
| `s360DirecionamentoCriticos` | JAVASCRIPT | — | `{ ok, executivos[] }`: executivo, `EM_RISCO` (soma do ticket dos que não compraram), clientes (`CURVA`, `ULTIMA`, `CICLO`, `PREVISTA`, `COMPROU`, `SITUACAO`, `TICKET`) | RN-027, C-019 |
| `s360DirecionamentoSemVisita` | SQL | `faixa`, `busca`, `pagina` | 30 por vez com `TOTAL` e totais por faixa (`N_NUNCA`, `N_31_60`, `N_61_90`, `N_90`, por cliente distinto): cliente, cidade, executivo, `ULTIMA_VISITA`, `DIAS`, `FAIXA`, `PROXIMA_VISITA` | RN-028, C-020 |

- Reagendada (RN-026) = o compromisso tem o registro que a 003 grava quando a
  data muda (bloco "Reagendamento em" no relato/resumo, D-305 da 003).
  "Tem relato" ignora esse bloco (D-804).
- Agregação por executivo, cores de execução, "mostrar só com ocorrência",
  ordem e vazios: `lib/direcionamento.ts` (tela), sobre as linhas da SF.

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/alertas` | abas `Alertas` e `Prospecção` (`?aba=prospeccao`); filtro de escopo no topo | `pages/AlertasPage.tsx` |
| Aba Alertas | cabeçalho `N alertas pendentes` · `R$ X potencial`; bloco Oportunidades e Vendas Perdidas (3 produtos, `Ver detalhes` filtra pelo produto, `Ver todas` mostra o ranking inteiro); filtros busca/ramo/tipo/valor mínimo/situação no endereço; lista agrupada por cliente (até 2 alertas aberto, senão `Ver alertas (n)`), `Cliente` abre `/clientes?clienteId=`; `Marcar como lido`, `Marcar tudo como lido`; `Ver padrão histórico` (barras CSS de 13 meses) e sugestões em Volume Crescente; paginação | `pages/alertas/AbaAlertas.tsx`, `pages/alertas/Historico.tsx` |
| Aba Prospecção | subtítulo "Semana N de <mês> — N clientes com alta tendência de recompra"; filtros tendência/busca; lista com curva, temperatura, ciclo, dias sem comprar (destaque), tendência, `Agendar visita`; `Atualizar` | `pages/alertas/AbaProspeccao.tsx` |
| `/clientes` aba Prospects | filtros etapa/busca; lista com etapa, responsável, contato, visitas, próximo passo; `Mudar etapa`, `Adicionar contato`, `Converter`, detalhe com contatos e visitas | `pages/clientes/AbaProspects.tsx` (substitui o lugar reservado) |
| `/direcionamento-semanal` | navegação `Semana atual` / anterior / próxima; abas Controle de Agenda e Visitas, Clientes Críticos sem Compra, Carteira sem Visitação (cada uma carrega só quando aberta); `Exportar` por aba; `Ver dados de exemplo` no Controle de Agenda | `pages/DirecionamentoPage.tsx`, `pages/direcionamento/*.tsx` |

Regras puras (o que os testes importam):

| Arquivo | Funções |
|---|---|
| `lib/alertas.ts` | `TIPOS`, `SITUACOES`, `filtrosDaUrl`/`urlDosFiltros`, `agruparPorCliente` (expande ≤ 2), `mensagemMarcar(n, podeMarcar)`, `serieHistorica(hoje, linhas)` (13 meses), `tituloHistorico(serie, mesAtual)` (RN-014), `rotuloTendencia`, `subtituloProspeccao`, `ETAPAS`, `etapasPermitidas(atual)`, `validarContato`, `validarConversao` |
| `lib/direcionamento.ts` | `semanaDe(hoje)`, `navegarSemana`, `resumoAgenda(linhas)` (por executivo, execução e cor, ordem por pendências), `comOcorrencia`, `FAIXAS`, `DADOS_EXEMPLO`, `planilhaAgenda`/`planilhaCriticos`/`planilhaSemVisita` (linhas e formatos das abas, RN-029), `exportar(nome, abas)` (`exceljs` sob demanda) |

## Fluxo

1. **Aba Alertas:** `s360EscopoOpcoes`, `s360AlertasPainel`, `s360AlertasListar`
   — 3 consultas (RNF-003). Gráfico e sugestões só ao expandir.
2. **Filtro, busca (400 ms), página:** só `s360AlertasListar`; filtro novo
   volta à página 1 e vai para o endereço.
3. **Marcar:** `s360AlertaMarcarLido` / `s360AlertasMarcarTodos` → mensagem
   (RNT-013) → `avisarContadores()` → painel e lista recarregam.
4. **Prospecção:** `s360ProspeccaoListar` ao abrir a aba e em `Atualizar`.
5. **Prospects:** `s360ProspectsListar`; ações → SF → mensagem → recarga.
6. **Direcionamento:** a aba aberta chama a sua SF com a semana; trocar de
   semana recarrega só a aba aberta; `Exportar` usa as linhas já carregadas
   (Carteira sem Visitação pede todas as páginas da faixa e busca).

## Simulador

- `schema-producao/008-alertas.mjs`: `ALERTAS_PROCESSAMENTO`,
  `ALERTAS_EMAIL_SEMANAL`, `RELATORIO_SEMANAL_COORDENADORES_LOG`,
  `METAS_BU_VENDEDOR` (DDL inteiro do modelo de dados).
- `simulator/seeds/008-alertas.mjs` (hoje = 30/10/2026; ids 8001+; filial 4
  Anápolis, que nenhuma outra spec usa, para não mexer em contagens alheias):

  | Quem / o quê | Para |
  |---|---|
  | Alice (vendedora, `ctx.usuario`): F4·Nutrição e F4·Medicamento; 12 alertas no escopo, 8 não lidos (5 Nutrição, 3 Medicamento) e 4 lidos; cliente Y com 3 dos não lidos | C-001, C-004, C-007, tela |
  | Bento (vendedor): substituto de Alice de 01/11 a 15/11 | C-005, C-014 |
  | Celso (coordenador ativo 8001, BUs F4·1 e F4·8) e Dora (coordenadora 8002, só F2·1; Alice também tem F2·1 com 1 alerta) | C-005, RN-009 |
  | clientes 8001+ com vendas de 13 meses: K (ciclo 20, 18 dias, padrão 2), L (100 dias), W (curva A, compras 01/09, 21/09, 11/10), produto P perdido (C-002) | C-013, C-019, C-002 |
  | visitas e prospecções de Alice na semana de 26/10 (os 11 compromissos da C-018), V/U/T sem visitação | C-018, C-020, tela |
  | prospects de Alice (Novo, Negociação, Perdido) com contatos e visitas | aba Prospects |
  | fila do dia já criada e processada (itens `CONCLUIDO`) | estado de produção |

  Dados de um teste só (340 alertas, 26 vendedores, 45 avisos) entram no
  próprio smoke, no banco descartável.
- `CHECK_INPUT` (`simulator/config.mjs`): + `tipo`, `situacao`, `valorMin`,
  `produto`, `semana`, `faixa`, `etapa`, `tendencia`, `alertaId`, `prospectId`
  (os que ainda não existem), para o `sim:check` rodar as SFs SQL.

## Testes

Backend em `simulator/smoke/008-alertas.mjs` (banco próprio, hoje =
`2026-10-30` salvo indicação); tela em `tests/alertas.test.mjs` e
`tests/direcionamento.test.mjs`. O título de cada teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-010 | smoke | Alice `ME`: padrão 8 (`TOTAL`), `TODOS` 12, `LIDOS` 4; `PENDENTES` 8 |
| C-002 / RN-002 | smoke (funções + SF) | 900/600/300 em mar/mai/jun → 1 alerta Alta 600,00; compra em 15/09 → nenhum; a SF da fila grava o alerta para Alice na BU |
| RN-003 | smoke (funções) | out/2025 sem out/2026 → Alta; compra em 05/10/2026 → nenhum |
| RN-004 | smoke (funções) | 01/08, 31/08, 30/09, hoje 28/10 → previsão 30/10, Média, 0; hoje 20/10 → nenhum |
| RN-005 | smoke (funções) | 13.000 × 10.000 → valor 13.000; 12.000 → nenhum; anteriores 0 → nenhum |
| RN-006 | smoke (funções) | 2 clientes do ramo, R$ 2.400 → Baixa 200,00; 1 cliente → nenhum |
| RN-007 | smoke (funções) | média 1.000, ontem 400 → Média 400; 600 → nenhum |
| C-003 / RN-008 | smoke (SF da fila) | 2ª execução → 0 criados; depois de lido → 1 criado; alerta de 61 dias → apagado |
| C-004 / RN-011 | smoke | recorte depto 1 → 5 alterados; 3 de Medicamento seguem não lidos |
| C-005 / RN-011 | smoke + `alertas.test` | Celso marca alerta de Alice → 0 e `PODE_MARCAR = 0` → mensagem; `MARCAVEIS` 0; Bento em 05/11 → 1 |
| C-006 / RN-012 | smoke | 340 alertas no teste: Reposição → `TOTAL` 57, 50 linhas; busca `12345678000190` → 4 e `POTENCIAL` = soma dos 4 |
| C-007 / RN-009 | smoke | tirar Y da carteira → lista e `s360ContadoresObter` 8 → 5; Dora não vê o alerta F4 de Alice e vê o F2 |
| C-008 / RN-013 | smoke + `alertas.test` | contador 7 → marcar 1 → 6 pela SF; a tela chama `avisarContadores` (mensagem de 1 alterado) |
| RN-014 | `alertas.test` | `serieHistorica` tem 13 meses; 2 meses iguais ao atual → "padrão de sazonalidade confirmado"; 1 → "apenas 1 ocorrências"; 0 → "Sem histórico neste período" |
| C-010 / RN-016 | smoke (funções + SF) | 26 vendedores, 3 por execução → 9 execuções; 2ª criação no dia → nenhuma; falha com 40 clientes → 40 itens; preso há 21 min → `ERRO` |
| C-011 / RN-017 | smoke (SF + funções) | 45 avisos → 1 e-mail com 30 linhas e a nota; reexecução → nenhum envio; Bruno sem avisos → nenhum |
| C-012 / RN-018 | smoke (funções + SF) | execução 09/11 → 01/11–05/11; 50.000 − 2.000 → 48.000 no cabeçalho e no ranking; meta 30.000 → 5.000,00; execução 02/11 → 30/10–31/10 |
| C-013 / RN-020 | smoke | K → `ALTA`; com 15 dias → `MEDIA`; L → `INATIVO` e aparece no filtro `INATIVO` |
| C-014 / RN-020 | smoke | Bento em 05/11 vê clientes de Alice; em 16/11 não; filtro Nutrição tira cliente que só comprou em Medicamento |
| C-015 / RN-021 | smoke | `s360ProspectsListar`: Alice vê os seus, Celso os da equipe, Gil (diretoria) todos, Bruno nenhum de Alice (o cadastro é da 002 e já tem teste lá) |
| C-016 / RN-022 | smoke | Negociação + agendar (SF da 003) → Negociação; Novo + agendar → Visita agendada; check-out → Visitado; Perdido → Novo aceito; Convertido → qualquer etapa 0 |
| C-017 / RN-023 | smoke | 98765 → 0 e etapa igual; código existente → Convertido com data; some de `s360AgendaProspects`; carteira de Alice sem o cliente |
| RN-024 | smoke | check-out sem resumo → 0 (SF da 003); com resumo + `s360ProspectVisitaResultado` → objeções, próximo passo e data gravados; visita não concluída → 0 |
| C-018 / RN-026 | smoke + `direcionamento.test` | SF: os 11 → somas 10/8/2/2/2/1, 27/10 "Vencida sem relato"; tela: `resumoAgenda` → 80% verde |
| C-019 / RN-027 | smoke + funções | ciclo 20, previsão 31/10; 29/10 "Ainda no prazo"; 02/11 "Não comprou" e no risco; 2 compras → fora |
| C-020 / RN-028 | smoke | hoje 30/10: V 45 dias "31 a 60"; U e T (só check-in) "Nunca visitados"; concluída 10/10 → fora |
| C-021 / RN-025 | smoke | Alice nas 3 SFs → zero linhas / `ok: false` |
| RN-029 | `direcionamento.test` | `planilhaAgenda` de 5 executivos → aba Resumo com 5 linhas + Total; Execução 0,8 com formato `0%`; exemplo leva o aviso |
| RF-020 | `direcionamento.test` | `DADOS_EXEMPLO` monta o resumo sem chamada ao servidor |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-801 | Alertas e prospecção leem `IMP_VENDAS_DASHBOARD_TOTVS_RCA` pela `vendaConta` | `PEDIDOS_SEMANAIS_SYNC_RAW` do antigo | mesma fonte e mesma atribuição da carteira (RNT-007); a raw é do acompanhamento (006) |
| D-802 | Lista de alertas e totais numa SF SQL só (`COUNT`/`SUM OVER ()`, `ROW_NUMBER`), página de 50 alertas | SF JS; página por cliente | filtros sobre o escopo inteiro com uma consulta (correção 3); C-006 conta alertas |
| D-803 | Prospecção e Clientes Críticos em SF JAVASCRIPT com as funções da 002 (temperatura, curva) | SQL | semana operacional, ciclo e "20% de maior faturamento" por executivo são regra de calendário e ranking; mesma temperatura da carteira |
| D-804 | Reagendada = há o bloco "Reagendamento em" que a 003 grava ao mudar a data; esse bloco não conta como relato | coluna nova | D-305 da 003 (nenhuma coluna nova); a 003 só grava o bloco quando a data muda |
| D-805 | Contador do menu corrigido na própria `s360ContadoresObter` (001) | SF nova da 008 + Layout | o menu já chama essa SF; uma consulta a menos |
| D-806 | `Agendar visita` → `/agenda?clienteId=` | diálogo de agenda dentro de Alertas | a criação é da 003; a Agenda só passa a ler o parâmetro |
| D-807 | Exportação com `exceljs` (import dinâmico) | escrever o xlsx à mão | datas, números e percentual formatados (RN-029) exigem estilos; é a biblioteca do sistema antigo e só baixa no clique |
| D-808 | Rotinas aceitam `hoje`/`agora` no `event` (só para teste); sem eles, relógio de Brasília | relógio fixo | o smoke prova as datas da spec; o agendamento não manda nada |
| D-809 | Mensagem de C-021 = a mensagem padrão de tela restrita da 001 (a rota já bloqueia por perfil); o servidor devolve zero linhas | mensagem própria na página | a página nem monta para vendedor; o texto fica no relatório como divergência da spec |

## Perguntas ao usuário (antes de codar)

- **P-1** Quem pode mudar etapa, incluir contato e converter um prospect.
- **P-2** "Curva A" na Prospecção e nos Clientes Críticos: a mesma curva da Minha Carteira (fixada ou do ranking)?
- **P-3** Incluir agora a aba Prospects (002), o resultado da visita no check-out e o `Agendar visita` (003)?
- **P-4** Incluir agora os dois e-mails semanais?

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `:VAR_USER` em `runQueryMitra` dentro de SF JS (mesmo risco da 002) | prospecção vazia | T-801 no sandbox, junto com a 002 |
| Rotina agendada sem usuário (`:VAR_USER` vazio) | fila não roda | a rotina não usa `:VAR_USER`; `carteiraDoVendedor(v)` recebe o id |
| Volume da fila: 12 meses de vendas por vendedor | execução > 10 min | 3 por execução (RNF-001); item preso vira erro; vendedor dividido por cliente |
| Valores gravados pelo antigo em `ALERTAS_INTELIGENTES` (tipo, seção, produto) | filtro não casa alerta antigo | T-801 lê os distintos; a rotina nova apaga os de mais de 60 dias |
| Duas rotinas (antiga 264 e nova) gerando ao mesmo tempo | alertas duplicados | RN-008 nos dois lados; a antiga é desligada na troca (T-830) |
| `METAS_BU_VENDEDOR` declarada também pela 006/007 | DDL repetido no merge | DDL inteiro do modelo; nota na pasta compartilhada |

## Complexity Tracking

| Violação | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| Dependência nova `exceljs` no frontend | RN-029 (tipos e formatos) | CSV: não tem abas nem formato de percentual |
| 5 SFs JAVASCRIPT (3 rotinas, prospecção, críticos) | regras de calendário e envio de e-mail | SQL puro: e-mail não sai de SQL |
