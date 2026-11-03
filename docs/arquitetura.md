# Arquitetura

> Parte da [documentação do projeto](README.md). Veja também: [Banco de Dados](banco-de-dados.md) · [Server Functions](server-functions.md) · [Operação](operacao.md)

## Visão geral

O **Comercial Externo 360** (Benenutri) é um CRM de força de vendas construído sobre a plataforma **Mitra**:

- **Frontend**: SPA React servida como build estático (`frontend/dist`).
- **Backend**: não existe servidor próprio no repositório. Toda a lógica de dados vive em **Server Functions (SFs)** hospedadas no Mitra (SQL e JavaScript), chamadas pelo frontend via `mitra-interactions-sdk`. O diretório [`backend/`](../backend/) contém scripts one-shot de provisionamento/manutenção e um servidor MCP de consulta.
- **Banco**: MySQL gerenciado pelo Mitra (~70 tabelas). Ver [banco-de-dados.md](banco-de-dados.md).
- **Integrações**: TOTVS/Winthor (vendas, RCAs, custos, clientes), Google Agenda (sync de visitas/tarefas), e-mails semanais.

```
[React SPA] --executeServerFunctionMitra--> [Mitra: ~270 SFs] --SQL--> [MySQL Mitra]
                                                 ^
[backend/*.mjs via mitra-sdk] -- DDL/DML/criação de SFs (one-shot)
[backend/mcp-server.mjs]      -- consulta read-only (MCP stdio/HTTP)
[TOTVS/Winthor]               -- ingestão de vendas, RCAs, custos (crons + SFs JS)
```

## Frontend

| Item | Valor |
|---|---|
| Build | Vite 7 ([vite.config.ts](../frontend/vite.config.ts)), `base: './'` |
| UI | React 19 + TypeScript strict, Tailwind CSS v4 |
| Rotas | `react-router-dom` 7 — tabela em [App.tsx](../frontend/src/App.tsx) |
| Gráficos | Recharts (wrappers em [Chart.tsx](../frontend/src/components/ui/Chart.tsx)) |
| Grids | Handsontable (Painel de Validação, gestões, acomp. semanal) |
| SDK | `mitra-interactions-sdk` (pinado em [package.json](../frontend/package.json)) |
| Testes | Vitest + Testing Library (`npm run test`) |

### Estrutura de `frontend/src/`

```
main.tsx           bootstrap (StrictMode + BrowserRouter)
App.tsx            tabela de rotas + gate de sessão (sem sessão → /login)
index.css          design tokens (:root), overrides Recharts/Handsontable
components/        Layout (sidebar/header), filtros de escopo, widgets de domínio
components/ui/     primitivos: Button, Input, Select, Modal, Toast, Chart, ...
hooks/             useMitra (camada de dados), useToast, useDrill, useHighlight
lib/               mitra-auth, smartSearch, operational-week, utils
pages/             32 componentes de página (30 com rota, 2 embutidos; ver docs/modulos/)
```

Sem state manager global e sem react-query: cada página gerencia seus dados com `useState`/`useEffect`.

### Autenticação e sessão — [mitra-auth.ts](../frontend/src/lib/mitra-auth.ts)

- O token e a `backURL` chegam no **fragment da URL** (`#tokenMitra`, `#backURLMitra`, `#integrationURLMitra`) para não vazar em logs/referrer; o hash é limpo com `history.replaceState`.
- Sessão persistida no `localStorage` (chave `mitra-session`); `configureSdkMitra` registra `onTokenRefresh` para re-salvar.
- `initMitra()` retorna `false` sem sessão → [App.tsx](../frontend/src/App.tsx) redireciona tudo para `/login`.
- [LoginPage](../frontend/src/pages/LoginPage.tsx) suporta Google, Microsoft e e-mail/senha com código de verificação (APIs `loginWithGoogleMitra`, `loginWithMicrosoftMitra`, `emailLoginMitra`, `emailSignupMitra`, `emailVerifyCodeMitra`, `emailResendCodeMitra`).
- `ensureTrackerCompat()` aplica shim em `window.__cbTracker` (versões antigas do tracker derrubavam o app em tela branca).

### Camada de dados — [useMitra.ts](../frontend/src/hooks/useMitra.ts)

- Constante `SF`: mapa alias → id numérico com 270 Server Functions mapeadas (ids 1–363, com lacunas). É a **fonte de verdade no frontend** de quais SFs existem.
- Wrappers sobre `executeServerFunctionMitra({ projectId, serverFunctionId, input })`:
  - `callSF(id, input)` → `any[]`
  - `callSFSingle(id, input)` → primeira linha ou `null`
  - `callSFWithMeta(id, input)` → `{ rows, error }`; erro genérico para o usuário, detalhe no console
  - `callSFMutation(id, input)` → `boolean`
  - `extractRowsFromOutput` tolera output como string JSON, `{rows}`, `{result}`, `{body.result.rows}` ou array puro.
- Formatadores compartilhados: `formatCurrency` (BRL), `formatDate`, `formatPercent`, e helpers de fuso **America/Sao_Paulo** (`getBrasiliaDate`, `getBrasiliaTimestamp`, `formatServerDateTimeBrasilia`).
- Exceções conhecidas: 5 páginas de gestão chamam `executeServerFunctionMitra` direto, fora dos wrappers — ver [pendencias.md](pendencias.md).

Outras APIs do SDK usadas no frontend: `getRecordMitra` (leitura direta de `CLIENTES` em [ClientesPage.tsx](../frontend/src/pages/ClientesPage.tsx)) e `uploadFilePublicMitra` (anexos do Suporte e imagens do RichTextEditor).

### Escopo de visualização — [CoordinatorScopeFilter.tsx](../frontend/src/components/CoordinatorScopeFilter.tsx)

Hook `useCoordinatorScope` + componente de filtro definem o modo `'ME' | 'TEAM' | 'SELLER' | 'GLOBAL'` e devolvem os parâmetros injetados nas SFs (`scopeUserId`, `scopeCodRca`, `scopeCodSupervisor`, `scopeCodFilial`, `scopeCodepto`, `scopeIdSecao`). Usado em Dashboard, Agenda, Clientes, Tarefas, Alertas, Analytics, Acomp. Semanal e Histórico. Regras em [regras-de-negocio.md](regras-de-negocio.md#escopo-de-visualização).

### Tema e estilos

O tema é **duas camadas de CSS custom properties** em [index.css](../frontend/src/index.css): `:root` (claro) e `:root[data-tema="escuro"]` (escuro), que só redefine tokens — nenhuma regra de layout muda. Os tokens cobrem paleta primária verde (`--color-primary: #156b16` no claro), superfícies, texto, semânticos, série de gráficos `--chart-1..8` (OKLCH), sombras, raios, planilha (`--hot-*`), barras de rolagem e a moldura do app (`--shell-*`, `--sidebar-*`, `--header-*`, `--nav-*`). A classe `.app-scale-80` na raiz do [Layout](../frontend/src/components/Layout.tsx) reduz a tipografia no desktop e reverte no mobile.

O atributo `data-tema` no `<html>` é escrito por [lib/theme.ts](../frontend/src/lib/theme.ts), que resolve as três origens do tema (o app roda num iframe dentro do workspace):

O protocolo com o **Meu painel** (projeto 61812) é, nos dois sentidos, exatamente:

```js
postMessage({ tipo: 'mitra-tema', tema: 'light' | 'dark' }, '*')
```

O campo é `tipo` (**não** `type`) e o tema já vem resolvido — nunca chega `'system'`. O painel envia no `onLoad` do iframe e a cada troca nele; escuta a mesma forma vinda do iframe e repassa aos outros sistemas abertos.

O painel também põe **`?tema=light|dark` na URL do iframe** ao abrir a aba (`comTema` em `frontend/src/lib/abas.tsx`, projeto 61812) — é o que faz a aba nascer no tema certo, antes de qualquer mensagem chegar.

1. **Abrir** — `iniciarTema()` roda em [main.tsx](../frontend/src/main.tsx) antes do React montar, para a aba nascer no tema certo sem piscar. Precedência: **`?tema=` da URL da aba** (o tema do painel no instante em que ele abriu o iframe, por isso vence) → tema salvo em `localStorage` (`sales360:tema`) → `prefers-color-scheme`. **Nada é enviado ao painel na carga** — quem abre o assunto é ele, no `onLoad`.
2. **Ouvir o Meu painel** — um `message` listener aceita o aviso, aplica e **não** devolve o aviso: como o painel repassa o tema aos outros sistemas, o nosso próprio aviso pode voltar, e a saída cedo corta o vai-e-vem. Além da forma real, o listener tolera outros nomes/campos (`type`, `mitra-theme`, `theme`, `mode`, dentro de `payload`/`data`), o que não custa nada e protege de uma mudança do lado de fora.
3. **Avisar o painel** — `definirTema()`/`alternarTema()` fazem `postMessage` ao pai na forma exata acima.

### Quem grava o quê (regra comum aos sistemas do workspace)

- **Tema que vem do painel** (o `?tema=` da URL e a mensagem `mitra-tema`): **aplica na tela e não grava.** Gravar faria abrir o sistema pelo painel sobrescrever a escolha da pessoa — e quem seguia `prefers-color-scheme` (a *ausência* de escolha) ficaria com claro ou escuro fixo também fora do painel. Dentro do painel o sistema espelha o painel; fora, a escolha dela continua intacta.
- **Tema trocado no botão do próprio app**: **grava** em `localStorage` e avisa o painel. É o único caminho que grava.
- Por isso o **botão e o ícone leem o tema aplicado na tela** (`temaAtual()`, via `useTema()`), nunca o valor salvo: dentro do painel os dois podem divergir, e um clique inverte o que está na tela. O hook lê a tela **na partida**, **confere de novo no `mount`** e só então passa a ouvir — o aviso do painel vem no `onLoad` do iframe e pode cair entre o primeiro render e o efeito; sem essa reconferência o ícone nascia invertido (tela escura com o ícone de escurecer).
- Consequência no `prefers-color-scheme`: o app só acompanha a troca do sistema operacional enquanto ninguém escolheu nada **e** o painel ainda não falou; depois que o painel falou, ele manda mais que o sistema.

Nos componentes, use o hook [useTema()](../frontend/src/hooks/useTema.ts) (`{ tema, escuro, alternar, definir }`). O botão de alternar está no header do Layout. Comportamento coberto por [theme.test.ts](../frontend/src/lib/theme.test.ts) (16 testes) e [useTema.test.tsx](../frontend/src/hooks/useTema.test.tsx) (4 testes, a leitura do botão).

> **Pendência do tema escuro:** as 36 páginas em `frontend/src/pages/` ainda têm cerca de 3,3 mil cores fixas em `style={{…}}`, que não respondem ao tema. `index.css` e o Layout já estão 100% em tokens; converter as páginas é um trabalho à parte.

## Backend (modelo Mitra)

### Server Functions

A lógica de negócio mora em SFs no Mitra, de dois tipos:

- **SQL**: query parametrizada. Placeholders: `{{param}}` (interpolação do input) e `:VAR_USER` (id do usuário logado, resolvido pela plataforma — base do isolamento por vendedor).
- **JAVASCRIPT**: usadas para syncs/crons (ex.: sync de custos, acompanhamento semanal). Código-fonte de algumas mantido em `backend/*.sf.js`, `backend/sf-src/*.js` e snapshots em [`backend/sf-versions/`](../backend/sf-versions/).

#### SF JAVASCRIPT exige perfil para usuário business

Uma SF JAVASCRIPT chamada pela tela **herda o tipo de acesso de quem chamou**, e o acesso ao banco de dentro dela (`runQueryMitra`/`runDmlMitra`) é validado contra o **perfil** do usuário. Usuário `business` sem perfil recebe:

> `400 BAD_REQUEST "User has no profile assigned, please contact the administrator."`

SF do tipo SQL **não** passa por essa checagem — por isso o sistema inteiro funcionava para os vendedores enquanto qualquer SF JavaScript falhava para eles (log de 4 dias: 9.125 execuções SQL com 0 falhas contra 39 execuções JavaScript com 0 sucessos). É a razão de existirem `prospectsCriarSql` e `prospectsAgendarVisitaSql` — reescritas em SQL de SFs que eram JavaScript.

**Solução adotada:** perfil `Operacao Comercial` (id 1), criado por [add-perfil-operacao-business.mjs](../backend/add-perfil-operacao-business.mjs) como **superconjunto deliberado** — todas as tabelas em SELECT e DML, todas as SFs. O objetivo é destravar acesso, não restringir: restringir aqui quebraria telas que os 26 vendedores usam hoje. Isso não amplia o que eles já podiam fazer, porque a SQL dentro das SFs é escrita por nós — o usuário só passa parâmetros.

> A SDK expõe `setProfileSelectTablesMitra` mas **não** tem setter de DML; a rota `POST /agentAiShortcut/setProfileDmlTables` existe e é chamada direto no script. Sem as tabelas de DML o usuário leria e não escreveria.

#### Acesso BUSINESS não escreve de dentro de SF JAVASCRIPT

Ter perfil **não basta**. Com o perfil atribuído, o vendedor passou do erro anterior e bateu em outro, duas vezes seguidas (primeiro num `DELETE`, depois num `INSERT`):

> `BUSINESS_ACCESS_DENIED "Operação não permitida para acesso BUSINESS."`

A primeira leitura — "o bloqueio é do verbo `DELETE`" — **estava errada**. O que a evidência sustenta é mais simples e mais amplo:

| Dentro de uma SF **JAVASCRIPT**, com acesso business | Situação |
|---|---|
| `runQueryMitra` (SELECT) | permitido |
| `callIntegrationMitra` | permitido |
| `runDmlMitra` — **qualquer** verbo | **negado** |

| Numa SF do tipo **SQL**, com acesso business | Situação |
|---|---|
| SELECT / INSERT / UPDATE | permitido (9.125 execuções, 0 falhas) |

O que confundiu: os `INSERT`/`UPDATE` bem-sucedidos por usuário business vinham de SFs do tipo **SQL** — caminho diferente do `runDmlMitra`. São dois mecanismos distintos e não se pode inferir um pelo outro. A regra é server-side e não aparece na SDK.

**Regra de arquitetura:** SF JAVASCRIPT chamada pela tela é **função pura** — lê, fala com serviço externo e **devolve** o resultado. Quem persiste é uma SF do tipo **SQL** chamada pela tela, que resolve `:VAR_USER` no servidor. Remoção física e operações de projeto (`createIntegrationMitra`) ficam com uma SF em **cron**, que roda como `Administrator`: no Google Agenda é a `googleAgendaManutencao` (372), a cada 5 min.

Aplicado em [fix-google-agenda-escrita-por-sf-sql.mjs](../backend/fix-google-agenda-escrita-por-sf-sql.mjs) e [fix-google-agenda-sem-delete.mjs](../backend/fix-google-agenda-sem-delete.mjs). Invariantes que dependiam de remoção passaram a ser garantidas na **leitura**:

| Antes | Agora | Garantia preservada |
|---|---|---|
| Apagar o ticket resgatado | `CONSUMIDO_EM` preenchido por SF SQL | A busca exige `CONSUMIDO_EM IS NULL` — uso único mantido |
| Apagar vínculos ao trocar de agenda | `GOOGLE_EVENT_ID = NULL` | A SF 212 busca por `USER_ID+ENTIDADE+ENTIDADE_ID` e recria o evento no destino |
| Tabela-ponte `GOOGLE_OAUTH_PENDENTE` | não usada no fluxo | O refresh token vai da SF 365 para a tela e daí para a SF SQL 366 |

> O refresh token passa pelo navegador **do próprio dono**, que segundos antes tinha em mãos o `code` — equivalente em poder. O `client_secret` não sai do servidor. A SF 365 devolve o token já restrito ao alfabeto `[A-Za-z0-9._~+/=-]`, para não virar vetor de injeção no parâmetro da SF SQL.

### Sem integração por usuário — e por isso sem espera

O desenho anterior dava a **cada usuário a própria integração**, com o `refresh_token` nas credenciais e o Bearer montado pelo motor. Mas criar integração é operação de projeto, negada para acesso business: quem criava era um cron. O vendedor conectava e ficava até 5 minutos vendo *"Sua conexão com o Google está sendo preparada"* — **e caía nessa espera de novo a cada reconexão**, porque a SF 366 zerava o `INTEGRATION_SLUG` toda vez. Não era configuração errada; era o desenho.

Hoje são **duas integrações compartilhadas**, iguais para todo mundo, criadas uma vez:

| Slug | Papel |
|---|---|
| `google-oauth-token` | troca o `refresh_token` do usuário por um `access_token` (validade 1h) |
| `google-calendar-api` | chama a API do Calendar levando esse `access_token` |

Nada é provisionado por usuário, então não há o que esperar: conecta e já lista as agendas (~1s). A coluna `INTEGRATION_SLUG` virou vestigial.

> **O preço, explícito:** `callIntegrationMitra` não aceita header por chamada — o header só existe na configuração da integração, que agora é compartilhada. Então o `access_token` viaja como **parâmetro de URL** (forma legada, mas suportada pela API do Google; verificada com HTTP 200 e dados reais). Token em query string aparece em log de servidor e de proxy. É um token de 1 hora, não o `refresh_token` — este continua só no banco e nas credenciais da integração de token. A alternativa era manter o header e a espera de 5 minutos a cada reconexão.

### Sincronização instantânea, com fila só como rede de segurança

A SF 212 (`googleAgendaSincronizarItem`) não pôde seguir a regra do `:VAR_USER`: além das linhas do próprio usuário, ela grava também as dos **participantes** de um compromisso interno, e `:VAR_USER` só alcança quem está logado. A solução foi torná-la **função pura**: ela lê, fala com o Google e devolve, junto com o resultado, a lista de **`gravacoes`** que precisam acontecer.

| Peça | Tipo | Papel |
|---|---|---|
| `googleAgendaSincronizarItem` (212) | JAVASCRIPT | fala com o Google e **devolve** o que gravar; não grava |
| `googleAgendaGravarVinculo` (379) | SQL | grava o vínculo item ↔ evento; **valida que o usuário é envolvido no item** |
| `googleAgendaLogSync` (380) | SQL | registra o resultado no histórico |
| `googleAgendaMarcarSync` (381) | SQL | atualiza "última sincronização"/"último erro" do usuário logado (`:VAR_USER`) |
| [`lib/googleAgenda.ts`](../frontend/src/lib/googleAgenda.ts) | frontend | orquestra: 212 → 379 → 380 → 381 |

O vínculo é gravado **primeiro**: é ele que impede a próxima edição de criar um evento duplicado.

**Validação de envolvimento (379):** o `userId` vem do navegador, então não é confiável. A SF exige que ele seja dono, executivo, criador ou participante do item — um id forjado grava zero linhas. A única exceção é **limpar** um vínculo (evento vazio + `CANCELADO`): é o caso do participante retirado da reunião, que por definição já não consta na lista, e limpar vínculo não corrompe nada.

**A fila continua existindo, como rede de segurança:** se a SF 212 falhar, a tela enfileira e o worker (`googleAgendaProcessarFila`, 375, cron 5 min) refaz a sincronização e persiste sozinho — ele roda como `Administrator`, então pode usar `runDmlMitra`. Enfileirar só acontece quando a 212 falhou, ou seja, quando nada foi para o Google: refazer não duplica evento. `GOOGLE_AGENDA_FILA` tem `UNIQUE(ENTIDADE, ENTIDADE_ID)`, então salvar o mesmo item 5x gera **um** pedido pendente.

SF chamada por outra SF não conta no rate limit do projeto, então o worker não consome a cota de 300/min.

### PATCH não funciona no motor de integração

Testado nas duas integrações (compartilhada e por usuário): `PATCH` devolve **na hora** um `Read timed out after 300s` — resposta enlatada, não timeout real. `POST`, `PUT` e `DELETE` respondem em 0s.

Como a SF 212 usava `PATCH` para **atualizar** evento já existente, toda reedição de visita/tarefa falhava. Isso também explica as falhas antigas registradas como *"Google nao retornou ID do evento"*, atribuídas na época a credenciais vencidas. Trocado por `PUT`.

> `PUT` substitui o evento inteiro, então campo que o usuário tenha adicionado **à mão no Google** (convidado, lembrete) é sobrescrito na próxima sincronização. Para eventos que o sistema é dono, é o comportamento correto.

### Armadilha: `updateServerFunctionMitra` com `code` apaga o `cronExpression`

Atualizar só o código de uma SF agendada **zera o agendamento**, sem erro nenhum — a SF simplesmente para de rodar em silêncio. Aconteceu com as SFs 372 e 375 nesta rodada. Depois de alterar o código de qualquer SF em cron, **reaplique o `cronExpression`** e confirme lendo a SF de volta.

### Perfil é pré-requisito para conectar

SF JAVASCRIPT só acessa o banco se quem chamou tiver **perfil** — sem ele, `User has no profile assigned`. Conectar a conta (365) e listar as agendas (370) são SFs JAVASCRIPT chamadas pela tela, então **todos os 26 usuários business** estão no perfil `Operacao Comercial` (id 1), aplicado por [add-perfil-todos-business.mjs](../backend/add-perfil-todos-business.mjs).

> `setProfileUsersMitra` **substitui** a lista inteira, não adiciona. O script sempre monta a lista completa de business antes de chamar — rodar com um subconjunto remove silenciosamente quem ficou de fora.

Nenhuma SF JAVASCRIPT chamada pela tela grava mais no banco. A `googleAgendaTrocarCalendario` (371) passou a só ler e limpar os eventos no Google — a escrita virou três SFs SQL com `:VAR_USER` (376 zerar vínculos, 377 gravar agenda, 378 log), chamadas em sequência pela tela. A ordem importa: **zerar os vínculos antes** de mudar o `CALENDAR_ID`, senão sobra vínculo da agenda antiga apontando para o destino novo e a sincronização seguinte quebra com 404. A `googleAgendaSincronizarItem` (212) saiu do caminho da tela e virou fila + worker (acima).

Rollout do perfil: começou com **um** vendedor, validado em produção, e depois estendido aos 26 ([monitor-perfil-business.mjs](../backend/monitor-perfil-business.mjs) acompanha sucesso/falha por usuário).

Catálogo completo: [server-functions.md](server-functions.md) e o inventário detalhado [sf-cruzamentos.md](legado/sf-cruzamentos.md).

### Scripts `.mjs`

~265 scripts one-shot em [`backend/`](../backend/) usando `mitra-sdk` (`runDdlMitra`, `runDmlMitra`, `createServerFunctionMitra`, `updateServerFunctionMitra`, ...). O prefixo indica o ciclo de vida — taxonomia em [operacao.md](operacao.md#taxonomia-dos-scripts-mjs). O bootstrap original é [setup-backend.mjs](../backend/setup-backend.mjs) (10 tabelas do núcleo + SFs 1–22 + dados de amostra).

### Migrations

Mudanças de schema/SF viram migrations em `backend/migrations/` + `backend/migrations.yaml`, **materializadas automaticamente pelo sistema após o turno do agente** — nunca editadas à mão (regra no [CLAUDE.md](../CLAUDE.md)). Importante: as migrations em disco cobrem só uma fração do schema; a fonte real do schema histórico são os scripts `.mjs`, e o estado atual só é verificável no projeto Mitra remoto. Ver [banco-de-dados.md](banco-de-dados.md) e [pendencias.md](pendencias.md).

### MCP server — [mcp-server.mjs](../backend/mcp-server.mjs)

Servidor MCP (stdio e HTTP) read-only por padrão, com 5 tools: `status_mcp`, `listar_tabelas`, `listar_funcoes`, `consultar_dados` (só SELECT/WITH, injeta LIMIT) e `executar_funcao` (bloqueado salvo `MCP_ENABLE_MUTATIONS=true`). Documentado em [README-mcp.md](../backend/README-mcp.md).

## Integrações

| Integração | Mecanismo | Tabelas envolvidas |
|---|---|---|
| **Winthor/TOTVS — vendas** | Sync do acompanhamento semanal (SF JS + cron): ingere pedidos na camada raw, agrega por semana operacional | `PEDIDOS_SEMANAIS_SYNC_RAW`, `PEDIDOS_SEMANAIS_SYNC`, `ACOMP_SEMANAL_SYNC_LOG/_ERRO` |
| **Winthor/TOTVS — cadastros** | Scripts de import (`import-*`, `sync-*`): RCAs, departamentos, clientes (`WINTHOR_CODCLI`), custos | `RCA_TOTVS`, `RCA_DEPARTAMENTO`, `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO`, `CUSTO_ESPECIAL_*` |
| **Metas de faturamento** | SFs `syncIntegrationBillingTargets` etc. | `INTG_BUSINESS_UNIT`, `INTG_REGION`, `INTG_ACTIVITY_SEGMENT`, `INTG_MONTHLY_BILLING_TARGET`, `INTG_BILLING_SYNC_LOG` |
| **Google Agenda** | OAuth por usuário; sync de visitas/tarefas/compromissos | `GOOGLE_AGENDA_CONFIG/_EVENTOS/_LOGS` |
| **E-mails semanais** | Crons de alertas e relatório de coordenadores | `ALERTAS_EMAIL_SEMANAL`, `RELATORIO_SEMANAL_COORDENADORES_LOG` |
