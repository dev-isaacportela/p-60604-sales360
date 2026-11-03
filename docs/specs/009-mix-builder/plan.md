# Plan: Mix Builder — propostas com custo real

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Constrói a tela `/simulacao` sobre o esqueleto da 001 (`novo/`). Nenhuma
tabela nova: lê o catálogo e os custos que as rotinas atuais mantêm e grava em
`PRODUCT_MIX`/`PRODUCT_MIX_ITEMS`, as mesmas do sistema antigo.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` com zero pendências (decisões de 2026-10-30) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-009-mix.mjs` só roda no sandbox, depois `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | sem DDL; as 10 SFs novas viram migration gerada pelo sistema |
| Leitura e escrita por Server Function | sim | 10 SFs SQL `s360Mix*`; nenhuma leitura direta de tabela (RNFT-005) |
| Simulador cobre a feature | sim | `schema-producao/009-mix.mjs`, `seeds/009-mix.mjs`, `smoke/009-mix.mjs`; três traduções novas no dialeto (D-904) |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira um `teste()` no smoke ou um `test()` em `tests/mix.test.mjs` (mapa abaixo) |
| Design tokens, sem cor literal | sim | só primitivos e vocabulário de `components/page.tsx` e `ui/`; a proposta impressa usa a mesma paleta em CSS próprio da janela de impressão, com as cores lidas dos tokens (RNFT-004) |
| Simplicidade | sim | uma tela, um arquivo de regra pura; rotinas de custos, catálogo e fotos continuam as do antigo (D-903) |

## Contexto técnico

- **Frontend:** o da 001 (React 19, Vite 8, Tailwind 4, design system Benenutri). Sem dependência nova: PDF = HTML numa janela + impressão do navegador; planilha = CSV montado à mão (RN-015).
- **Backend:** SFs SQL `s360Mix*` em `novo/backend/add-009-mix.mjs`, com `SEM_BLOQUEIO` de `lib/guardas.mjs` e o fragmento de carteira de `lib/009-carteira.mjs`.
- **Reuso identificado:**
  - `lib/guardas.mjs` (`SEM_BLOQUEIO`), `lib/mitra-api.ts` (`linhas`, `linhasAfetadas`), `lib/formato.ts` (`moeda`, `fmtData`, `hojeBrasilia`, `agoraBrasilia`);
  - do antigo, **reescrito**: o casamento de política por cliente de `fix-mix-custos-e-carteira.mjs` (cliente pelo `ID` ou pelo `WINTHOR_CODCLI`), o JSON de itens com `JSON_TABLE` de `add-mix-escrita-sfs.mjs` (prova que a plataforma aceita SF com várias instruções e `JSON_TABLE`), os valores de `TIPO_CUSTO` (`PADRAO`, `ESPECIAL`, `SEM_CUSTO`) e o rótulo de categoria "Depto X / Seção Y";
  - rotinas atuais de custos (251, a cada 30 min), catálogo (268, semanal) e fotos (398, diária): **continuam no ar sem mudança** e alimentam as tabelas que a 009 lê (D-903).
- **Carteira (RNT-007/010):** `lib/009-carteira.mjs` até a spec 002 publicar `lib/002-carteira.mjs` (comentário `ponytail:` no arquivo).
- **Dependência nova:** nenhuma.

## Modelo de dados

Nenhum acréscimo. Tabelas declaradas em `schema-producao/009-mix.mjs` (copiadas de `modelo-de-dados.md`):

| Entidade (spec) | Tabela | Campos-chave | Uso |
|---|---|---|---|
| Mix | `PRODUCT_MIX` | `ID`, `NOME`, `DESCRICAO`, `ID_CLIENTE`, `ID_USUARIO_CRIACAO`, `TOTAL_CUSTO`, `TOTAL_VENDA`, `MARGEM_MEDIA`, `DT_CRIACAO`, `ENVIADO_HISTORICO`, `DT_ENVIO_HISTORICO` | lê e grava |
| Item do mix | `PRODUCT_MIX_ITEMS` | `ID_MIX`, `ID_PRODUTO` (= `CODPROD`), `QUANTIDADE`, `TIPO_CUSTO`, `CUSTO_UNITARIO`, `MARGEM_PERCENT`, `PRECO_VENDA`, `PRECO_CONCORRENTE`, `CMV_PERCENT` (= CMV do concorrente) | lê e grava |
| Produto do catálogo | `PRODUTOS_CUSTOS` | `CODPROD`, `CODFAB`, `CODAUXILIAR`, `NOME`, `DEPARTAMENTO_ID`, `SECAO_ID`, `ATIVO` | só leitura |
| Custo padrão | `CUSTO_PADRAO_PRODUTO` | `CODPROD`, `CUSTO`, `DATA_REF` | só leitura |
| Política de custo especial | `CUSTO_ESPECIAL_PRODUTO` + `CUSTO_ESPECIAL_CLIENTES_BIG` | `ITEM_ID`, `CODPROD`, `CLIENTE_ID`, `CUSTO`, `POLITICA_ID`, `POLITICA_NOME`, `STATUS` (`ACTIVE`), `DATA_INICIO`/`DATA_FIM`; vínculo `(CUSTO_ESPECIAL_ID, CLIENTE_ID)` | só leitura |
| Atualização de custos | `MIX_CUSTOS_SYNC` | `CHAVE = 'LAST_SUCCESS_AT'`, `VALOR` (UTC, `AAAA-MM-DDTHH:MM:SS`) | só leitura |
| Foto | `MIX_PRODUTO_FOTO` | `CODPROD`, `URL` | só leitura |
| Cliente / carteira | `CLIENTES`, `EQUIPE_CLIENTE` (000-base), `VENDEDOR_RCA`, `FERIAS_VENDEDOR` (001) | — | só leitura; não redeclaradas |

Não lidas: `CUSTO_ESPECIAL_CLIENTES` (legada), `MIX_FOTOS_CONFIG` (só a rotina de fotos lê a chave, RN-017), `PRODUTOS`, `SIMULACOES`, `CUSTOPRODUTO` e afins. Item antigo cujo `ID_PRODUTO` não existe em `PRODUTOS_CUSTOS` aparece como "Produto {id}".

## Contratos de backend

Arquivo `novo/backend/add-009-mix.mjs`. Todas SQL, com `:VAR_USER` e `SEM_BLOQUEIO`. Datas vêm da tela (D-007 da 001): `hoje` (`AAAA-MM-DD`) e `agora` (`AAAA-MM-DDTHH:MM:SS`, Brasília). "Carteira" = `clienteNaCarteira(...)` (RNT-007/010).

| Nome | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|
| `s360MixClientesBuscar` | `busca`, `buscaDigitos`, `hoje` | até 20: `ID`, `CODIGO` (`WINTHOR_CODCLI` ou `ID`), `NOME` (fantasia ou razão) — só carteira | RF-002, RNT-014 |
| `s360MixCatalogoBuscar` | `busca` | até 8 produtos ativos: `CODPROD`, `NOME`, `CODFAB`, `CATEGORIA`, `FOTO_URL` (só `https://`, senão vazio) | RF-003, RF-018, RN-014, RN-017 |
| `s360MixCustosOpcoes` | `clienteId`, `produtos` (`"9714,9715"`), `hoje` | por produto: `CODPROD`, `TIPO_CUSTO` (`PADRAO`/`ESPECIAL`), `CUSTO`, `POLITICA_ID`, `POLITICA_NOME`; padrão só se `> 0`; especial pela RN-008; ordem `CODPROD`, tipo, `CUSTO`. Cliente fora da carteira → 0 linhas | RF-004, RF-005, RF-006, RN-007, RN-008, RN-012 |
| `s360MixCustosStatus` | — | 1 linha: `ULTIMA_ATUALIZACAO` (UTC) | RF-017, RN-014 |
| `s360MixListar` | `offset`, `hoje` | 20 mixes do usuário, mais recente primeiro: `ID`, `NOME`, `DESCRICAO`, `CLIENTE_ID`, `CLIENTE` ("código - nome"), `DT_CRIACAO`, `TOTAL_CUSTO`, `TOTAL_VENDA`, `MARGEM_MEDIA`, `ENVIADO_HISTORICO`, `DT_ENVIO_HISTORICO`, `NA_CARTEIRA` (0/1), `TOTAL` (`COUNT(*) OVER ()`) | RF-011, RN-011, RNFT-001, C-017 |
| `s360MixItens` | `mixId` | itens do mix do usuário: `ID_PRODUTO`, `NOME`, `CATEGORIA`, `FOTO_URL`, `QUANTIDADE`, `TIPO_CUSTO`, `CUSTO_UNITARIO`, `MARGEM_PERCENT`, `PRECO_VENDA`, `PRECO_CONCORRENTE`; mix de outro → 0 linhas | RF-011, RN-011 |
| `s360MixCriar` | `nome`, `descricao`, `clienteId`, `itens` (JSON), `agora`, `hoje` | `affectedRows` (0 = recusado) | RF-010, RF-012, RN-011, RN-012, RN-013 |
| `s360MixAtualizar` | `mixId` + os de criar | `affectedRows` | RF-010, RN-011, RN-012, RN-013 |
| `s360MixExcluir` | `mixId` | `affectedRows` | RF-013, RN-011 |
| `s360MixEnviarHistorico` | `mixId`, `agora` | `affectedRows` | RF-014, RN-016 |

Regras de contrato:
- **Itens (D-901):** `itens` = JSON `[{"p":9714,"q":10,"t":"PADRAO","c":70,"m":30,"v":100,"k":0}]` (produto, quantidade, tipo, custo, margem, preço, preço do concorrente). Lido com `JSON_TABLE` (a quantidade como `DECIMAL`, para recusar 1,5).
- **Validação no servidor (RN-012, RN-013), fragmento `ITENS_VALIDOS`:** nome não vazio e ≤ 220; ≥ 1 item; produto sem repetição (`COUNT(DISTINCT p) = COUNT(*)`); quantidade inteira ≥ 1 (`CAST(q AS SIGNED) = q`); custo e preço ≥ 0; tipo em (`PADRAO`, `ESPECIAL`, `SEM_CUSTO`); cliente na carteira; sem bloqueio.
- **Totais (RN-013):** o servidor calcula a partir do JSON: custo = Σ q×c, venda = Σ q×v, margem média = (venda − custo) ÷ venda × 100 (0 se venda = 0), `CMV_PERCENT` = c ÷ k × 100 (nulo se k = 0). Os totais da tela nunca são enviados.
- **Tudo ou nada (D-902):** `s360MixCriar` são duas instruções na mesma SF, como o `mixCriar` atual: (1) `INSERT INTO PRODUCT_MIX ... SELECT ... WHERE <ITENS_VALIDOS>` e (2) `INSERT INTO PRODUCT_MIX_ITEMS ... SELECT ... FROM JSON_TABLE(...) WHERE` o mix `LAST_INSERT_ID()` é do usuário, tem `DT_CRIACAO = '{{agora}}'` e ainda não tem itens. Toda a validação está na (1): item inválido → cabeçalho não entra → a (2) não acha mix → nada gravado. `s360MixAtualizar`: `UPDATE` do cabeçalho, `DELETE` e `INSERT` dos itens, cada um com dono + `ITENS_VALIDOS`, então dado inválido não muda nada. `s360MixExcluir`: itens e cabeçalho, ambos filtrados pelo dono.
- **Dono (RN-011, RNT-012):** toda leitura e escrita de mix filtra `ID_USUARIO_CRIACAO = :VAR_USER`. O substituto não vê os mixes da titular; usa os clientes herdados para criar os próprios.
- **Política vigente (RN-008):** `STATUS = 'ACTIVE' AND DATA_INICIO <= '{{hoje}}' AND DATA_FIM >= '{{hoje}}'` e (cliente da política ∈ {`ID`, `WINTHOR_CODCLI`} do cliente) ou (cliente vinculado em `_BIG`) ou (sem cliente e sem nenhum vínculo).
- **Busca sem acento (RNT-014, D-905):** `CONVERT(col USING utf8mb4) COLLATE utf8mb4_0900_ai_ci LIKE CONCAT('%', '{{busca}}', '%')`; CNPJ comparado sem pontuação com `buscaDigitos` (só dígitos, calculado pela tela; vazio desliga).
- **Datas gravadas:** `DT_CRIACAO` e `DT_ENVIO_HISTORICO` = `agora` (Brasília, com `T`).
- **Perfil:** `add-000-perfil-acesso.mjs` já pega `s360*` pelo prefixo. `PRODUCT_MIX`/`_ITEMS` já são escritas pelo antigo com o mesmo perfil; T-901 confirma.

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/simulacao` aba `Construtor` | cliente (busca no servidor), nome, descrição, alternador `Custo padrão`/`Custo especial`, catálogo com foto, tabela de itens (cartões no celular), comparativo, filtro/ordenação acima de 5 itens, rodapé de totais, aviso de custos, `Salvar Mix` com motivo do bloqueio, `Exportar`, `Imprimir/PDF`, "Editando Mix #ID" com X | `page.tsx`, `ui/` (tabs, table, popover, command, dialog, input, badge, alert) | `SimulacaoPage` |
| `/simulacao` aba `Meus Mix` | lista paginada com total, situação de envio e ações; visualização; confirmação de exclusão | idem | idem |
| janela de impressão | proposta para o cliente (RN-015) | — | HTML gerado por `lib/mix.ts` |

Regra pura em `novo/frontend/src/lib/mix.ts` (é o que os testes importam):

| Função | Regra |
|---|---|
| `precoPelaMargem(custo, margem)`, `margemPeloPreco(custo, preco)`, `limitarMargem(m)` | RN-001, RN-003 |
| `itemNovo(produto, opcoes, preferencia)` | RN-002, RN-008 (escolha), RN-009 |
| `trocarCusto(item, opcao)` | RN-004 |
| `calcularItem(item)`, `totais(itens)`, `faixaMargem(m)`, `faixaCmvConcorrente(cmv)` | RN-005, RN-006 |
| `aplicarTrocaCliente(itens, opcoesNovoCliente)` → `{ itens, trocados, mensagem }` | RN-010 |
| `motivoBloqueioSalvar(estado)` | C-008, C-017 |
| `payloadItens(itens)` | contrato `itens` |
| `duplicar(mix, itens)` | RF-012 |
| `idadeCustos(ultimaUtc, agora)` → texto e aviso | RN-014 |
| `fotoSegura(url)` | RN-017 |
| `csvMix(mix, itens)`, `nomeArquivo(nome)` | RN-015 (planilha) |
| `htmlProposta(mix, itens, logo)` | RN-015 (PDF) |
| `abrirProposta(abrirJanela, html)` | C-014 |
| `pct(n)`, `lerValor(texto)` | RNT-011 (percentual com 1 casa; `1.500,50` e `1500.50`) |

## Fluxo

1. **Abertura:** `s360MixCustosStatus` e `s360MixListar({ offset: 0, hoje })` em paralelo (`Promise.allSettled`): 2 consultas (RNFT-002).
2. **Cliente:** busca com espera de 250 ms → `s360MixClientesBuscar`. Escolher cliente libera o catálogo. Trocar com itens no mix → `s360MixCustosOpcoes` com todos os produtos do mix → `aplicarTrocaCliente` → toast com o número de itens trocados (RN-010).
3. **Catálogo:** busca com espera de 250 ms (RNF-003) → `s360MixCatalogoBuscar`. Incluir → `s360MixCustosOpcoes` do produto → `itemNovo`. Repetido → "Este produto já está no mix."; sem opção → aviso de custo zero (C-005).
4. **Edição do item:** `Qtd`, `Margem %`, preço e menu de custo (opções guardadas por produto na memória da tela, sem nova consulta). Tudo recalcula na hora.
5. **Salvar:** `motivoBloqueioSalvar` decide o botão e o texto do motivo. `s360MixCriar` ou `s360MixAtualizar` com `payloadItens`; `affectedRows > 0` → toast, Construtor limpo, lista recarregada; 0 → "Não foi possível salvar o mix. Confira o cliente e os itens." (RNT-013). Cliente fora da carteira → "Este cliente não está na sua carteira." (C-018), quando a lista já marca `NA_CARTEIRA = 0` ou o servidor recusa.
6. **Meus Mix:** paginação de 20 com "Exibindo 1-20 de 23". `Visualizar`/`Editar Mix`/`Duplicar Mix`/`Imprimir/PDF` carregam `s360MixItens`; editar e duplicar também pedem `s360MixCustosOpcoes` para remontar o menu de custo. Mix com `NA_CARTEIRA = 0` abre com o aviso da C-017 e salvar bloqueado. Duplicar abre "{nome} - Cópia" sem id. Excluir com confirmação. Enviar → `s360MixEnviarHistorico({ mixId, agora })`.
7. **PDF:** `abrirProposta(window.open, htmlProposta(...))`; janela nula → mensagem de pop-up, nada gravado. A janela espera as fotos por até 8 s e chama `print()` (RNF-002).
8. **CSV:** `csvMix` com BOM UTF-8, `;` e vírgula decimal; download por `Blob` + `<a download>`.

## Simulador

- **`schema-producao/009-mix.mjs`:** as 8 tabelas do Modelo de dados.
- **`seeds/009-mix.mjs`** (ids 9001+; os cenários da spec usam códigos de exemplo, aqui trocados):

  | Spec | Seed | Para |
  |---|---|---|
  | cliente 1520 "Mercado Bom" | 9001, na carteira de Ana | C-001, C-003, C-006 |
  | cliente 1777 | 9002, na carteira de Ana, sem direito à "Rede Sul" | C-003, C-006 |
  | cliente 1777 de C-018 | 9005, carteira de ninguém | C-018 |
  | cliente 1600 | 9003, na carteira de Ana (o smoke tira) | C-017 |
  | — | 9004, carteira de Bruno | C-010 |
  | carteira de 800 | 9101–9900 na carteira de Ana | RF-002 |
  | produto 714 | 9714: padrão 70; "Rede Sul" 60 (vigente, vínculo só com 9001); "Promo Set" 58 do próprio 9001, vencida 30/09/2026; "Inativa" 50 `INACTIVE`; foto `https://` | C-001…C-006, C-019 |
  | produto 715 | 9715: padrão 40; foto `http://` (tratada como sem foto) | C-006, C-019 |
  | — | 9716: padrão 50; "Geral" 45 sem cliente e sem vínculo; "Só vinculado" 44 sem cliente com vínculo a 9002 | RN-008 (geral) |
  | — | 9717: padrão 0 | RN-007 |
  | produto 9001 | 9001: sem custo, sem foto | C-005, C-019 |
  | "whey" | 30 produtos "Whey ..." ativos + 1 inativo; "AÇAÍ EM PÓ" | RF-003, RN-014 |
  | mixes | Ana 23 (inclui "Campanha Verão" para 9001 com 2 itens e "Inverno" para 9003); Bruno 5 | C-009, C-010, C-011, C-012 |
  | custos | `LAST_SUCCESS_AT = 2026-10-30T14:00:00` (UTC = 11:00 de Brasília) | C-016 |

  Ana, Bruno e as férias de Ana (01/11–15/11, substituto Bruno) vêm do seed da 001.
- **`CHECK_INPUT`:** precisa de `busca: ''`, `buscaDigitos: ''`, `clienteId: '0'`, `produtos: ''`, `offset: '0'`, `mixId: '0'` — acrescentados ao `config.mjs` (arquivo compartilhado, edição pontual).
- **Dialeto (D-904):** três traduções em `mysql-dialect.mjs` e uma em `runtime.mjs`, com teste no smoke da 009:
  - `JSON_TABLE(json, '$[*]' COLUMNS (A T PATH '$.a', ...)) jt` → `(SELECT json_extract(value, '$.a') AS A, ... FROM json_each(json)) jt`;
  - `CONVERT(x USING utf8mb4) COLLATE utf8mb4_0900_ai_ci` → `MITRA_SEM_ACENTO(x)` (função registrada: sem acento, maiúsculas);
  - `LAST_INSERT_ID()` → `last_insert_rowid()`;
  - SF com várias instruções separadas por `;` fora de literais: executa uma a uma e devolve a soma de `affectedRows` (sem transação, como a plataforma).

## Testes

Backend em `novo/backend/simulator/smoke/009-mix.mjs`; tela em `novo/frontend/tests/mix.test.mjs`. O título de cada teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | smoke + tests | tela: custo 70, margem 30 → 100; qtd 10 → 1.000. Backend: Ana cria para 9001 → 1 mix com 1 item, totais 700/1.000/30, dono Ana, topo da listagem |
| C-002 / RN-003 | tests | custo 70: margem 20 → 87,50; preço 65 → −7,69 → "−7,7%", faixa Baixa |
| C-003 / RN-008 | smoke | opções de 9714 para 9001 = {padrão 70, especial 60 Rede Sul}; para 9002 = {padrão 70}; para 9005 (fora da carteira) → 0 linhas |
| C-004 / RN-008 | smoke | "Promo Set" (fim 30/09/2026) não volta em 30/10/2026; volta em 15/09/2026; "Inativa" nunca |
| RN-008 (geral) | smoke | 9716: para 9001 = {padrão 50, Geral 45}; para 9002 = {padrão 50, Geral 45, Só vinculado 44} |
| RN-008 (escolha) | tests | especiais 60 e 55 com `ESPECIAL` → 55; com `PADRAO` → 70; `PADRAO` sem padrão → primeiro especial |
| C-005 / RN-009 | tests | sem opções → custo 0, `SEM_CUSTO`, aviso e etiqueta |
| C-006 / RN-010 | tests | 9714 especial 60 + 9715 padrão 40, troca para cliente sem a política → 9714 = 70 com margem igual, 9715 igual, mensagem "1 item teve o custo trocado…" |
| C-007 / RN-005 | tests | A(70;100;10) + B(50;20%;4) → B 62,50; custo 900; venda 1.250; margem 28,0% Atenção; CMV 72,0%; mark up 38,9% |
| RN-006 | tests | margem 30 Saudável; 29,99 Atenção; 19,99 Baixa; CMV conc. 70 verde, 85 âmbar, 85,1 vermelho |
| RN-001 | tests | margem 95 com custo 10 → 200; 99 → limitada a 95 |
| RN-002 / RN-004 | tests | item novo com 30; custo 70 → 60 com margem 30 → 85,71 |
| RN-007 | smoke | 9717 (padrão 0) não lista opção padrão |
| C-008 | tests | sem cliente → "Selecione o cliente para salvar"; sem nome → "Informe o nome do mix para salvar"; sem itens → "Adicione ao menos um produto para salvar" |
| C-009 / RN-011 | smoke | Ana: página 1 = 20, `TOTAL` = mixes de Ana no banco (23 no seed), nenhum de Bruno; `offset` 20 → 3 |
| C-010 / RN-011 | smoke | em 05/11 Bruno busca e acha 9001 (de Ana); cria mix para 9001 → 1; lista de Bruno sem mixes de Ana; itens, atualizar, excluir e enviar mix de Ana como Bruno → 0; em 16/11 9001 some e criar → 0 |
| C-011 | smoke + tests | tela: `duplicar` → "Campanha Verão - Cópia", sem id, itens iguais. Backend: total igual até criar; criar a cópia → +1, dono = quem salvou |
| C-012 / RN-016 | smoke | enviar em 30/10/2026 14:00 → flag e data; reenviar 31/10 → data 31/10; mix não enviado com flag 0 |
| C-013 / RN-015 | tests | HTML do mix de C-007 contém "R$ 1.250,00", "14", "R$ 89,29", "30/10/2026" e não contém "Custo", "Margem", "CMV" |
| C-014 | tests | `abrirProposta(() => null, ...)` → mensagem de pop-up; nenhuma escrita chamada |
| C-015 / RN-015 | tests | CSV de C-007: cabeçalho + 2 itens + TOTAL; `;`; "1250,00"; BOM; `nomeArquivo('Campanha Verão')` = `campanha-verao.csv` |
| C-016 / RN-014 | tests | 190 min → "Custos sincronizados há 3h…"; 1.500 min → "há 1 dia(s)"; 90 min → "Custos atualizados às 11:00" sem aviso |
| C-017 | smoke + tests | backend: 9003 tirado da carteira → listagem `NA_CARTEIRA = 0`, itens continuam legíveis, atualizar → 0. Tela: `motivoBloqueioSalvar` com cliente fora → mensagem da C-017 |
| C-018 / RN-012 | smoke | criar para 9005 como Ana → 0 gravados; nenhuma linha nova |
| RN-013 | smoke | repetido, qtd 0, qtd 1,5, preço −1, nome vazio, lista vazia → 0 e nada gravado; totais da tela ignorados (servidor grava 1.250 para os itens de C-007); item inválido no 2º → nem cabeçalho nem itens |
| RN-014 | smoke | catálogo: "whey" → 8; inativo não volta; "acai" acha "AÇAÍ EM PÓ"; por código de fábrica; cliente: "mercado" e só dígitos do CNPJ acham 9001; o 800º da carteira é achado pela busca |
| C-019 / RN-017 | smoke + tests | backend: `FOTO_URL` de 9714 = https, de 9715 e 9001 vazio. Tela: `fotoSegura('http://x')` = '' |
| RNT-011 | tests | `pct(-7.6923)` = "−7,7%"; `lerValor('1.500,50')` = `lerValor('1500.50')` = 1500.5 |
| dialeto (D-904) | smoke | `JSON_TABLE` → linhas certas; `MITRA_SEM_ACENTO('açaí')` = 'ACAI'; SF de 2 instruções devolve a soma |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-901 | Itens vão como um JSON lido por `JSON_TABLE` | uma SF por item; SF JAVASCRIPT orquestrando | uma chamada por salvar (RNFT-002); business só escreve por SF SQL; o antigo já usa assim em produção |
| D-902 | Tudo ou nada pela validação na 1ª instrução, não por transação | `START TRANSACTION` na SF; SF JS com compensação | não se sabe se a plataforma mantém transação entre instruções (T-902 verifica); com a validação na frente, dado inválido nunca grava nada |
| D-903 | Rotinas de custos, catálogo e fotos continuam as do antigo | reescrever como `s360*` | elas não têm tela, não mudam de comportamento e já alimentam as tabelas; reescrever só traz risco. Entram na lista de aposentadoria só quando o antigo sair |
| D-904 | Dialeto do simulador ganha `JSON_TABLE`, `COLLATE ..._ai_ci`, `LAST_INSERT_ID()` e várias instruções | SQL diferente para o simulador | o simulador roda o SQL publicado; as traduções preservam o significado |
| D-905 | Sem acento por `COLLATE utf8mb4_0900_ai_ci` na consulta; CNPJ pelos dígitos enviados pela tela | normalizar as colunas; função no banco | C1 proíbe mudar collation; a comparação na consulta resolve sem estrutura nova. Se a 002 escolher outra técnica, a 009 adota a dela |
| D-906 | Política escolhida no item fica só na memória da tela; ao reabrir, é deduzida pelo custo igual | coluna nova para a política | sem acréscimo de estrutura; o rótulo é só exibição |
| D-907 | PDF por janela de impressão e CSV à mão | biblioteca de PDF/planilha | RN-015 pede só impressão e CSV; zero dependência |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| A plataforma devolver `affectedRows` só da 1ª ou da última instrução | tela diria erro com sucesso, ou o contrário | em sucesso **todas** as instruções mudam linhas e em recusa nenhuma muda, então soma, primeira e última concordam em zero × não zero; T-902 confere no sandbox |
| Falha de infraestrutura entre a 1ª e a 2ª instrução de criar | mix sem itens | raro; a lista mostra o mix com 0 itens e a pessoa exclui. T-902 testa se `START TRANSACTION`/`COMMIT` funciona na SF; se funcionar, entra |
| `utf8mb4_0900_ai_ci` não existir (MySQL < 8) | busca falha | `JSON_TABLE` já exige MySQL 8 e está em produção; T-901 confirma a versão |
| Fuso de `LAST_SUCCESS_AT` | idade errada em 3 h | a rotina grava `toISOString()` (UTC); a tela compara em UTC e mostra a hora em Brasília |
| Ids de seção/departamento sem nome no catálogo | categoria pouco legível | mantém o "Depto X / Seção Y" do antigo |

## Complexity Tracking

Vazio.
