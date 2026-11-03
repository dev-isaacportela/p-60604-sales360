# Spec: Acesso, perfis, menu, configurações do usuário e tema

**ID:** 001-acesso-e-perfis · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o comportamento atual já corrigido. Regras
> transversais são citadas pelo id da spec 000 (`RNT-00N`, `RNFT-00N`). Proibido
> citar stack, tabela ou componente fora do anexo **Rastreabilidade de origem**.

## Problema

Toda pessoa da força de vendas entra no sistema por esta porta: login, menu,
barra superior e Configurações. Hoje o menu esconde telas que a pessoa pode
abrir, uma tela técnica é liberada por e-mail, as preferências de agenda,
atividades e página inicial são gravadas mas ignoradas, o tema escuro está
desligado e o campo "status/substituto" de Configurações dá ao substituto acesso
permanente à carteira do titular, sem período. O suporte recebe chamados de
"salvei e não mudou" e "não vejo o menu" que são defeito, não uso errado.

## Resultado esperado

Cada pessoa entra com Google, Microsoft ou e-mail e senha de uma conta criada pela
gestão (não há autocadastro), cai na tela que escolheu como
página inicial, vê no menu exatamente as telas que pode abrir e encontra em
Configurações as preferências que de fato mudam o sistema.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Todos | Entrar, sair, trocar o tema, ajustar nome de exibição e preferências | diária (login), eventual (preferências) |
| Quem esqueceu a senha (conta com senha) | Redefinir a senha por código | eventual |
| Coordenador, diretoria, gestão, TI | Encontrar no menu as seções do seu papel | diária |

## Cenários

**C-001 — Login com Google leva à página inicial escolhida**
- **Dado que** Ana escolheu `Agenda` como página inicial e `Semana` como modo da Agenda
- **Quando** clica em `Continue com Google` e conclui a autorização na janela do Google
- **Então** entra direto na Agenda, aberta no modo Semana

**C-002 — Endereço pedido sem sessão é preservado**
- **Dado que** Bruno não tem sessão ativa
- **Quando** abre o endereço do histórico do cliente 1234 e faz login por e-mail e senha
- **Então** depois do login abre o histórico do cliente 1234, e não a página inicial

**C-003 — Janela do provedor bloqueada**
- **Dado que** o navegador de Carla bloqueia janelas pop-up
- **Quando** ela clica em `Continue com Microsoft`
- **Então** aparece `Falha no login. Tente novamente.`, o botão volta ao normal e nenhum texto técnico do provedor é exibido

**C-004 — Login não oferece criar conta**
- **Dado que** a gestão criou para Diego uma conta com e-mail e senha
- **Quando** ele abre a tela de login
- **Então** vê `Continue com Google`, `Continue com Microsoft`, os campos de e-mail e senha e `Esqueci minha senha`, e nenhuma opção de criar conta; entra com o e-mail e a senha que recebeu

**C-005 — Esqueci minha senha**
- **Dado que** Eva tem conta com senha e pediu o código em `Recuperar senha`
- **Quando** digita `12345` (5 dígitos) e vê `Digite o código de 6 dígitos`; depois informa o código correto, `Nova senha` = `abc12345` e `Confirmar nova senha` = `abc12346`
- **Então** vê `As senhas não conferem`; corrigindo, volta ao login com `Senha redefinida. Entre com a nova senha.` e o e-mail já preenchido

**C-006 — Usuário bloqueado perde a sessão na próxima ação**
- **Dado que** Fábio está logado e a coordenação desativou o acesso dele às 10h00
- **Quando** às 10h01 ele abre qualquer tela ou aperta qualquer botão
- **Então** nenhum dado é devolvido, a sessão é encerrada e o login mostra `Seu acesso ao sistema foi desativado. Procure seu gestor.`

**C-007 — Menu igual às permissões**
- **Dado que** Gil tem os papéis DIRETORIA e COORDENADOR (com cadastro de coordenador ativo)
- **Quando** abre o sistema
- **Então** o menu mostra a seção Coordenador (3 itens) e a seção Diretoria com `Papéis de Usuários` e `Gestão Coordenadores`, e `Titulares de Clientes` aparece uma única vez

**C-008 — Tela restrita aberta pelo endereço**
- **Dado que** Ana é vendedora
- **Quando** digita o endereço de `Papéis de Usuários`
- **Então** vê `Acesso restrito` e `Esta tela está disponível apenas para Diretoria e TI.`, e nenhum dado é carregado (conforme RNT-002)

**C-009 — Contador de atividades atualiza na hora**
- **Dado que** o menu mostra `Atividades` com contador 3
- **Quando** Ana conclui uma atividade
- **Então** o contador passa a 2 sem esperar o ciclo de 5 minutos

**C-010 — Preferência de exibição de Atividades aplicada**
- **Dado que** Bruno salvou `Exibição padrão de Atividades` = `Kanban`
- **Quando** abre Atividades pelo menu
- **Então** a tela abre no Kanban; ele pode trocar para Lista na tela sem mudar a preferência salva

**C-011 — Página inicial cancelada cai no Dashboard**
- **Dado que** Carla tinha `Painel de Gestão` como página inicial, e essa tela foi cancelada em 2026-11-03
- **Quando** faz login
- **Então** entra no Dashboard, e em Configurações o campo `Página inicial` mostra `Dashboard`

**C-012 — Férias aparecem em Configurações, sem edição**
- **Dado que** a coordenação cadastrou férias de Ana de 01/11/2026 a 15/11/2026 com Bruno como substituto
- **Quando** em 30/10/2026 Ana abre Configurações
- **Então** vê o selo `Status: Ativo`, o card `Substituto em Férias` = `Bruno Lima` e o aviso "Férias programadas de 01/11/2026 a 15/11/2026"; em 05/11/2026 o selo é `Status: Férias`; nenhum campo permite alterar status ou substituto

**C-013 — Salvar configurações é tudo ou nada**
- **Dado que** Diego altera nome de exibição e página inicial
- **Quando** clica `Salvar Configurações` e a gravação falha
- **Então** vê `Falha ao salvar configurações.` e nenhum dos dois campos foi alterado

**C-014 — Tema segue o painel do workspace sem gravar**
- **Dado que** Eva escolheu tema claro no botão do próprio sistema e abre o sistema dentro do painel do workspace, que está em escuro
- **Quando** a aba abre
- **Então** o sistema aparece escuro; fora do painel, no navegador comum, volta a abrir claro

**C-015 — Usuário novo sem configuração comercial**
- **Dado que** a gestão criou a conta de Fábio hoje e ele ainda não tem RCA, escopo nem carteira
- **Quando** entra no Dashboard
- **Então** vê "Seu acesso ainda não foi configurado. Peça à gestão o vínculo de RCA, escopo e carteira." em vez de números zerados

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE oferecer login por Google, Microsoft e e-mail/senha | C-001, C-003; espaços no início e fim do e-mail e da senha são ignorados | must |
| RF-002 | O sistema DEVE oferecer na tela de login só os caminhos de entrada (Google, Microsoft, e-mail e senha) e a recuperação de senha, sem criação de conta | C-004; nenhum botão, link ou endereço do sistema leva a um cadastro de conta | must |
| RF-003 | O sistema DEVE permitir redefinir a senha de conta com senha por código de 6 dígitos enviado ao e-mail | C-005; RN-003; erro de envio mostra `Não foi possível enviar o código. Confira o email e tente novamente.` | must |
| RF-004 | O sistema DEVE redirecionar todo endereço sem sessão para o login e, após o login, abrir o endereço pedido ou a página inicial | C-002, C-001, C-011 | must |
| RF-005 | O sistema DEVE recusar no servidor qualquer ação de usuário bloqueado e encerrar a sessão dele | C-006 | must |
| RF-006 | O sistema DEVE montar o menu a partir das permissões do usuário (RN-005), sem item duplicado | C-007; nenhuma tela permitida fica fora do menu | must |
| RF-007 | O sistema DEVE mostrar contadores de `Atividades` (pendentes) e `Alertas` (não lidos) no menu | C-009; recarga a cada 5 minutos e logo após ação que muda o número | must |
| RF-008 | O sistema DEVE bloquear toda tela restrita com uma mensagem padrão | C-008; mesma estrutura de mensagem em todas as telas restritas | must |
| RF-009 | O sistema DEVE permitir editar nome de exibição, modo padrão da Agenda, exibição padrão de Atividades e página inicial | C-013; salvar grava os 4 campos de uma vez | must |
| RF-010 | O sistema DEVE aplicar as preferências: página inicial no login, modo da Agenda ao abrir a Agenda, exibição de Atividades ao abrir Atividades | C-001, C-010, C-011 | must |
| RF-011 | O sistema DEVE mostrar em Configurações o status de férias e o substituto a partir do cadastro único de férias, só para leitura | C-012 | must |
| RF-012 | O sistema DEVE oferecer tema claro e escuro, sincronizado com o painel do workspace (RN-009) | C-014; RNFT-004 | must |
| RF-013 | O sistema DEVE mostrar a marca no topo do menu lateral e, no rodapé do menu, as iniciais e o nome do usuário, o botão de tema e Sair; Configurações é item do menu. No celular, uma barra superior com ☰, marca e iniciais (layout do design system Benenutri) | Iniciais do nome de exibição (Ana Souza → "AS") no rodapé do menu e na barra do celular | must |
| RF-014 | O sistema DEVE avisar o usuário sem configuração comercial em vez de mostrar telas zeradas | C-015 | should |
| RF-015 | O sistema DEVE mostrar em Configurações a conexão com o Google Agenda | Regras e mensagens na spec 003 | must |

## Requisitos não-funcionais

Valem RNFT-002, RNFT-003, RNFT-004, RNFT-006 e RNFT-007. Específicos:

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | A sessão sobrevive a recarregar a página e a abrir nova aba, até o usuário clicar `Sair` | Recarregar com F5 mantém o usuário logado |
| RNF-002 | O token de login chega fora do endereço visível e é apagado da barra de endereço logo após a leitura | Após o login, o endereço não contém o token |
| RNF-003 | A aba abre já no tema certo, sem piscar o tema errado | Abrir em escuro não mostra fundo claro nem por um instante |
| RNF-004 | Menu e contadores fazem no máximo 3 consultas na abertura do sistema | Contagem de consultas no simulador |

## Entidades do domínio

- **Usuário** — conta de acesso (e-mail, nome da conta). Quem entra por e-mail e senha usa conta criada pela gestão; não há autocadastro. Tem papéis (RNT-001), nome de exibição, preferências e pode estar bloqueado.
- **Preferências do usuário** — modo padrão da Agenda (Dia, Semana, Mês), exibição padrão de Atividades (Lista, Kanban) e página inicial.
- **Bloqueio de acesso** — marca, feita pela coordenação ou diretoria (spec 010), que impede o usuário de usar o sistema.
- **Férias** — cadastro único de RNT-010, mantido na spec 010; aqui só é exibido.
- **Escolha de tema** — claro ou escuro, guardada no navegador quando a pessoa usa o botão do sistema.

## Regras de negócio

- **RN-001 — Identidade.** O usuário é o da sessão (RNT-012). `Sair` encerra a sessão e volta ao login. Sem sessão, todo endereço leva ao login.
- **RN-002 — Mensagens de login.** Falha de Google ou Microsoft (janela fechada, bloqueada ou recusada) → `Falha no login. Tente novamente.`. Falha de e-mail/senha → `Erro na autenticação`. Código errado ou vencido → `Código inválido ou expirado`. Nunca se exibe o texto devolvido pelo provedor (RNFT-007).
- **RN-003 — Código de recuperação de senha.** Tem exatamente 6 dígitos numéricos; menos que isso mostra `Digite o código de 6 dígitos` sem consultar o servidor. Quem entra por Google ou Microsoft não tem senha no sistema. A tela de login não cria conta: contas com senha são criadas pela gestão.
- **RN-004 — Destino após o login.** Endereço pedido antes do login, se existir e for permitido; senão a página inicial do usuário, se ele ainda puder abri-la; senão o Dashboard.
- **RN-005 — Menu por permissão** (RNT-002). Seções e itens:
  - **Principal (todos):** Dashboard, Agenda, Clientes, Atividades (contador), Mix Builder, Analytics, Comparativo, Alertas (contador). `Direcionamento Semanal` para coordenador ativo, DIRETORIA e ADMIN.
  - **Coordenador (coordenador com cadastro ativo):** Gestão de Carteira, Titulares de Clientes, Férias de Vendedores.
  - **Diretoria (DIRETORIA, ADMIN):** Papéis de Usuários, Gestão Coordenadores e Titulares de Clientes (só se o item não estiver na seção Coordenador).
  - **Gestão:** Executivas de Venda (coordenador ativo, DIRETORIA, ADMIN); Governança RCA, BUs e Vendedores, Escopo Usuários (GESTOR, ADMIN). Não há tela só da TI.
  - **Final:** Configurações. **Rodapé:** Sair.
  Ajuda, Suporte, Painel do desenvolvedor, Notas de versão e Solicitações de compras foram canceladas e não aparecem no menu, no rodapé nem como tela restrita; a janela de novidades da versão não abre ao entrar. Seção sem itens não aparece. Papéis acumulam (RNT-001): quem tem dois papéis vê as duas seções.
- **RN-006 — Coordenador.** É coordenador quem tem cadastro de coordenador **ativo** ligado ao seu login (spec 010); o papel COORDENADOR sem esse cadastro não mostra a seção Coordenador do menu (RN-005), e quem abrir uma dessas telas pelo endereço vê a mensagem de acesso restrito.
- **RN-007 — Atualização do menu.** Permissões e contadores são relidos ao abrir o sistema, a cada 5 minutos e logo após ação que altere um contador. A autorização de cada tela é sempre conferida no servidor, então um papel retirado vale na próxima ação, mesmo antes de o menu mudar.
- **RN-008 — Contadores.** `Atividades` = atividades do usuário com status A Fazer ou Em andamento (spec 004). `Alertas` = alertas não lidos do usuário (spec 008). Contador zero não aparece.
- **RN-009 — Tema.** Ao abrir, vale, nesta ordem: o tema informado pelo painel do workspace na abertura da aba; a escolha salva pela pessoa no botão do sistema; a preferência do sistema operacional. Aviso de tema vindo do painel é aplicado e **não** é salvo. Trocar no botão do sistema aplica, salva e avisa o painel. O ícone do botão reflete o tema que está na tela, não o salvo. Enquanto ninguém escolheu e o painel não avisou, o sistema acompanha a troca de tema do sistema operacional.
- **RN-010 — Nome de exibição.** Texto de até 120 caracteres; vazio volta ao nome da conta. Usado na saudação do Dashboard, nas iniciais do avatar e nas listas de responsáveis.
- **RN-011 — Página inicial.** Opções: Dashboard, Agenda, Clientes, Atividades, Mix Builder e Analytics, as mesmas para todos. Padrão: Dashboard. Telas canceladas (Ajuda, Suporte, Solicitações, Painel de Gestão) não são opção; quem tem uma delas gravada como página inicial entra no Dashboard (RN-004). Modo da Agenda padrão: Semana. Exibição de Atividades padrão: Lista.
- **RN-012 — Configurações de férias só leitura.** O selo mostra `Status: Férias` quando há férias ATIVAS do usuário como titular, e `Status: Ativo` nos outros casos. `Substituto em Férias` mostra o nome do substituto das férias ativas ou da próxima férias FUTURA; sem nenhuma, `Não definido`. Havendo férias futuras, aparece "Férias programadas de dd/mm/aaaa a dd/mm/aaaa". Se o usuário é substituto de alguém em férias ativas, aparece "Você cobre <nome> até dd/mm/aaaa". Status e substituto não são editáveis aqui (RNT-010).
- **RN-013 — Cards de Configurações.** `Nome` (nome de exibição), `Papéis` (lista real, ex.: "Coordenador, Gestor"), `Substituto em Férias` e o identificador do usuário (`ID do usuário: X`, para o suporte).
- **RN-014 — Salvar Configurações.** Grava nome e preferências numa única ação: `Configurações atualizadas com sucesso.` ou `Falha ao salvar configurações.` sem gravação parcial (RNT-013).
- **RN-015 — Tela restrita.** Título `Acesso restrito` e texto `Esta tela está disponível apenas para <perfis>.`, com os perfis da RN-005. Nenhum dado da tela é consultado.
- **RN-016 — Bloqueio.** Usuário bloqueado não recebe dados em nenhuma ação; a sessão dele é encerrada e o login mostra `Seu acesso ao sistema foi desativado. Procure seu gestor.`.
- **RN-017 — Usuário sem configuração.** Sem RCA vinculado e sem escopo ativo, as telas de vendas e carteira mostram o aviso de C-015 no lugar dos números. Coordenador, diretoria, gestão e TI não recebem esse aviso.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-004 | Página inicial = Agenda, sem endereço pedido → destino Agenda; modo Semana aplicado | regra de tela |
| C-002 | Endereço pedido "histórico do cliente 1234" antes do login → destino após login é esse endereço | regra de tela |
| C-003 / RN-002 | Provedor devolve um erro com texto técnico em inglês → tela mostra `Falha no login. Tente novamente.` e não o texto do provedor | regra de tela |
| C-004 / RF-002 | Tela de login traz `Continue com Google`, `Continue com Microsoft`, e-mail/senha e `Esqueci minha senha`, e nenhum botão ou link de criar conta | regra de tela |
| RN-003 | Código de recuperação "12345" → `Digite o código de 6 dígitos` sem consulta; código "1234567" não é aceito no campo | regra de tela |
| C-005 | Nova senha "abc12345" e confirmação "abc12346" → `As senhas não conferem`; sucesso → login com `Senha redefinida. Entre com a nova senha.` | regra de tela |
| C-006 / RN-016 | Usuário bloqueado consulta a carteira → zero linhas e resposta "acesso bloqueado"; desbloqueado → 40 linhas | regra de negócio |
| C-007 / RN-005 | Papéis {DIRETORIA, COORDENADOR ativo} → seções Principal, Coordenador (4 itens), Diretoria (5 itens, sem Titulares), Final; papéis {VENDEDOR} → só Principal (8 itens) e Final | regra de tela |
| RN-005 (permissões) | Consulta de permissões devolve para GESTOR: Gestão = 3 itens; para TI: Gestão = 4 itens, nenhum só da TI; para nenhum papel aparecem Ajuda, Suporte, Painel Dev, Notas de Versão ou Solicitações; seção Final = só Configurações e rodapé = só Sair | regra de negócio |
| C-008 / RN-015 | Vendedora abre Papéis de Usuários → tela mostra `Esta tela está disponível apenas para Diretoria e TI.` e não consulta nada; a recusa no servidor é testada na spec 010 | regra de negócio |
| RN-006 | Papel COORDENADOR sem cadastro ativo → permissão de coordenador = não; com cadastro ativo → sim | regra de negócio |
| C-009 / RN-008 | 2 A Fazer + 1 Em andamento + 4 Concluídas → contador 3; após concluir uma → 2 | regra de negócio |
| RN-007 | Contadores relidos após 5 min e imediatamente após a ação de concluir atividade | regra de tela |
| C-010 | Preferência Kanban → Atividades abre em Kanban; trocar para Lista na tela não altera a preferência gravada | regra de tela |
| C-011 / RN-011 | Página inicial gravada = Painel de Gestão (cancelada) → destino Dashboard e gravação recusada, para qualquer papel; lista de opções sem Painel de Gestão | regra de negócio |
| RN-011 (telas canceladas) | Página inicial gravada = Ajuda ou Solicitações → destino Dashboard; nenhuma tela cancelada na lista de opções | regra de negócio |
| C-012 / RN-012 | Férias de Ana 01/11–15/11 com Bruno: em 30/10 → status Ativo, substituto "Bruno Lima", aviso de férias programadas; em 05/11 → status Férias; em 16/11 → status Ativo, substituto "Não definido" | regra de negócio |
| RN-012 (substituto) | Em 05/11, Configurações de Bruno mostra "Você cobre Ana Souza até 15/11/2026" | regra de negócio |
| C-013 / RN-014 | Falha na gravação das preferências → nome de exibição também não muda; sucesso grava os 4 campos | regra de negócio |
| RN-010 | Nome "  " (só espaços) → volta ao nome da conta; 121 caracteres → recusado; "Ana Souza" → avatar "AS" | regra de tela |
| RN-013 | Usuário com COORDENADOR e GESTOR → card `Papéis` = "Coordenador, Gestor" | regra de negócio |
| C-014 / RN-009 | Painel avisa escuro na abertura, escolha salva = claro → tela escura e escolha salva continua claro; clique no botão → claro, salvo e aviso enviado ao painel; aviso do painel não é reenviado ao painel | regra de tela |
| RN-009 (ordem) | Sem aviso do painel, salvo = escuro, sistema operacional = claro → escuro; sem aviso e sem escolha → segue o sistema operacional | regra de tela |
| C-015 / RN-017 | Usuário sem RCA e sem escopo → Dashboard devolve "não configurado"; coordenador sem RCA → não recebe o aviso | regra de negócio |
| RN-001 | Após `Sair`, abrir a Agenda leva ao login | regra de tela |

Verificação manual:
- [ ] RN-005 — menu em 360 px abre pelo botão ☰ e fecha ao escolher um item
- [ ] RF-013 — sem busca, sem sino e sem ajuda; iniciais no rodapé do menu e na barra do celular
- [ ] RN-005 — ao entrar não aparece janela de novidades da versão
- [ ] RNF-003 — abrir em tema escuro sem piscar claro; tema acompanha o painel do workspace
- [ ] RNFT-004 — login e Configurações em tema escuro sem cor quebrada

## Fora de escopo

- [ ] Conexão com o Google Agenda em Configurações (conectar, trocar agenda, desconectar, erros): spec 003.
- [ ] Cadastro, edição e encerramento de férias, papéis, coordenadores e bloqueio de executivas: spec 010.
- [ ] Busca global e sino na barra superior: saem da tela (decisão de 2026-10-30, spec 000). Busca de cliente fica em Clientes e alertas no menu `Alertas`.
- [ ] Janela de novidades da versão ao entrar, Ajuda, Suporte, Painel do desenvolvedor e Notas de versão: cancelados em 2026-10-30 (spec 012). Solicitações de compras: cancelada em 2026-10-30 (spec 011).
- [ ] Agenda dos Vendedores, Análise Diretoria, Faturamento e Gestão de Metas: canceladas em 2026-11-03 (specs 003 e 010). Endereço antigo dessas telas, ou página inicial gravada com uma delas, leva ao Dashboard (RN-011).
- [ ] Acomp. Semanal Admin, Acomp. Semanal, Painel de Validação (spec 006), Painel de Gestão e Gestão Cadastros (spec 010): canceladas em 2026-11-03. Endereço antigo dessas telas leva ao Dashboard, como as demais canceladas.
- [ ] Autocadastro de conta ("Criar conta" com código de verificação): não existe; contas com senha são criadas pela gestão.
- [ ] Filtro de escopo do topo das telas: regra RNT-003, implementado em cada módulo.
- [ ] Login com outros provedores (Apple, SSO corporativo) e autenticação em dois fatores.
- [ ] Lembrar o filtro de escopo depois de sair do sistema (RNT-003: ao entrar de novo, volta ao padrão do perfil).
- [ ] Trocar o e-mail ou excluir a própria conta pelo sistema.

## Pendências

- [x] Decidido em 2026-10-30: só o coordenador cadastra férias (diretoria também, conforme spec 010).
- [x] Decidido em 2026-10-30: gerar a lista das marcações atuais para a coordenação recadastrar com período em Férias de Vendedores; depois disso a marcação antiga deixa de valer.
- [x] Decidido em 2026-10-30: ninguém cria conta pelo sistema; entra-se com Google, Microsoft ou e-mail e senha de conta criada pela gestão/ADMIN, e "Esqueci minha senha" continua para contas com senha.
- [x] Decidido em 2026-10-30: Ajuda, Suporte, Painel do desenvolvedor, Notas de versão (spec 012) e Solicitações de compras (spec 011) foram canceladas e saem do menu, do rodapé, das telas restritas, das opções de página inicial e da janela de novidades.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminhos de erro (C-003, C-005, C-006, C-008, C-013)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Modo da Agenda, exibição de Atividades e página inicial são gravados e ignorados; login sempre vai ao Dashboard | Preferências aplicadas (RF-010, RN-004) | manual seção 2, "Comportamento atual conhecido"; seção 15 "Preferências" |
| `Status do Funcionário` e `Substituto` editáveis em Configurações; o substituto marcado ali vê a carteira do titular para sempre, sem período | Só leitura, a partir do cadastro único de férias (RN-012, RNT-010) | `ConfiguracoesUsuarioPage.tsx:540-556`; `backend/migrations/update-sf-minhacarteiraclientes-1792674223.sql:24-28` |
| Card `Substituto em Férias` mostra `Usuário #ID` | Mostra o nome (RN-012) | `ConfiguracoesUsuarioPage.tsx:518` |
| Cards `Tipo de Acesso` = "Usuário" e `Perfil` = "Usuário autenticado", fixos | Card `Papéis` com os papéis reais (RN-013) | `ConfiguracoesUsuarioPage.tsx:444-446` |
| `Página inicial` oferece `Painel de Gestão` a todos | Painel de Gestão cancelado; as opções são as mesmas para todos (RN-011) | `ConfiguracoesUsuarioPage.tsx:74-82` |
| Salvar em duas partes; a segunda falha e a primeira fica gravada | Uma ação, tudo ou nada (RN-014) | manual seção 2; `ConfiguracoesUsuarioPage.tsx:407-435` |
| Coordenador com papel DIRETORIA não vê a seção Coordenador; DIRETORIA não vê Análise, Faturamento e Metas | Menu = permissões, papéis acumulam (RN-005) | `Layout.tsx:118-134`; manual seção 1 |
| Acomp. Semanal Admin e Painel de Validação liberados pelo e-mail de uma pessoa | As duas telas foram canceladas em 2026-11-03 (RN-005) | `Layout.tsx:76-79`; pendências item 5 |
| Permissão de coordenador aceita cargo com grafia parecida ("CORDENADOR") ou o e-mail da TI | Coordenador = cadastro ativo (RN-006) | `backend/add-painel-coordenador-dashboard.mjs:249-252` |
| Bloqueio de executiva só é checado pelo menu a cada 5 minutos; as telas continuam devolvendo dados | Bloqueio conferido no servidor em toda ação (RN-016) | `Layout.tsx:52-58` |
| Erro do Google/Microsoft/e-mail mostra o texto técnico do provedor quando existe | Mensagens fixas (RN-002) | `LoginPage.tsx:64,90,113` |
| Endereço pedido antes do login é perdido | Abre o endereço pedido (RN-004) | `App.tsx:46-52` |
| Login oferece `Criar conta`: qualquer e-mail cria conta com código de verificação | Sem autocadastro; contas com senha são criadas pela gestão (RF-002, C-004) | manual seção 2; `LoginPage.tsx:121-125` |
| Menu e rodapé com Ajuda, Suporte, Painel Dev, Notas de Versão e Solicitações; janela de novidades ao entrar | Saem do sistema: telas canceladas em 2026-10-30 (RN-005) | `Layout.tsx` (itens de menu e rodapé); specs 011 e 012 |
| Tema escuro desligado: sistema sempre claro e não segue o painel | Tema claro/escuro ligado e sincronizado (RN-009, RNFT-004) | `lib/temaLigado.ts:2`; `docs/arquitetura.md` "Tema e estilos" |
| Avatar com as letras "RF" fixas | Iniciais do usuário (RF-013) | `Layout.tsx:260` |
| Campo de busca e sino da barra superior sem função | Removidos (decisão de 2026-10-30) | manual seção 1; `Layout.tsx:239-248` |
| Cada tela restrita tem um texto de bloqueio diferente | Mensagem padrão (RN-015) | 12 textos distintos em `frontend/src/pages/*` |
| Contadores só atualizam a cada 5 minutos | Também logo após a ação (RN-007) | manual seção 6; `Layout.tsx:100-101` |
| Usuário sem configuração comercial vê telas zeradas | Aviso explícito (RN-017) | manual seção 15 "Entrei e o sistema está vazio" |

---

## Anexo — Rastreabilidade de origem

**Rotas atuais cobertas:** `/login` (inclui `?bloqueado=1`), `/configuracoes` (exceto o bloco Google Agenda, spec 003), moldura do app (menu lateral, barra superior) em todas as rotas, redirecionamento de rota desconhecida para `/`.

**Páginas e arquivos atuais:** `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/ConfiguracoesUsuarioPage.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/mitra-auth.ts` (sessão em `localStorage` chave `mitra-session`; token em `#tokenMitra`/`#backURLMitra`/`#integrationURLMitra`), `frontend/src/lib/theme.ts`, `frontend/src/hooks/useTema.ts`, `frontend/src/lib/temaLigado.ts`, `frontend/src/main.tsx`. Login usa as APIs da plataforma `loginWithGoogleMitra`, `loginWithMicrosoftMitra`, `emailLoginMitra`, `sendPasswordResetCodeMitra`, `validatePasswordResetCodeMitra`, `resetPasswordMitra` (não são SFs); `emailSignupMitra`, `emailVerifyCodeMitra` e `emailResendCodeMitra` deixam de ser usadas (sem autocadastro). Tema: protocolo `postMessage({ tipo: 'mitra-tema', tema: 'light'|'dark' })` com o Meu painel (projeto 61812), `?tema=` na URL, escolha em `localStorage` `sales360:tema`.

| RF / RN | SFs atuais (alias · id) | Tabelas |
|---|---|---|
| RN-001, RN-010, RN-013 | `dadosUsuarioLogado` · 28 | `INT_USER` (`NOME`, `DESCR`), `FUNCIONARIOS` (`NOME`) |
| RF-009, RN-011, RN-014 | `detalharConfiguracoesUsuario` · 64; `atualizarDadosUsuario` · 66; `atualizarPreferenciasUsuario` · 67 | `FUNCIONARIOS`, `USUARIO_PREFERENCIAS` (`MODO_AGENDA`, `EXIBICAO_TAREFAS`, `PAGINA_INICIAL`), `INT_USER.NOME` |
| RN-012 (hoje editável) | `listarUsuariosSubstitutos` · 65 — **sai** (status/substituto deixam de ser editáveis) | `FUNCIONARIOS.STATUS`, `FUNCIONARIOS.ID_SUBSTITUTO` (legado, deixa de ser lido); fonte nova: `FERIAS_VENDEDOR` (spec 010) |
| RN-005, RN-006, RN-015 | `painelGestaoPermissao` · 29 (GESTOR/ADMIN); `painelCoordenadorPermissao` · 153; `gestaoMetasDiretoriaPermissao` · 167 (devolve `CARGO_ATUAL`); `suportePainelPermissao` · 236 (Painel Dev, Notas de Versão) — **aposentar** (spec 012 cancelada); `solicitacoesComprasPermissaoGestao` · 269 — **aposentar** (spec 011 cancelada); `gestaoAcessoExecutivasPermissao` · 383; gates de página também em `gestaoCoordenadoresPermissao` · 172 e `gestaoCargosUsuariosPermissao` · 204 (spec 010) | `USUARIO_CARGO`, `COORDENADORES`, `INT_USER.ISDEV` |
| RN-016 | `meuAcessoBloqueado` · 386 | `USUARIO_BLOQUEIO` |
| RN-008 (contadores) | `contarTarefasPendentes` · 12 (spec 004); `alertasInteligentesContarNaoLidos` · 134 (spec 008) | `TAREFAS`, `ALERTAS_INTELIGENTES` |
| RF-015 | `googleAgendaStatus` · 209, `googleOAuthAppConfig` · 364 e demais SFs Google (spec 003) | `GOOGLE_AGENDA_CONFIG` |

SFs deste módulo sem uso a aposentar: `listarUsuariosSubstitutos` (65), que perde a função na reconstrução; `suportePainelPermissao` (236) e `solicitacoesComprasPermissaoGestao` (269), cujas telas foram canceladas.
