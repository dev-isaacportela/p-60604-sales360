# Plan: Acesso, perfis, menu, configurações do usuário e tema

**Spec:** `./spec.md` · **Data:** 2026-10-30

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

A 001 é a primeira spec a ser construída, então este plano também monta o
**esqueleto do sistema novo**: pastas, simulador, transporte, sessão, layout e
testes. As specs 002 em diante só acrescentam scripts, telas e testes sobre ele.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` com zero pendências (decisões de 2026-10-30) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-001-acesso.mjs` é escrito aqui e só roda no sandbox; nada do `mitra-sdk` roda desta máquina |
| Migrations append-only | sim | `backend/migrations/` e `migrations.yaml` não são tocados; a tabela nova e as SFs viram migration gerada pelo sistema |
| Leitura e escrita por Server Function | sim | todas as leituras e escritas da 001 são SFs SQL `s360*`; nenhum CRUD REST; nenhuma leitura direta de tabela (RNFT-005) |
| Simulador cobre a feature | sim | simulador novo em `novo/backend/simulator/`, com `definitions` do `add-001`, schema do banco atual e seed dos cenários C-001…C-015 |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira um `teste()` em `smoke.mjs` ou um `test()` em `novo/frontend/tests/` (mapa abaixo) |
| Design tokens, sem cor literal | sim | design system da Benenutri instalado por `/benenutri:design` em `novo/frontend/src/index.css`; zero hex em componente (RNFT-004) |
| Simplicidade | sim | sem state manager e sem react-query; uma SF de sessão e uma de contadores na abertura; nenhuma dependência além do stack padrão |

## Contexto técnico

- **Onde mora (D-001):** pasta nova `novo/` na raiz do repositório, com
  `novo/frontend/` e `novo/backend/`. O sistema antigo (`frontend/`,
  `backend/`) **não é tocado**. Só o banco de produção é compartilhado.
- **Frontend:** React 19 · Vite 8 · TypeScript 7 · Tailwind 4 · react-router-dom 7 ·
  lucide-react · `mitra-interactions-sdk` 1.0.64 (a mesma versão do antigo).
  Testes com `node --test` (`node:test`), sem vitest; lint com oxlint (o que o
  `create-vite` atual traz). Design system Benenutri (`/benenutri:design`,
  modo Instalar): tokens em `src/index.css` com camada `.dark`, primitivos
  shadcn em `components/ui/`, vocabulário em `components/page.tsx`, marca em
  `components/Logo.tsx`; norma em `docs/design.md`.
- **Backend:** `mitra-sdk` (mesma faixa do antigo, `^1.0.64`), scripts
  `add-NNN-*.mjs` que exportam `definitions`, e o simulador do kit
  `mitra-escopo` (SQLite, Node 22.5+).
- **Prefixo das SFs (D-002):** `s360` + domínio + ação, por exemplo
  `s360SessaoObter`. Nenhum nome colide com as 270 SFs atuais, então as duas
  gerações convivem no mesmo projeto.
- **Reuso identificado:**
  - kit `mitra-escopo`: `mitra-auth.ts`, `mitra-api.ts`
    (`linhas`/`linha`/`acao`), `server-functions.ts`, `formato.ts`,
    `tests/formato.test.mjs`, o simulador completo, `sync-server-function-map.mjs`
    e o `package.json` do backend;
  - `/benenutri:design`: tokens, fontes, logo, primitivos (`Button`, `Input`,
    `Select`, `Modal`, `Toast`…) e o vocabulário de tela;
  - comportamento já provado no antigo, **reescrito** e não copiado: o
    protocolo de tema com o Meu painel (`docs/arquitetura.md`, "Tema e
    estilos", com os 16 casos de `frontend/src/lib/theme.test.ts` como
    referência) e a chave `sales360:tema` do `localStorage`, mantida para a
    escolha de tema da pessoa valer nos dois sistemas.
- **Dependência nova:** nenhuma.

## Modelo de dados

Só acréscimo, conforme o contrato de `000-visao-geral/modelo-de-dados.md`.

| Entidade (spec) | Tabela | Campos-chave | Observação |
|---|---|---|---|
| Usuário | `INT_USER` | `ID`, `DESCR` (e-mail), `NOME` (nome de exibição) | da plataforma; a 001 só grava `NOME` |
| Papéis (RNT-001) | **`USUARIO_PAPEL`** *(nova, acréscimo aprovado)* | `ID`, `USER_ID`, `PAPEL`, `ATRIBUIDO_POR`, `ATRIBUIDO_EM` | `UNIQUE (USER_ID, PAPEL)`; `PAPEL` ∈ VENDEDOR, COORDENADOR, DIRETORIA, GESTOR, ADMIN; `ATRIBUIDO_EM VARCHAR(19)` |
| Papel legado | `USUARIO_CARGO` | `USER_ID`, `CARGO` | só leitura; o sistema antigo continua gravando (D-003) |
| Coordenador | `COORDENADORES` | `USER_ID`, `ATIVO` | só leitura (spec 010 mantém) |
| Preferências | `USUARIO_PREFERENCIAS` | `ID`, `USER_ID`, `MODO_AGENDA`, `EXIBICAO_TAREFAS`, `PAGINA_INICIAL`, `ATUALIZADO_EM` | sem DDL no repo (L-01): estrutura confirmada no sandbox antes de publicar (T-001); valores no formato do antigo (D-005) |
| Bloqueio | `USUARIO_BLOQUEIO` | `USER_ID`, `BLOQUEADO` | só leitura (spec 010 grava) |
| Férias | `FERIAS_VENDEDOR` + `VENDEDOR_RCA` | `COD_RCA`, `DT_INICIO`, `DT_FIM`, `COD_RCA_SUBSTITUTO`, `ATIVO`; `USER_ID ↔ COD_RCA` | só leitura; fonte única (C3/L-05) |
| Configuração comercial | `VENDEDOR_RCA`, `BU_VENDEDOR` | `USER_ID`; `VENDEDOR_ID`, `ATIVO` | só leitura (RN-017) |
| Contadores | `TAREFAS`, `ALERTAS_INTELIGENTES` | `VENDEDOR_ID`, `STATUS`; `ID_VENDEDOR`, `LIDO` | só leitura |

**Carga inicial de `USUARIO_PAPEL`** (no `add-001`, idempotente):
`INSERT ... SELECT USER_ID, CARGO FROM USUARIO_CARGO WHERE CARGO IN (...)`,
guardado por `NOT EXISTS`. Dados que não vão para o sistema novo:
`FUNCIONARIOS.STATUS`/`ID_SUBSTITUTO` (decisão A10: a lista das marcações
atuais é extraída por T-004 para a coordenação recadastrar).

## Contratos de backend

Arquivo `novo/backend/add-001-acesso.mjs`. Todas as SFs são SQL, resolvem quem
chama por `:VAR_USER` e trazem o guarda de bloqueio (D-004), exceto a de
sessão, que precisa **devolver** o bloqueio para a tela encerrar a sessão.

| Nome | Tipo | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|---|
| `s360SessaoObter` | SQL | `hoje` (`AAAA-MM-DD`, Brasília) | 1 linha: `USER_ID`, `EMAIL`, `NOME_EXIBICAO`, `PAPEIS` (lista separada por vírgula, união de `USUARIO_PAPEL` e `USUARIO_CARGO`, sem papel = `VENDEDOR`), `COORDENADOR_ATIVO` (0/1), `BLOQUEADO` (0/1), `CONFIGURADO` (0/1), `MODO_AGENDA`, `EXIBICAO_TAREFAS`, `PAGINA_INICIAL` (com os padrões `SEMANA`, `LISTA`, `/`) | RF-004, RF-005, RF-006, RF-010, RF-013, RF-014; RN-005, RN-006, RN-010, RN-011, RN-016, RN-017 |
| `s360ContadoresObter` | SQL | — | 1 linha: `ATIVIDADES_PENDENTES` (`STATUS IN ('PENDENTE','EM_ANDAMENTO')`), `ALERTAS_NAO_LIDOS` (`LIDO = 0`) | RF-007; RN-008 |
| `s360FeriasMinhasObter` | SQL | `hoje` | 0–2 linhas: `PAPEL_FERIAS` (`TITULAR`/`SUBSTITUTO`), `ESTADO` (`ATIVA`/`FUTURA`), `DT_INICIO`, `DT_FIM`, `OUTRA_PESSOA` (nome) | RF-011; RN-012 |
| `s360ConfiguracoesGarantir` | SQL | `agora` (`AAAA-MM-DDTHH:MM:SS`) | — (cria a linha de preferências com os padrões só se não existir) | RN-014 |
| `s360ConfiguracoesSalvar` | SQL | `nome`, `modoAgenda`, `exibicaoAtividades`, `paginaInicial`, `agora` | linhas afetadas | RF-009; RN-010, RN-011, RN-014 |

Regras de contrato:
- **Salvar é uma instrução só (D-006):** `UPDATE INT_USER U JOIN
  USUARIO_PREFERENCIAS P ON P.USER_ID = U.ID SET U.NOME = ..., P.MODO_AGENDA
  = ..., P.ATUALIZADO_EM = '{{agora}}' WHERE U.ID = :VAR_USER AND <valores
  válidos> AND <sem bloqueio>`. A tela chama `s360ConfiguracoesGarantir` antes
  (inofensivo se repetir). `ATUALIZADO_EM` sempre muda, então "0 linhas" só
  acontece quando a validação recusa, e aí a tela mostra `Falha ao salvar
  configurações.` (RNT-013).
- **Validação no servidor:** `modoAgenda IN ('DIA','SEMANA','MES')`,
  `exibicaoAtividades IN ('LISTA','KANBAN')`, `paginaInicial IN ('/',
  '/agenda', '/clientes', '/tarefas', '/simulacao', '/analytics')` (Painel de
  Gestão saiu da lista: tela cancelada em 2026-11-03);
  `CHAR_LENGTH(TRIM('{{nome}}')) <= 120`. Nome vazio grava `NULL` e a sessão
  devolve `COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR)`.
- **Datas vêm da tela (D-007):** `hoje` e `agora` são calculados em
  America/São_Paulo por `formato.ts` (RNT-011). O SQL não usa `NOW()` nem
  `CURDATE()`: o fuso do MySQL da Mitra não é confiável (L-17) e o simulador
  fica determinístico.
- **Férias:** `ESTADO = 'ATIVA'` quando `DT_INICIO <= '{{hoje}}' <= DT_FIM` e
  `ATIVO`; `FUTURA` quando `DT_INICIO > '{{hoje}}'` (só a mais próxima).
  Titular e substituto chegam ao usuário por `VENDEDOR_RCA.COD_RCA`.
- **`CONFIGURADO`:** 1 quando há `VENDEDOR_RCA` **ou** `BU_VENDEDOR` ativo do
  usuário; a tela só mostra o aviso da RN-017 quando `CONFIGURADO = 0` e
  nenhum papel além de VENDEDOR, nem coordenador ativo.
- **Guarda de bloqueio** (`novo/backend/lib/guardas.mjs`):
  `NOT EXISTS (SELECT 1 FROM USUARIO_BLOQUEIO B WHERE B.USER_ID = :VAR_USER
  AND B.BLOQUEADO = 1)`. Fica num fragmento compartilhado, com
  `temPapel(...)` e `coordenadorAtivo`, que as specs seguintes reusam em toda
  SF (RN-016, RNT-002).
- **Perfil de acesso:** `novo/backend/add-000-perfil-acesso.mjs` põe as SFs
  `s360*` e as tabelas lidas no perfil `Operacao Comercial` (id 1), que já
  contém todos os usuários business. O script **acrescenta** às listas
  existentes, nunca substitui (`docs/arquitetura.md`: `setProfileUsersMitra`
  substitui a lista inteira).

## Superfície de interação

| Tela / rota (sistema novo) | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/login` | Google, Microsoft, e-mail/senha; mensagens fixas; aviso de bloqueio (`?bloqueado=1`); em modo local, formulário do simulador | primitivos do design system | `LoginPage` |
| `/recuperar-senha` | pedir código → código + nova senha → volta ao login com e-mail preenchido | idem | `RecuperarSenhaPage` |
| moldura (todas as rotas) | menu por seção, contadores, barra superior (marca, tema, configurações, avatar), ☰ no celular | idem | `Layout`, `Menu`, `BarraSuperior` |
| qualquer rota restrita | `Acesso restrito` + perfis permitidos, sem consulta de dados | idem | `AcessoRestrito` |
| `/configuracoes` | cards (Nome, Papéis, Substituto em Férias, ID), status de férias, edição de nome e preferências; o bloco Google Agenda é da spec 003 | idem | `ConfiguracoesPage` |
| `/` e demais rotas do menu | placeholders "em construção" até cada spec entrar, para a navegação ser verificável | — | `EmConstrucao` |

Regra pura em `novo/frontend/src/lib/` (é o que os testes importam):

| Arquivo | Funções |
|---|---|
| `sessao.ts` | `normalizarSessao(linha)`, `papeis(sessao)`, `rotuloPapeis`, `destinoAposLogin(pedido, sessao)`, `destinoSemSessao(caminho)`, `mostrarAvisoNaoConfigurado(sessao)` |
| `menu.ts` | `montarMenu(sessao)` (RN-005), `podeAbrir(rota, sessao)`, `perfisPermitidos(rota)`, `opcoesPaginaInicial(sessao)` |
| `login.ts` | `CAMINHOS_LOGIN`, `mensagemErroLogin(origem)`, `validarCodigo(texto)`, `validarNovaSenha(a, b)`, `limparCredencial(texto)` |
| `perfil.ts` | `normalizarNome(texto, nomeConta)`, `iniciais(nome)`, `textoFerias(linhas, hoje)` |
| `tema.ts` | `resolverTema({ url, salvo, sistema })`, `aoAvisoDoPainel`, `aoBotao` (decisões puras; o efeito no DOM e o `postMessage` ficam num invólucro fino) |
| `contadores.ts` | `precisaRecarregar(ultima, agora)`; o evento `s360:contadores` dispara a recarga logo após a ação |
| `formato.ts` (kit) | `hojeBrasilia()`, `agoraBrasilia()`, datas dd/mm/aaaa |

## Fluxo

1. **Abertura** (`main.tsx`): `iniciarTema()` aplica o tema antes do React
   montar (RNF-003). `initMitra()` lê a sessão do `localStorage` ou do fragment
   `#tokenMitra` e apaga o fragment (RNF-002).
2. **Sem sessão:** guarda o caminho pedido em `sessionStorage` e vai para
   `/login` (RN-001, C-002).
3. **Login:** chama `loginWithGoogleMitra`, `loginWithMicrosoftMitra` ou
   `emailLoginMitra`. Erro → `mensagemErroLogin` (RN-002), sem repassar o texto
   do provedor. Sucesso → `saveSession`.
4. **Sessão:** `s360SessaoObter({ hoje })` e `s360ContadoresObter()` em
   paralelo, com `Promise.allSettled`: 2 consultas na abertura (RNF-004).
   `BLOQUEADO = 1` → `clearSession()` e `/login?bloqueado=1` (C-006).
5. **Destino:** `destinoAposLogin(pedido, sessao)`: o caminho pedido, se
   `podeAbrir`; senão a página inicial, se `podeAbrir`; senão `/` (RN-004,
   C-011).
6. **Menu:** `montarMenu(sessao)`. Recarga de sessão e contadores a cada 5 min
   e no evento `s360:contadores`, que as telas disparam após uma ação que muda
   um contador (RN-007).
7. **Tela restrita:** a rota consulta `podeAbrir` antes de montar a página; se
   não pode, renderiza `AcessoRestrito` e não chama nenhuma SF da tela (RN-015).
   O servidor recusa de novo em cada SF da tela (guarda, specs 002+).
8. **Configurações:** carga com `s360SessaoObter` (já em memória) e
   `s360FeriasMinhasObter({ hoje })`. Salvar = `s360ConfiguracoesGarantir` e
   depois `s360ConfiguracoesSalvar`; 1 linha afetada → sucesso e recarga da
   sessão; 0 linhas → falha (RN-014).
9. **Tema:** botão → `aoBotao` aplica, grava `sales360:tema` e avisa o painel
   com `postMessage({ tipo: 'mitra-tema', tema })`; aviso do painel →
   `aoAvisoDoPainel` aplica e não grava nem reenvia (RN-009). O efeito é a
   classe `.dark` no `<html>` (design system); o script inline do
   `index.html` aplica antes do React. Só vale mensagem da origem do painel
   (guardada em `sessionStorage` na primeira carga) e o aviso vai só para ela.
   Diferença deliberada do kit: `?tema=` da URL aplica sem gravar (RN-009), e
   a chave continua `sales360:tema`, compartilhada com o sistema antigo.

## Simulador

- **Kit:** `assets/backend/simulator/` copiado para `novo/backend/simulator/`.
  `config.mjs`: `PROJECT_LABEL` "Comercial Externo 360 (novo)", `SEED` 60604,
  porta **3105** e app **5175** (próximas livres da tabela do hub),
  `PUBLISH_ORDER` = [`add-000-perfil-acesso.mjs`, `add-001-acesso.mjs`],
  `DDL_SOURCES` = [`novo/backend/schema-producao/001-acesso.mjs`, `add-001-acesso.mjs`].
- **`schema-producao/001-acesso.mjs` (D-008):** `CREATE TABLE IF NOT EXISTS` das tabelas
  de produção que o sistema novo lê, copiados de `modelo-de-dados.md`, um por
  template literal. Serve ao simulador e documenta o contrato; **não** é
  publicado (as tabelas já existem). Cada spec acrescenta as suas. Na 001:
  `USUARIO_CARGO`, `USUARIO_PREFERENCIAS`, `USUARIO_BLOQUEIO`, `COORDENADORES`,
  `FERIAS_VENDEDOR`, `VENDEDOR_RCA`, `BU_VENDEDOR`, `TAREFAS`,
  `ALERTAS_INTELIGENTES`. `INT_USER` (com `NOME`) vem do kit.
- **Seed** (`seed.mjs`, datas fixas em torno de 30/10/2026; senha `mitra123`):

  | Usuário | Para | Dados |
  |---|---|---|
  | Ana Souza | C-001, C-009, C-010, C-012 | VENDEDOR; RCA 101; escopo F1·Nutrição; preferências `/agenda`, `SEMANA`, `LISTA`; 2 tarefas PENDENTE, 1 EM_ANDAMENTO, 4 CONCLUIDA; 4 alertas não lidos; férias 01/11–15/11/2026, substituto Bruno |
  | Bruno Lima | C-010, RN-012 | VENDEDOR; RCA 102; escopo; preferência `KANBAN` |
  | Carla Mendes | C-011 | VENDEDOR; preferência `/painel-gestao` (tela cancelada) |
  | Diego Ramos | C-004, C-013 | VENDEDOR; RCA 103; sem linha de preferências |
  | Eva Castro | C-005, C-014 | VENDEDOR; RCA 104 |
  | Fábio Nunes | C-006 | VENDEDOR; RCA 105; `USUARIO_BLOQUEIO.BLOQUEADO = 1` |
  | Fernando Alves | C-015 | sem papel, sem RCA, sem escopo |
  | Gil Prado | C-007 | DIRETORIA em `USUARIO_PAPEL` + `COORDENADORES.ATIVO = 1`; COORDENADOR em `USUARIO_CARGO` |
  | Paulo Reis | RN-005, RN-013 | GESTOR só em `USUARIO_CARGO` (prova a união) + COORDENADOR em `USUARIO_PAPEL` |
  | Rita Gomes | RN-006 | COORDENADOR em `USUARIO_PAPEL`, sem cadastro de coordenador |
  | Tânia Lopes | RN-005 | ADMIN |

- **`CHECK_INPUT`:** `hoje: '2026-10-30'`, `agora: '2026-10-30T10:00:00'`,
  `nome: 'Ana Souza'`, `modoAgenda: 'SEMANA'`, `exibicaoAtividades: 'LISTA'`,
  `paginaInicial: '/'`.
- **Dialeto:** `GROUP_CONCAT(DISTINCT ... SEPARATOR ',')` (papéis) e
  `UPDATE A JOIN B SET ...` (salvar). O segundo **não existe em SQLite**: shim
  novo em `mysql-dialect.mjs` que executa as duas atribuições dentro de uma
  transação (`BEGIN`/`COMMIT`, `ROLLBACK` se alguma falhar) e devolve as
  linhas afetadas. Isso preserva o significado (tudo ou nada) e tem teste
  próprio (T-084).

## Testes

Backend em `novo/backend/simulator/smoke.mjs`; tela em
`novo/frontend/tests/*.test.mjs`. O título de cada teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-004 | `tests/sessao.test.mjs` | `destinoAposLogin(null, {pagina:'/agenda', papeis:['VENDEDOR']})` = `/agenda`; modo inicial da Agenda = `SEMANA` |
| C-002 | `tests/sessao.test.mjs` | `destinoSemSessao('/clientes/1234')` guarda o caminho; `destinoAposLogin('/clientes/1234', sessaoAna)` = `/clientes/1234` |
| C-003 / RN-002 | `tests/login.test.mjs` | `mensagemErroLogin('microsoft')` = `Falha no login. Tente novamente.` para qualquer erro, inclusive `"popup_window_error: blocked"`; `mensagemErroLogin('email')` = `Erro na autenticação` |
| C-004 / RF-002 | `tests/login.test.mjs` | `CAMINHOS_LOGIN` = Google, Microsoft, e-mail/senha, Esqueci minha senha; nenhum item com "criar"/"cadastr" |
| RN-003 | `tests/login.test.mjs` | `validarCodigo('12345')` → erro `Digite o código de 6 dígitos`; `'1234567'` é cortado em 6 dígitos; `'12a456'` recusado |
| C-005 | `tests/login.test.mjs` | `validarNovaSenha('abc12345','abc12346')` → `As senhas não conferem`; iguais → ok |
| C-006 / RN-016 | `smoke.mjs` | como Fábio: `s360SessaoObter` → `BLOQUEADO = 1`; `s360ContadoresObter` → 0 linhas; `s360ConfiguracoesSalvar` → 0 afetadas; após desbloquear no teste → contadores voltam |
| C-007 / RN-005 | `tests/menu.test.mjs` | Gil {DIRETORIA, coordenador ativo} → Principal (com Direcionamento Semanal), Coordenador (3), Diretoria (2, sem Titulares), Gestão (Executivas de Venda), Final; Ana {VENDEDOR} → Principal (8) e Final |
| RN-005 (permissões) | `smoke.mjs` + `tests/menu.test.mjs` | backend: Paulo → `PAPEIS` contém GESTOR (de `USUARIO_CARGO`) e COORDENADOR (de `USUARIO_PAPEL`); Tânia → ADMIN. Tela: GESTOR → Gestão com 3 itens; ADMIN → Gestão com 4, sem tela só da TI; nenhum papel gera Ajuda, Suporte, Painel Dev, Notas de Versão ou Solicitações; Final = Configurações; rodapé = Sair |
| C-008 / RN-015 | `tests/menu.test.mjs` | `podeAbrir('/gestao-cargos-usuarios', ana)` = false; `perfisPermitidos('/gestao-cargos-usuarios')` = `Diretoria e TI`. A recusa no servidor é testada no smoke da spec 010, na SF da tela |
| RN-006 | `smoke.mjs` | Rita → `COORDENADOR_ATIVO = 0`; Gil → `1` |
| C-009 / RN-008 | `smoke.mjs` | Ana → `ATIVIDADES_PENDENTES = 3`; após o teste concluir uma tarefa (UPDATE direto no banco descartável) → `2`; `ALERTAS_NAO_LIDOS = 4` |
| RN-007 | `tests/contadores.test.mjs` | `precisaRecarregar(t0, t0 + 299 s)` = false; `+ 300 s` = true |
| C-010 | `tests/sessao.test.mjs` | preferência `KANBAN` → modo inicial de Atividades `KANBAN`; trocar na tela não altera o objeto de sessão |
| C-011 / RN-011 | `smoke.mjs` + `tests/menu.test.mjs` | backend: Carla, Paulo (GESTOR) e Tânia (ADMIN) `s360ConfiguracoesSalvar(paginaInicial:'/painel-gestao')` → 0 afetadas. Tela: `destinoAposLogin(null, carla)` = `/`; `opcoesPaginaInicial(carla)` sem Painel de Gestão |
| RN-011 (telas canceladas) | `tests/menu.test.mjs` | página inicial gravada `/ajuda` ou `/solicitacoes-compras` → destino `/`; nenhuma tela cancelada nas opções |
| C-012 / RN-012 | `smoke.mjs` + `tests/perfil.test.mjs` | backend: Ana em `2026-10-30` → 1 linha `TITULAR`/`FUTURA` 01/11–15/11 com Bruno Lima; em `2026-11-05` → `ATIVA`; em `2026-11-16` → 0 linhas. Tela: `textoFerias` → selo `Ativo`/`Férias`/`Ativo`, substituto `Bruno Lima`/`Não definido`, aviso "Férias programadas de 01/11/2026 a 15/11/2026" |
| RN-012 (substituto) | `smoke.mjs` + `tests/perfil.test.mjs` | Bruno em `2026-11-05` → `SUBSTITUTO`/`ATIVA` com Ana Souza; texto "Você cobre Ana Souza até 15/11/2026" |
| C-013 / RN-014 | `smoke.mjs` | Diego: `Garantir` cria 1 linha; `Salvar` com `modoAgenda:'ANO'` → 0 afetadas e `NOME` inalterado; com valores válidos → 1 afetada e os 4 campos gravados; `Garantir` de novo não duplica |
| RN-010 | `tests/perfil.test.mjs` + `smoke.mjs` | `normalizarNome('  ', 'ana@x')` → nome da conta; 121 caracteres → recusado (e 0 afetadas no servidor); `iniciais('Ana Souza')` = `AS` |
| RN-013 | `tests/sessao.test.mjs` | `rotuloPapeis(['COORDENADOR','GESTOR'])` = `Coordenador, Gestor` |
| C-014 / RN-009 | `tests/tema.test.mjs` | URL `?tema=dark` + salvo `light` → aplica `dark`, salvo continua `light`; `aoBotao` → `light`, grava e emite aviso; aviso do painel não gera reenvio |
| RN-009 (ordem) | `tests/tema.test.mjs` | sem URL, salvo `dark`, sistema `light` → `dark`; sem URL e sem salvo → segue o sistema |
| C-015 / RN-017 | `smoke.mjs` + `tests/sessao.test.mjs` | Fernando → `CONFIGURADO = 0`, aviso = sim; Gil sem RCA → aviso = não |
| RN-001 | `tests/sessao.test.mjs` | sem sessão, `destinoSemSessao('/agenda')` = `/login` |

- **Dialeto (T-084):** smoke próprio do shim `UPDATE ... JOIN`: com a segunda
  atribuição falhando, nenhuma das duas tabelas muda.
- **Seed extra para o smoke:** nenhum; os testes que mudam estado (concluir
  tarefa, desbloquear) fazem isso no banco descartável do próprio teste.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | Sistema novo em `novo/frontend` e `novo/backend`, do zero; só o banco é compartilhado | rota `/novo` no build antigo; reescrever `frontend/` no lugar | decisão do usuário (2026-10-30); mantém o antigo intacto durante a convivência |
| D-002 | Prefixo `s360` nas SFs novas | reaproveitar ids/nomes atuais | backend do zero; nomes não colidem, as duas gerações convivem |
| D-003 | Papéis = união de `USUARIO_PAPEL` e `USUARIO_CARGO` enquanto o antigo estiver no ar | ler só a tabela nova | o antigo continua atribuindo papéis em `USUARIO_CARGO`; sem a união, um papel dado no antigo não valeria no novo. A spec 010 decide como gravar os dois na tela nova de papéis |
| D-004 | Guarda de bloqueio em toda SF por fragmento compartilhado | checar só na tela | RN-016 exige recusa no servidor em qualquer ação |
| D-005 | Preferências gravadas no formato do antigo (`/agenda`, `SEMANA`, `LISTA`) | chaves novas | a mesma linha é lida pelos dois sistemas na convivência |
| D-006 | Salvar nome + preferências num único `UPDATE ... JOIN` | duas SFs; coluna nova de nome em preferências | uma instrução é atômica no MySQL (RN-014) sem mexer em estrutura |
| D-007 | `hoje`/`agora` enviados pela tela, em Brasília | `NOW()`/`CURDATE()` no SQL | fuso do servidor incerto (L-17); simulador determinístico |
| D-008 | `schema-producao/001-acesso.mjs` só para o simulador | apontar `DDL_SOURCES` para os ~100 scripts antigos | o DDL antigo está espalhado e redefinido; o contrato está em `modelo-de-dados.md` |
| D-009 | Duas consultas na abertura (sessão + contadores) | uma SF por permissão, como hoje (8 em paralelo) | RNF-004 (≤ 3) e o teto de 300 SF/min |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Hospedagem do frontend novo: o projeto publica um build; não está confirmado como servir `novo/frontend` ao lado do antigo | sem endereço para o piloto lado a lado | T-002 confirma no sandbox antes do primeiro build. Saídas: segundo app publicado no mesmo projeto, ou um projeto Mitra só para hospedar o frontend, chamando as SFs do 60604 pelo `projectId`. O código não muda; só `VITE_MITRA_PROJECT_ID` e o destino do build |
| `USUARIO_PREFERENCIAS` sem DDL no repo | SF com coluna errada falha na publicação | T-001 lê a estrutura real com `listTablesMitra` no sandbox (só leitura) e corrige `schema-producao/001-acesso.mjs` antes de publicar |
| `UPDATE ... JOIN` em `INT_USER` recusado para usuário business | salvar falha em produção | o antigo já grava `INT_USER.NOME` por SF SQL (`atualizarDadosUsuario`); T-105 valida com um usuário business no sandbox antes de liberar |
| Usuário business sem perfil chama SF nova | `User has no profile assigned` | `add-000-perfil-acesso.mjs` acrescenta as `s360*` ao perfil `Operacao Comercial` |
| Escolha de tema compartilhada (`sales360:tema`) entre antigo e novo | trocar no novo muda o antigo | efeito desejado: é a mesma pessoa e o mesmo produto |
| Papel retirado no antigo continua no novo se estiver em `USUARIO_PAPEL` | permissão a mais | só `add-001` grava `USUARIO_PAPEL` até a spec 010; a carga inicial copia `USUARIO_CARGO` |

## Complexity Tracking

Vazio.
