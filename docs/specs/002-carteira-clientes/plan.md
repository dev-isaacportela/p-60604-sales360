# Plan: Carteira de clientes

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Segunda spec construída sobre o esqueleto da 001 (`novo/`). É a primeira tela
com **filtro de escopo** (RNT-003) e a primeira que lê vendas, então também
entrega os fragmentos de carteira, escopo e atribuição de venda que as specs
003–010 vão reusar (`novo/backend/lib/002-carteira.mjs`).

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta (decisões de 2026-10-30) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-002-carteira.mjs` só roda no sandbox, depois dele `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nova nem coluna nova; só SFs `s360*` |
| Leitura e escrita por Server Function | sim | 24 SFs; escrita só por SF SQL (business não usa `runDml`); ficha do cliente por SF (RNFT-005) |
| Simulador cobre a feature | sim | `schema-producao/002-carteira.mjs`, `simulator/seeds/002-carteira.mjs` (ids 2001+), `simulator/smoke/002-carteira.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira um `teste()` no smoke ou um `test()` em `novo/frontend/tests/` (mapa abaixo) |
| Design tokens, sem cor literal | sim | telas com `/benenutri:design` (modo Construir), vocabulário de `components/page.tsx` |
| Simplicidade | sim | nenhuma dependência nova; a regra da carteira roda uma vez por carga no servidor (RNF-002) |

## Contexto técnico

- Mesmo stack da 001. Nenhuma dependência nova nos dois lados.
- **Reuso:** `lib/guardas.mjs` (`SEM_BLOQUEIO`, `temPapel`, `COORDENADOR_ATIVO`),
  `mitra-api.ts` (`linhas`/`acao`/`linhasAfetadas`), `formato.ts`
  (`hojeBrasilia`, `agoraBrasilia`, moeda e percentual RNT-011), primitivos de
  `components/ui/` e `components/page.tsx`, `SessaoProvider` (papéis e
  coordenador ativo da sessão).
- **Regras do servidor em JavaScript puro (D-001):** score de ranking, curva,
  temperatura, selo de queda, busca inteligente, ordenação, indicadores e
  paginação da carteira moram em `novo/backend/lib/002-regras.mjs` como
  funções sem import. A SF JAVASCRIPT publicada leva o **texto** dessas funções
  (`fn.toString()`), então o smoke testa o mesmo código que vai para a
  plataforma, pela SF e também chamando as funções direto nas bordas.

## Modelo de dados

Nenhum acréscimo. Tudo já existe em produção; as tabelas sem DDL no
repositório (L-01) têm as colunas usadas declaradas e marcadas "confirmar no
sandbox" (T-001).

| Entidade (spec) | Tabela | Campos usados | Observação |
|---|---|---|---|
| Vínculo de carteira | `EQUIPE_CLIENTE` | `ID_CLIENTE`, `ID_VENDEDOR`, `CODFILIAL`, `ID_SECAO`, `CURVA_CLASSIFICACAO`, `CRIADO_EM` | grava (adicionar, remover, curva) |
| Cliente | `CLIENTES` | cadastro inteiro (ficha) | só leitura; `ID` = código do ERP (C5) |
| Ramo | `IMP_CLIENTES_TOTVS` | `CODCLI`, `RAMO` | só leitura; `RAMO = 'PESSOA FISICA'` nunca entra (RN-001) |
| Escopo | `BU_VENDEDOR`, `VENDEDOR_RCA`, `COORDENADORES`, `COORDENADORES_BU`, `FILIAL`, `BU`, `SECAO` | — | só leitura |
| Férias | `FERIAS_VENDEDOR` | período `ATIVO` em `{{hoje}}` | só leitura (RNT-010) |
| Bloqueio | `USUARIO_BLOQUEIO` | `BLOQUEADO = 1` | fora da titularidade (RN-002) |
| Titular | `CLIENTE_TITULAR_DEPTO` | `ID_CLIENTE`, `CODFILIAL`, `CODEPTO`, `ID_SECAO`, `VENDEDOR_ID`, `ORIGEM` (`AUTO`/`MANUAL`), `ATIVO`, `ALTERADO_POR` | grava; mesmo formato do antigo (`CODFILIAL`/`CODEPTO` como texto sem espaço, uma linha por seção) |
| Venda / devolução | `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS` | `CODCLI`, `CODFILIAL`, `CODEPTO`, `CODSEC`, `NUMPED`, `DTSAIDA`/`DATA_DEVOLUCAO`, `CODPROD`, `DESCRICAO`, `QT`, `VLUNIT`, `TOTAL`/`VALOR_DEVOLVIDO` | sem DDL (L-01): **confirmar no sandbox** tipo das datas e dos códigos |
| Visita | `VISITAS` | `CLIENTE_ID`, `VENDEDOR_ID`, `DATA_AGENDADA`, `STATUS = 'CONCLUIDA'`, `RELATO`, `PLANEJAMENTO`, `HORA_INICIO` | só leitura (spec 003 grava) |
| Atividade | `TAREFAS` | `CLIENTE_ID`, `STATUS = 'CONCLUIDA'`, `CONCLUIDO_EM` | só leitura |
| Relato avulso | `RELATOS_CLIENTE` | todas | grava |
| Mix | `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS`, `PRODUTOS_CUSTOS` | `ENVIADO_HISTORICO = 1`, `DT_ENVIO_HISTORICO`; itens; `NOME` | só leitura (spec 009 é dona) |
| Alerta | `ALERTAS_INTELIGENTES` | `ID_VENDEDOR`, `ID_CLIENTE`, `LIDO = 0` | só leitura |
| Prospect | `PROSPECTS`, `PROSPECT_CONTATOS` | campos da RN-021 | grava (criar); a lista é da spec 008 |

Regras de leitura comuns (todas em `lib/002-carteira.mjs`):
- **Códigos sem zero à esquerda (RNT-007, C6):** `cod(x)` =
  `CAST(TRIM(CAST(x AS CHAR)) AS UNSIGNED)` dos dois lados de toda junção por
  filial, departamento e seção.
- **Datas:** dia comparado como `LEFT(CAST(col AS CHAR), 10)` contra literal
  `'AAAA-MM-DD'`; os limites de janela (90, 60, 120 dias, mês) são calculados em
  JavaScript a partir de `hoje` vindo da tela (D-007 da 001). Nenhum `NOW()`.
- **Parâmetro numérico** sempre como texto: `num('x')` =
  `CAST(NULLIF(TRIM('{{x}}'), '') AS UNSIGNED)`; vazio vira `NULL` e a consulta
  devolve zero linhas em vez de erro de sintaxe.
- **Departamento da seção:** `SECAO.ID_BU = BU.ID`, código = `BU.CODIGO`.
- **Status do cadastro:** `CLIENTES.STATUS` exibido como Ativo / Inativo /
  Em risco; os valores gravados (`ATIVO`, `INATIVO`, `EM_RISCO`?) são
  **confirmados no sandbox** (T-001).

## Fragmentos reusáveis — `novo/backend/lib/002-carteira.mjs`

Cada fragmento recebe **expressões SQL** para os parâmetros, então serve a SF
SQL (`"'{{modo}}'"`) e a SF JAVASCRIPT (literal já escapado):

| Fragmento | Devolve | Regra |
|---|---|---|
| `escopoAlvo(p)` | tabela derivada `(VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, COBERTURA)`: as linhas ativas de `BU_VENDEDOR` do recorte pedido | RNT-003/004: `ME` = as próprias + as do titular com férias ATIVAS em `p.hoje` (`COBERTURA = 1`); `TEAM` = BUs do coordenador ativo, vendedor com RCA; `SELLER` = um vendedor dentro do coordenador escolhido (ou da equipe); `ALL`/`COORD` só para DIRETORIA/ADMIN; recortes de filial, departamento e seção; modo sem permissão = zero linhas |
| `BLOQUEADOS` | subconsulta de `USER_ID` bloqueados | RN-002 |
| `carteiraVisivel(p)` | `(ID_CLIENTE, VENDEDOR_ID, CODFILIAL, CODEPTO, ID_SECAO, COBERTURA, CURVA)`: vínculo × linha de escopo do dono | RN-001: sem Pessoa Física; RN-002: some a combinação (com seção) titulada por outro não bloqueado |
| `vendaConta(venda, cart)` | predicado: a linha de venda/devolução conta para a linha de carteira | RNT-007 (cliente, filial, departamento, seção quando o escopo define) + RN-002 (titular da combinação da venda, se houver, é o dono) |
| `vendaDoVendedor(venda, vendedor, data)` | predicado: a linha conta para um vendedor | RNT-007 completa, com o titular de férias ATIVAS **na data da venda**; para Dashboard, Analytics e acompanhamento |
| `candidatos(cliente)` | `(ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO, VENDEDOR_ID)` | RN-002: cliente na carteira + escopo ativo com seção + não bloqueado |
| `semAcento(expr)` | expressão em maiúsculas sem acento | RNT-014 nas buscas por `LIKE` |
| `DEPTOS_POR_SECAO` | `[2]` (Enfermagem) | RN-020 |

O comentário de cabeçalho do arquivo mostra o uso em SF SQL e em JAVASCRIPT.

## Contratos de backend

Arquivo `novo/backend/add-002-carteira.mjs` (exporta `definitions`). Toda SF
resolve quem chama por `:VAR_USER` e leva `SEM_BLOQUEIO`. Parâmetros de escopo,
iguais em todas as SFs que recortam carteira: `modo` (`ME`, `TEAM`, `SELLER`,
`ALL`, `COORD`), `coordenador` (código de supervisor), `vendedor`, `filial`,
`depto`, `secao` (vazio = sem recorte) e `hoje` (`AAAA-MM-DD`, Brasília). Abaixo
"escopo" = esses sete.

### Escopo e carteira

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360EscopoOpcoes` | SQL | — | linhas de escopo que a pessoa pode pedir: `COD_SUPERVISOR`, `COORDENADOR`, `VENDEDOR_ID`, `VENDEDOR`, `CODFILIAL`, `FILIAL`, `CODEPTO`, `DEPTO`, `ID_SECAO`, `SECAO`, `PROPRIO`; e por linha `PODE_TIME`, `PODE_DIRETORIA` | RNT-003 (a tela monta modos e cascata) |
| `s360CarteiraCarregar` | JAVASCRIPT | escopo + `busca`, `ramo`, `status`, `ordem` (`RANK_AD`, `RANK_DA`, `NOME_AZ`, `NOME_ZA`, `STATUS`, `DIAS_VISITA`), `pendentes` (0/1), `pagina`, `porPagina` (10) | `{ ok, total, linhas[], indicadores, ramos[] }` — linha: `ID`, `NOME`, `RAZAO_SOCIAL`, `CNPJ`, `CIDADE`, `UF`, `RAMO`, `STATUS`, `CURVA`, `CURVA_MANUAL`, `SCORE`, `TEMPERATURA` {`total`, `classe`, `recencia`, `frequencia`, `tendencia`, `visitas`, `diasSemComprar`, `ciclo`, `variacao`, `diasSemVisita`}, `DIAS_SEM_VISITA`, `DIAS_ULTIMA_COMPRA`, `LIMITE_CURVA`, `PENDENTE`, `ALERTA`, `QUEDA`, `COBERTURA`, `PODE_REMOVER`; indicadores: `total`, `ativos`, `receita`, `ticket`, `score`, `pendentes`; `ramos` = distribuição da carteira filtrada | RF-001…RF-006, RF-017; RN-001, RN-004…RN-013, RN-018 |
| `s360ClientesRamos` | SQL | — | `RAMO` distintos do cadastro, sem Pessoa Física, mais `Sem ramo` | RN-013 |
| `s360ClienteFicha` | SQL | escopo + `clienteId` | 1 linha: Razão Social, Nome Fantasia, CNPJ, Segmento, Cidade, UF, Telefone, E-mail, Endereço — só se o cliente está na carteira exibida | RF-007, RN-014 |
| `s360CarteiraCurvaFixar` | SQL | `clienteId`, `curva` (`A`–`D`; vazio volta à automática) | linhas afetadas; só os vínculos do próprio usuário | RN-005 |
| `s360CarteiraRemover` | SQL | `clienteId` | linhas afetadas; `DELETE` só dos vínculos de `:VAR_USER` | RF-008, RN-015 |

Como `s360CarteiraCarregar` trabalha (uma chamada por carga, RNF-001/002):
1. 4 consultas por `runQueryMitra`, com `:VAR_USER` e os parâmetros já
   escapados no texto: (a) carteira visível + cadastro + ramo + curva manual;
   (b) vendas e devoluções por cliente pelo `vendaConta` (compras 90 dias,
   últimos 60 × 60 anteriores, mês corrente, mesmo intervalo do mês anterior,
   primeiro e último dia de compra, dias distintos com compra); (c) última
   visita **concluída** pelo dono e visitas concluídas em 60 dias; (d)
   clientes com alerta não lido do usuário, sem limite.
2. JavaScript (`lib/002-regras.mjs`): uma linha por cliente (RN-001), score e
   curva (RN-004/005), temperatura e classe (RN-007/008), queda (RN-012),
   pendência pela curva (RN-006), filtros, busca e relevância (RN-018),
   ordenação (RN-013), indicadores (RN-010) e página.
3. Ciclo médio = (último dia − primeiro dia) ÷ (dias com compra − 1), que é a
   média dos intervalos (RN-007), sobre todo o histórico no escopo.

### Disponíveis

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360DisponiveisListar` | JAVASCRIPT | `busca`, `pagina` | `{ ok, semEscopo, total, linhas[] }` — linha: cliente + `CODFILIAL`, `ID_SECAO`, `ESCOPO` ("Filial 1 · Nutrição · Suplementos"); sem curva | RF-009, RN-019, C-010 |
| `s360DisponivelAdicionar` | SQL | `clienteId`, `codFilial`, `idSecao` (vazio = todas), `agora` | linhas afetadas; `INSERT ... SELECT ... WHERE NOT EXISTS` numa instrução só | RF-009, C-008, C-009 |
| `s360DisponivelMotivo` | SQL | `clienteId`, `codFilial`, `idSecao` | 1 linha `MOTIVO`: `SEM_ESCOPO`, `NAO_ENCONTRADO`, `JA_NA_CARTEIRA`, `JA_TEM_RESPONSAVEL` | mensagens da RN-019 |

- Universo de cada escopo ativo do vendedor: todo cliente que não é Pessoa
  Física e não tem vínculo naquele escopo (mesma filial e seção, ou qualquer
  seção do departamento quando o escopo é "todas") de um vendedor com esse
  escopo ativo — a regra do antigo, que o usuário confirmou na spec.
- Sem busca: página por `ORDER BY` no SQL. Com busca: o SQL pré-filtra por
  pedaços exatos de cada palavra (uma palavra com até 2 letras erradas tem um
  dos 3 pedaços intacto), no máximo 2.000 candidatos, e o JavaScript aplica a
  RN-018 de verdade.
- Adicionar: 0 linhas → a tela chama `s360DisponivelMotivo` e mostra a mensagem;
  1 linha → sucesso e recálculo dos titulares do cliente.

### Titularidade (RN-002/003)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360TitularesLimpar` | SQL | `clienteId` (vazio = todos) | linhas afetadas: remove AUTO que deixou de ser candidato único e MANUAL cujo vendedor deixou de ser candidato | RN-003 |
| `s360TitularesInserir` | SQL | `clienteId`, `agora` | linhas afetadas: cria AUTO onde há um só candidato e nenhum titular | RN-003, C-014 |

- A tela chama as duas, nessa ordem, logo depois de adicionar ou remover
  (RN-003 "logo após"). As duas também são agendadas uma vez por dia
  (`cronExpression` 03:10 e 03:15, `clienteId` vazio).
- `DELETE ... WHERE ... NOT EXISTS` e `INSERT ... SELECT ... WHERE NOT EXISTS`
  no lugar do `DELETE T FROM ... JOIN` e do `INSERT IGNORE` do antigo: mesmo
  efeito e rodam no simulador.

### Histórico, relato e prospect

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360HistoricoLinhaTempo` | SQL | escopo + `clienteId`, `ramo`, `tipo` (`VISITA`, `ATIVIDADE`, `RELATO`, `MIX`, vazio), `de`, `ate`, `pagina` | 20 por página, mais recente primeiro, `TOTAL` em cada linha (`COUNT(*) OVER ()`): `TIPO`, `DATA`, `HORA`, `CLIENTE_ID`, `CLIENTE`, `TITULO`, `TEXTO` (relato completo), `PLANEJAMENTO`, `REF_ID`, `VALOR` | RF-010, RN-017 |
| `s360HistoricoPedidos` | SQL | escopo + `clienteId`, `ramo`, `de`, `ate`, `pagina` | 20 por página com `TOTAL`: `NUMPED`, `DATA`, `CLIENTE`, `ITENS`, `VALOR` | RN-017 |
| `s360HistoricoPedidoItens` | SQL | escopo + `clienteId`, `numped` | `PRODUTO`, `QUANTIDADE`, `PRECO_UNITARIO`, `DESCONTO_PERC`, `TOTAL` | RN-017 |
| `s360HistoricoMixItens` | SQL | escopo + `mixId` | `PRODUTO`, `QUANTIDADE`, `PRECO_VENDA`, `MARGEM_PERCENT`, `TOTAL` | RF-010 |
| `s360HistoricoVisitasSemana` | SQL | `hoje` | visitas do usuário de `hoje − 6` a `hoje`: `DATA`, `CLIENTE`, `RELATO_OK` | RN-017 (bloco da última semana) |
| `s360RelatoRegistrar` | SQL | `clienteId`, `data`, `hora`, `tipo`, `relato`, `hoje`, `agora` | linhas afetadas | RF-011, RN-016, C-016 |
| `s360ProspectCriar` | SQL | campos da RN-021, `agora` | linhas afetadas; `RESPONSAVEL_ID = :VAR_USER` | RF-012, RN-021, C-017 |
| `s360ProspectContatoCriar` | SQL | `razaoSocial`, `agora`, `contato`, `cargo`, `telefone`, `email` | linhas afetadas; acha o prospect recém-criado por `RESPONSAVEL_ID` + `CRIADO_EM` + razão social | RN-021 |

- Linha do tempo: visitas `CONCLUIDA` dos donos (inclusive do titular coberto,
  agenda passa ao substituto); atividades `CONCLUIDA` e mixes enviados só de
  donos que não são cobertura (RNT-010: atividades e mixes do titular não
  passam); relatos avulsos de clientes da carteira exibida. Mix salvo e não
  enviado não entra.
- Pedidos: linhas de venda pelo `vendaConta`, agrupadas por `NUMPED`.
  `DESCONTO_PERC = 0`: a fonte do ERP não tem desconto (o antigo também mostra
  0) — D-008.
- Relato: só para cliente da carteira de `:VAR_USER` ou de titular com férias
  ATIVAS em `hoje`; `data <= hoje`; `tipo` ∈ Ligação, WhatsApp, E-mail,
  Reunião on-line, Outro; `1 <= CHAR_LENGTH(relato) <= 4000`; `hora` vazia ou
  `HH:MM`. `CRIADO_EM` = `agora` com espaço (formato da tabela).

### Titulares de Clientes (tela)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360TitularesFiltros` | SQL | — | filiais e departamentos sob gestão (`CODFILIAL`, `FILIAL`, `CODEPTO`, `DEPTO`) | RN-020 |
| `s360TitularesTotais` | SQL | `filial`, `depto`, `busca` | `PENDENTES`, `CLIENTES_PENDENTES`, `COM_TITULAR` | RN-020 |
| `s360TitularesListar` | SQL | `situacao` (`PENDENTE` padrão, `MANUAL`, `AUTO`, `MISTO`, `SEM_TITULAR`, vazio), `filial`, `depto`, `busca`, `pagina` | 30 por página com `TOTAL`: cliente, filial, departamento, `ID_SECAO` (vazio = todas), `SECAO` ("Todas as seções (2)"), `CANDIDATOS` (`id:nome|...`), `TITULAR_ID`, `TITULAR`, `SITUACAO`, `VENDA_12M`; pendentes primeiro, depois maior venda | RF-014, RN-020 |
| `s360TitularDefinirAtualizar` | SQL | `clienteId`, `codFilial`, `codepto`, `idSecao`, `vendedorId`, `agora` | linhas afetadas (troca titular existente) | RF-013, C-013 |
| `s360TitularDefinirInserir` | SQL | idem | linhas afetadas (cria onde não havia) | RF-013, C-013 |

- Gestão: coordenador ativo nas BUs de `COORDENADORES_BU`; DIRETORIA/ADMIN em
  todas (`temPapel`), sem e-mail fixo (RNT-002).
- Fora de Enfermagem, uma linha por cliente × filial × departamento e o
  salvar grava todas as seções em que o vendedor é candidato; em Enfermagem,
  uma linha por seção e `idSecao` obrigatório.
- A tela soma as linhas afetadas das duas escritas; 0 →
  "Titular não salvo: …" (RNT-013).
- `VENDA_12M` = faturamento líquido dos últimos 12 meses da combinação
  (RNT-008), só para ordenar e mostrar.

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/clientes` | abas `MINHA CARTEIRA (n)`, `CLIENTES DISPONÍVEIS`, `HISTÓRICO DO CLIENTE`, `PROSPECTS`, nessa ordem; `?clienteId=` abre o Histórico | `ClientesPage` (`pages/ClientesPage.tsx`) |
| `/clientes/:clienteId` | a mesma tela, aba carteira com a busca preenchida | `ClienteBuscaPage` (reexporta a tela com `.rota` própria) |
| Minha Carteira | filtro de escopo, 5 cards, gráfico por ramo, `Legenda`, busca/ramo/status/ordem/`Limpar filtros`, lista com curva (lápis), nome + código, sino, `Queda`, ramo, dias sem visita, última compra, temperatura (detalhe com recomendação), status, ações (ficha, histórico, remover com confirmação), `+ Novo cliente prospecto`, `Registrar contato` | `pages/clientes/AbaCarteira.tsx`, `DetalheTemperatura`, `FichaCliente`, `NovoProspect`, `RegistrarRelato` |
| Clientes Disponíveis | busca, lista com o escopo da linha, `Adicionar` | `pages/clientes/AbaDisponiveis.tsx` |
| Histórico do Cliente | seletor de cliente (busca inteligente pela carteira), filtros ramo/tipo/De/Até, linha do tempo e pedidos com paginação própria, detalhes de visita, pedido e mix, bloco da última semana | `pages/clientes/AbaHistorico.tsx` |
| Prospects | espaço reservado: a lista é da spec 008 | `pages/clientes/AbaProspects.tsx` |
| `/gestao-titulares` | explicação da regra de Enfermagem, cards Pendentes/Com titular, filtros Situação/Filial/Departamento/busca, lista de 30, escolher titular e `Salvar` | `GestaoTitularesPage` |
| filtro de escopo (topo das telas) | modos e cascata da RNT-003, lembrado entre telas até sair | `components/FiltroEscopo.tsx` |

Regra pura em `novo/frontend/src/lib/` (o que os testes importam):

| Arquivo | Funções |
|---|---|
| `escopo.ts` | `opcoesEscopo(linhas, sessao)`, `escopoPadrao(sessao, opcoes)`, `trocar(escopo, campo, valor)` (cascata), `mostraFiltro(sessao, opcoes)`, `paraInput(escopo, hoje)`, `lembrar`/`recuperar` (`sessionStorage`) |
| `carteira.ts` | `ABAS`, `abaInicial(params, search)` (RF-015), `recomendacao(temperatura)` (RN-009), `alertaDias(tipo, dias)` (RN-011), `rotuloStatus`, `rotuloClasse`, `ORDENS`, `estadoInicial`, `aoMudarFiltro` (volta à página 1), `mensagemMotivo(motivo)` (RN-019), `validarRelato` (RN-016), `validarProspect` (RN-021), `CAMPOS_FICHA` (RN-014), `LEGENDA` (RF-016) |
| `titulares.ts` | `rotuloSituacao`, `candidatos(texto)`, `trocarFiltro(filtros, campo, valor)` (filial limpa departamento), `mensagemTitular(linha, nome, afetadas)` |

## Fluxo

1. **Abertura de `/clientes`:** `s360EscopoOpcoes` e `s360ClientesRamos` (uma
   vez por tela) e `s360CarteiraCarregar`: 3 chamadas (RNFT-002). O escopo vem
   de `recuperar()` ou de `escopoPadrao` (Meu painel / Time inteiro / Todos os
   coordenadores).
2. **Filtro, busca, ordem, página:** só `s360CarteiraCarregar` de novo; a busca
   espera 400 ms parada; trocar filtro ou ordem volta à página 1 (RN-013).
3. **Lápis da curva:** `s360CarteiraCurvaFixar`; 1 linha → recarrega; 0 →
   "nada foi alterado". **Remover:** confirmação → `s360CarteiraRemover` →
   `s360TitularesLimpar` → `s360TitularesInserir` → recarrega.
4. **Disponíveis:** `s360DisponiveisListar`; `Adicionar` →
   `s360DisponivelAdicionar`; 1 linha → mensagem de sucesso, recálculo dos
   titulares do cliente, lista e contador da carteira recarregados; 0 linhas →
   `s360DisponivelMotivo` → mensagem da RN-019 (falha da chamada → tenta o
   motivo uma vez: cobre a corrida que o MySQL resolve abortando uma das duas).
5. **Histórico:** seletor = `s360CarteiraCarregar` com a busca e 10 por
   página; linha do tempo e pedidos em paralelo (`Promise.allSettled`), cada um
   com a sua página; detalhe de pedido e de mix sob demanda.
6. **Relato e prospect:** validação na tela (mesmas regras do servidor) →
   SF; 0 linhas → mensagem de falha da RN-016 / RN-021. Prospect com contato →
   `s360ProspectContatoCriar` depois do `s360ProspectCriar`.
7. **Titulares:** `s360TitularesFiltros` + `s360TitularesTotais` +
   `s360TitularesListar`; `Salvar` → as duas escritas → mensagem → recarga de
   lista e totais.

## Simulador

- `schema-producao/002-carteira.mjs`: DDL **inteiro** de `modelo-de-dados.md`
  para `VISITAS`, `RELATOS_CLIENTE`, `CLIENTE_TITULAR_DEPTO`,
  `COORDENADORES_BU`, `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS`, `PRODUTOS_CUSTOS`,
  `PROSPECTS`, `PROSPECT_CONTATOS`; e as `IMP_*` (sem DDL, L-01) com as
  colunas que as SFs usam, marcadas "confirmar no sandbox". Se outra spec
  declarar a mesma tabela, o texto é igual e uma cópia sai no merge.
- `simulator/seeds/002-carteira.mjs` (hoje = 30/10/2026, ids 2001+):

  | Quem / o quê | Para |
  |---|---|
  | Ana: escopos extra F1·Nutrição·Dietas enterais (101) e ·Suplementos (102); 40 clientes, 32 `ATIVO`, líquido de outubro = R$ 120.000 (bruto − devoluções) | C-001, C-008 |
  | Bruno: escopo extra F1·Nutrição·101; 35 clientes | C-012, C-013 |
  | Carlos Teixeira (`ctx.usuario`): COORDENADOR, `COORDENADORES` 2001 com BU F1·Nutrição | C-013, RN-020 |
  | X (curva manual A, visita há 9 dias), Y (B, 10 dias), Z (C, nunca) | C-002 |
  | W (compras em −20, −40, −60, −80, −100, −120 dias; 11.500 × 10.000; visita há 45 dias) | C-003 |
  | V (sem compra, sem visita) | C-004 |
  | K (R$ 24.000 em 90 dias, 3 visitas em 60 dias, compra e visita há 10 dias) | C-005 |
  | HOSPITAL SÃO LUCAS LTDA, CNPJ 12.345.678/0001-90, código **2471** (faixa da spec; a spec cita 4471) | C-007 |
  | Q pessoa jurídica sem dono; um cliente Pessoa Física sem dono | C-008, RN-019 |
  | H na carteira de Ana e Bruno (Pendente); J só de Ana | C-013, C-014 |
  | X também na carteira de Bruno (F1·Medicamento) | C-011 |
  | X: 3 visitas concluídas, 2 atividades concluídas, 1 relato, 30 pedidos no escopo, 4 em F2, 1 mix enviado e 1 só salvo | C-015 |
  | Z fora de toda carteira | C-016 |
  | prospects de Ana | tela |

  Dados que só um teste precisa (250 alertas, 25 pedidos em outubro, seções
  de Enfermagem) entram no próprio teste, no banco descartável.
- `CHECK_INPUT`: não muda; todo parâmetro numérico é texto (`num()`), então o
  `sim:check` roda as SFs SQL com os valores vazios sem erro.
- **Dialeto:** precisa existir no SQLite tudo o que as SFs usam: CTE, `COUNT(*)
  OVER ()`, `ROW_NUMBER()`, `GROUP_CONCAT(x SEPARATOR '|')` sobre subconsulta
  `DISTINCT`, `CAST(... AS UNSIGNED)`, `DATEDIFF`. Nenhum shim novo previsto;
  se aparecer, entra em `mysql-dialect.mjs` com teste próprio e é citado no
  relatório.

## Testes

Backend em `novo/backend/simulator/smoke/002-carteira.mjs` (banco descartável
próprio, hoje = `2026-10-30` salvo indicação); tela em
`novo/frontend/tests/{carteira,escopo,titulares}.test.mjs`. O título de cada
teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-010 | smoke | Ana, `ME`: `total` 40, `ativos` 32, `receita` 120000, `ticket` 3750; com todos os clientes inativados no banco do teste → `ticket` nulo (a tela mostra "—") |
| C-002 / RN-006 | smoke | `pendentes = 1` lista X e Z, não Y, X com `LIMITE_CURVA = 8`; D há 61 dias não, 62 sim; visita de Bruno ontem em X não tira X dos pendentes de Ana |
| C-003 / RN-007 | smoke | W: `TEMPERATURA` 30 + 25 + 25 + 12 = 92, `Quente` |
| C-004 / RN-007 | smoke | V: tendência 0, total 0, `Frio`; `DIAS_SEM_VISITA` e `DIAS_ULTIMA_COMPRA` nulos |
| RN-007 (bordas) | smoke (funções de `002-regras.mjs`) | +10% → 15; +10,01% → 25; −30% → 5; −30,01% → 0; anterior 0 e atual 500 → 25; visita `AGENDADA` há 5 dias não conta (pela SF) |
| C-005 / RN-004 / RN-005 | smoke | K: score 76,0, curva B; função: 30.000/5/5/5 → 100, A; nada → 4,0, C; Ana fixa D → K é D para Ana e para Carlos em `TEAM` |
| RN-008 | smoke (funções) | 70 Quente, 69 Morno, 40 Morno, 39 Frio; média {92, 36} = 64 Morno |
| RN-009 | `tests/carteira.test.mjs` | {30, 25, 5, 20} → texto de Tendência; Recência e Visitas zeradas → texto de Recência |
| C-006 / RN-013 | smoke + `tests/carteira.test.mjs` | SF: `NOME_AZ` página 1 = os 10 primeiros nomes em ordem entre todos; tela: `aoMudarFiltro({pagina: 2})` → página 1 |
| C-007 / RN-018 | smoke | "hospitl sao lucas", "12345678000190", "cod 2471" → HOSPITAL SÃO LUCAS em 1º; "lukas" casa LUCAS; "hsp" não casa HOSPITAL |
| RN-011 | `tests/carteira.test.mjs` | `alertaDias('visita', 31)` vermelho, 30 normal; `('compra', 26)` vermelho; `rotuloStatus('INATIVO')` = `Inativo` |
| RN-012 | smoke + funções | anterior 10.000 × atual 6.900 → `QUEDA`; 7.000 (30,0%) → `QUEDA`; 7.100 → não; anterior 0 → não; 7.500 (25,0%) → não; 250 alertas não lidos no teste → `ALERTA` em todos os clientes com alerta |
| C-008 / RN-019 | smoke | Ana: Q aparece em 101 e 102 com o escopo na linha; adicionar em 101 → 1 linha; carteira 41; Q fora dos disponíveis de 101 e ainda em 102 |
| C-009 | smoke | Bruno adiciona Q em 101 depois de Ana → 0 linhas, motivo `JA_TEM_RESPONSAVEL`; 1 vínculo de Q em 101 |
| C-010 | smoke | Diego → `semEscopo` e 0 linhas; motivo `SEM_ESCOPO` |
| RN-019 (PF) | smoke | cliente Pessoa Física nunca listado; adicionar por id → 0 linhas, motivo `NAO_ENCONTRADO` |
| C-011 / RN-015 | smoke | Ana remove X → vínculo de Ana apagado, o de Bruno fica; Bruno (substituto em 05/11) remove cliente de Ana → 0 |
| C-012 / RN-001 | smoke | Bruno em 05/11: 75 clientes, 40 com `COBERTURA`; em 16/11: 35; sem férias cadastradas (desativadas no teste) → 35 |
| C-013 / RN-002 | smoke | H pendente: Ana e Bruno veem; Carlos define Ana → Bruno com recorte seção 101 não vê H; venda de H R$ 1.000 em outubro na seção 101 → receita de Ana inclui, de Bruno não; `vendaDoVendedor` dá Ana 1.000, Bruno 0 |
| C-014 / RN-003 | smoke | J: recálculo → AUTO de Ana; Bruno adiciona J → recálculo remove o AUTO, Pendente; titular MANUAL válido não muda |
| RN-002 (bloqueio) | smoke | Ana bloqueada no teste → H volta para Bruno; Ana não aparece em `CANDIDATOS` |
| RN-020 | smoke | Nutrição com 101 e 102 → 1 linha "Todas as seções (2)"; Enfermagem com 2 seções (inseridas no teste) → 2 linhas; Carlos define titular em F2 → 0 nas duas escritas |
| C-015 / RN-017 | smoke | X sem filtro: linha do tempo `TOTAL` 7 (3 visitas, 2 atividades, 1 relato, 1 mix enviado); pedidos `TOTAL` 30, página 1 com 20 e 2 com 10; os 4 de F2 não aparecem; mix só salvo fora |
| RN-017 (filtros) | smoke | 25 pedidos em outubro e 20 em setembro (inseridos no teste) → sem filtro 3 páginas; `de`/`ate` 01/10–31/10 → `TOTAL` 25, páginas de 20 e 5 |
| C-016 / RN-016 | smoke + `tests/carteira.test.mjs` | SF: Z → 0; data amanhã → 0; 4.001 caracteres → 0; válido → 1; tela: `validarRelato` com as mesmas recusas |
| RN-014 | smoke + `tests/carteira.test.mjs` | SF: ficha de X para Ana, Bruno (substituto) e Carlos; `TELEFONE` trocado no banco para (81) 3333-0000 aparece na ficha; Z (fora da carteira) → 0 linhas. Tela: `CAMPOS_FICHA` são os 9 campos, todos só leitura |
| C-017 / RN-021 | smoke + `tests/carteira.test.mjs` | SF: razão social vazia → 0; probabilidade vazia → 10; `RESPONSAVEL_ID` = Ana mesmo com `responsavelId` de outro no input; prospect não entra na carteira. Tela: `validarProspect` → `Informe a razão social ou nome do cliente prospecto.` |
| RF-015 | `tests/carteira.test.mjs` | `abaInicial({clienteId: '1234'}, '')` → carteira com busca `1234`; `abaInicial({}, '?clienteId=1234')` → histórico com 1234 |
| RF-018 | `tests/carteira.test.mjs` | `ABAS` = MINHA CARTEIRA, CLIENTES DISPONÍVEIS, HISTÓRICO DO CLIENTE, PROSPECTS. O prospect na aba é da spec 008 (teste fica lá) |
| RNT-003 (cascata) | `tests/escopo.test.mjs` | trocar coordenador zera vendedor, filial, departamento e seção; trocar filial zera departamento e seção; vendedores recortados pelo coordenador; padrão Meu painel / Time inteiro / Todos os coordenadores; vendedor com um escopo não vê o filtro |
| RNT-003 (servidor) | smoke | Ana pedindo `TEAM` ou `ALL` → 0 clientes; Carlos `TEAM` vê Ana e Bruno |
| RN-020 (tela) | `tests/titulares.test.mjs` | trocar filial limpa departamento; `candidatos('2:Ana Souza|3:Bruno Lima')`; mensagem de sucesso e de "Titular não salvo" |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | Carteira e Disponíveis em SF JAVASCRIPT que lê por `runQueryMitra` e calcula em JS; escritas em SF SQL | tudo em SQL | a busca da RN-018 (1–2 letras erradas) não existe em MySQL sem função própria, e a função seria estrutura nova; em JS a regra inteira roda uma vez por carga (RNF-002) e é testável. Leitura por `runQueryMitra` com `:VAR_USER` é o padrão do p-57803; T-001 confirma no sandbox |
| D-002 | Fragmentos SQL com parâmetros como **expressão** (`escopoAlvo({ modo: "'{{modo}}'" })`) | um fragmento para SF SQL e outro para JS | um texto só para as duas formas e para as specs seguintes |
| D-003 | Métricas de uma linha de carteira usam o escopo do **dono** daquela linha (cobertura = escopo do titular) | escopo do substituto | é a temperatura do cliente dentro da carteira herdada; a atribuição de venda ao substituto pela data (RNT-007) fica em `vendaDoVendedor`, para as telas de venda |
| D-004 | Vínculo × todos os escopos ativos do dono (como o antigo); `EQUIPE_CLIENTE.CODFILIAL/ID_SECAO` só decide Disponíveis e "responsável no escopo" | casar vínculo com escopo pela filial/seção do vínculo | é o dado de produção; mudar faria clientes sumirem da carteira de hoje |
| D-005 | Escopo com seção vazia nunca gera titular (como o antigo); vendas da seção titulada por outro não contam para o dono mesmo assim | titular por departamento inteiro | candidato exige seção (spec, entidade "Candidato") |
| D-006 | Paginação e total na mesma consulta (`ROW_NUMBER`/`COUNT(*) OVER ()`, página como texto) | `LIMIT {{x}}` + SF `…Total` | menos chamadas e nenhum parâmetro numérico vazio quebrando o `sim:check` (e o `CHECK_INPUT` compartilhado não muda) |
| D-007 | Recálculo de titulares em duas SFs chamadas pela tela depois de cada mudança e agendadas 1×/dia | gatilho no banco; recálculo só noturno | RN-003 "logo após"; gatilho seria estrutura nova |
| D-008 | Desconto do pedido = 0,0% | calcular desconto | a fonte do ERP não traz desconto; o antigo já mostra 0 |
| D-009 | Código do cliente da C-007 = 2471 | 4471 | faixa de ids da spec (`novo/CLAUDE.md`); o teste prova o mesmo |
| D-010 | Filtro de escopo como componente + `lib/escopo.ts` desta spec, lembrado em `sessionStorage` | um por tela | RNT-003 é igual em todas as telas; as próximas specs só importam |
| D-011 | Ordem `Dias sem visita` = mais dias primeiro, nunca visitado no topo | menos dias primeiro | a lista é de prioridade |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `:VAR_USER` dentro de `runQueryMitra` numa SF JAVASCRIPT | carteira vazia ou de outra pessoa | T-001 confirma no sandbox com um usuário business antes de liberar; se não substituir, a SF JS chama uma SF SQL por id (padrão `__IDS__`) |
| Colunas e tipos das `IMP_*` (L-01) e valores de `CLIENTES.STATUS` | SF falha na publicação ou card errado | T-001 lê com `listTablesMitra` e uma amostra; corrige `schema-producao/002-carteira.mjs` e o plan |
| Volume: `cod()` nas junções impede índice; carteira de 5.000 clientes no modo Time inteiro | passar de 2 s (RNF-001) | T-104 mede no sandbox; saída: pré-filtrar vendas por `CODCLI IN (carteira)` e janela de datas antes do `cod()` |
| Duas adições simultâneas no MySQL | uma aborta com erro em vez de 0 linhas | a tela pede o motivo depois da falha (fluxo 4) |
| Cron do antigo (391/392) e do novo recalculando a mesma tabela | trabalho repetido | mesma regra dos dois lados (exceto o e-mail institucional, que sai, RNT-002); o do antigo é aposentado na troca |
| Outra spec declarar a mesma tabela em `schema-producao/` | merge com DDL repetido | DDL copiado inteiro do contrato; nota na pasta compartilhada das sessões |

## Complexity Tracking

| Violação | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| Regra de negócio em SF JAVASCRIPT (não SQL puro) | RN-018 | SQL com `LIKE`: não tolera letra errada |
