# Base de Conhecimento (RAG) — Sales 360 · Comercial Externo · Benenutri

Base de conhecimento da **IA da central de chamados** do Sales 360. Escrita a partir do código atual do sistema (outubro/2026), do ponto de vista do **usuário**: telas, botões, mensagens literais, regras de negócio, limitações conhecidas e soluções.

## Instruções para a IA de chamados

1. **Responda em português**, de forma objetiva, com passo a passo quando a pergunta for "como fazer".
2. **Cite os nomes exatos** de menus, botões e mensagens como aparecem entre crases neste documento (ex.: `+ Nova agenda`, `Concluir visita`).
3. **Antes de diagnosticar números**, confirme: qual tela, qual período/filtro, qual escopo (Meu painel / Time inteiro / ...) e se o usuário está comparando bruto com líquido.
4. **O perfil importa:** muitas respostas dependem de o usuário ser vendedor, coordenador, diretoria ou gestão. Se não souber, pergunte quais menus ele vê.
5. Itens marcados como **"comportamento atual conhecido" / "limitação conhecida"** são o funcionamento atual do sistema: explique, ofereça o contorno quando houver e sugira registrar em **Suporte** se impactar o trabalho.
6. **Não invente** funcionalidades, telas ou prazos que não estejam aqui. Se a dúvida não estiver coberta, oriente a abrir chamado em **Suporte** (botão no rodapé do menu) com tela, passos, mensagem literal, print e horário.
7. **Não peça senhas** nem dados de acesso.
8. Ações administrativas (papéis GESTOR/ADMIN, telas restritas à TI, correção de RCA, criação de BU/escopo) devem ser **encaminhadas à gestão ou à TI** — o usuário final não consegue fazê-las.

## Glossário rápido

- **RCA:** código do vendedor no ERP Winthor/TOTVS.
- **BU:** unidade de negócio = filial + departamento do ERP.
- **Escopo:** BU + filial + seção em que o vendedor atua.
- **Carteira:** clientes atribuídos ao vendedor.
- **Faturamento líquido:** bruto − devoluções.
- **Semana operacional:** sexta a quinta, recortada no mês (acompanhamento semanal).
- **B/W:** variação percentual em relação ao mesmo período do mês anterior ("Sem base" = mês anterior zerado).
- **Temperatura:** score 0–100 do cliente (Quente ≥ 70, Morno 40–69, Frio < 40).
- **Curva:** classificação A/B/C/D do cliente na carteira.
- **Check-in / check-out:** início e encerramento da visita (o check-out exige relato e é o que conta na meta).
- **Prospect:** empresa que ainda não é cliente do ERP.

## Sumário

1. Visão Geral do Sales 360 — Perfis, Menu e Filtro de Escopo
2. Login, Senha e Configurações do Usuário
3. Dashboard (tela inicial)
4. Agenda e Visitas
5. Clientes — Minha Carteira, Clientes Disponíveis e Histórico do Cliente
6. Atividades (Tarefas / Follow-ups)
7. Mix Builder — Simulador de Margens e Propostas
8. Analytics, Metas e Acompanhamento Semanal
9. Alertas Inteligentes e Prospecção
10. Solicitações de Compras
11. Suporte (Reportar bug) e Ajuda (Manual do vendedor)
12. Painéis de Gestão e Diretoria
13. Governança: Papéis, RCA, BUs, Escopo, Coordenadores, Carteira e Férias
14. Rotinas Automáticas e Integrações
15. Solução de Problemas — Diagnóstico por Sintoma

---

## 1. Visão Geral do Sales 360 — Perfis, Menu e Filtro de Escopo

### O que é o sistema

O **Sales 360 — Comercial Externo** é o CRM da força de vendas externa da **Benenutri**. Ele reúne em um só lugar:

- **Agenda de visitas** (clientes, prospecção, reuniões internas, deslocamentos) com check-in/check-out e relato;
- **Carteira de clientes** com temperatura, curva ABC, alertas e histórico de compras;
- **Atividades** (follow-ups e pendências);
- **Mix Builder** (propostas com custo real, margem e PDF);
- **Analytics** (faturamento líquido, metas, produtos, clientes, devoluções) e **Acompanhamento Semanal**;
- **Alertas inteligentes** e **Prospecção**;
- Camadas de **coordenação** (agenda da equipe, carteira, férias, metas) e **diretoria** (análise, faturamento, metas por BU, papéis);
- Integração com o **ERP Winthor/TOTVS** (vendas, devoluções, clientes, RCAs, custos) e com o **Google Agenda**.

Funciona no navegador (computador e celular; no celular o menu abre pelo botão ☰).

### Perfis de usuário

| Perfil | O que faz |
|---|---|
| **Vendedor** (padrão) | Agenda, carteira, atividades, mix, analytics e alertas **dos próprios clientes**. |
| **Coordenador** | Tudo do vendedor + visão da **equipe** (filtro de escopo), **Agenda dos Vendedores**, **Gestão de Carteira**, **Férias de Vendedores** e **redistribuição de metas** (Analytics → Metas). |
| **Diretoria** | Visão **global** (todos os coordenadores), **Papéis de Usuários**, **Gestão Coordenadores**; acompanha metas em modo leitura. |
| **Gestor / Admin** | Seção **Gestão**: Acomp. Semanal, Painel de Gestão, Governança RCA, BUs e Vendedores, Escopo Usuários, Gestão Cadastros. Atribuídos pela TI. |
| **TI** | Telas técnicas: Acomp. Semanal Admin, Painel de Validação, Painel Dev, Solicitações de Compras (em liberação). |

### Menu lateral

**Principal (todos):** Dashboard · Agenda · Clientes · Atividades (contador de pendentes) · Mix Builder · Analytics · Alertas (contador vermelho de não lidos). *Solicitações* aparece só para quem tem liberação.

**Coordenador** (coordenadores que não são Diretoria): Agenda dos Vendedores · Gestão de Carteira · Férias de Vendedores.

**Diretoria** (Diretoria/Admin): Papéis de Usuários · Gestão Coordenadores. Para Admin aparecem também Análise Diretoria, Faturamento e Gestão de Metas.
> ⚠️ Usuários com cargo exatamente **DIRETORIA** não veem no menu *Análise Diretoria*, *Faturamento* e *Gestão de Metas*, embora tenham permissão: as telas abrem pelo endereço direto (`/analise-diretoria`, `/faturamento`, `/gestao-metas`). Comportamento atual conhecido.

**Gestão** (Gestor/Admin): Acomp. Semanal · Painel de Gestão · Governança RCA · BUs e Vendedores · Escopo Usuários · Gestão Cadastros (+ itens técnicos para a TI).

**Final:** Ajuda · Configurações. **Rodapé:** Suporte · Sair.

Barra superior: logo, campo de busca, sino, ajuda (?), configurações (engrenagem). O campo de busca e o sino do topo **ainda não têm função**; para buscar clientes use a tela Clientes e para alertas use o menu Alertas.

As permissões e os contadores do menu são recarregados **a cada 5 minutos**. Depois de mudar o papel de alguém, peça para a pessoa recarregar a página (F5).

### Filtro de escopo (Dashboard, Agenda, Clientes, Atividades, Alertas, Analytics, Acompanhamento)

Aparece no topo das telas para coordenadores, diretoria e vendedores com mais de um escopo. Vendedor comum não vê o filtro e enxerga só os próprios dados.

| Modo | Rótulo | Quem usa | Padrão para |
|---|---|---|---|
| ME | **Meu painel** | todos | vendedor |
| TEAM | **Time inteiro** | coordenador | coordenador |
| SELLER | **Vendedor específico** | coordenador/diretoria | — |
| GLOBAL | **Todos os coordenadores** / "Coordenador: X" | diretoria | diretoria |

- Recortes adicionais: **Todas as filiais**, **Todos os departamentos**, **Todas as seções**.
- Cascata: trocar coordenador limpa vendedor/filial/departamento/seção; trocar filial limpa departamento e seção.
- **O filtro não é memorizado**: ao reabrir a tela volta ao padrão do perfil.
- Em "Time inteiro"/visão global, os dados aparecem agregados e o vendedor pode ser rotulado "Coordenador".
- Vendedor com vários departamentos usa o filtro para ver um departamento por vez (sem seleção vê todos).
- Diretoria: após escolher um coordenador, a lista "Vendedor específico" ainda mostra todos os vendedores; escolher um vendedor de outro coordenador pode deixar a tela vazia.

### Regras centrais (resumo)

- **Venda conta para o vendedor** quando o cliente está na **carteira** dele **e** a venda é de uma filial/departamento/seção do **escopo** dele.
- **Faturamento líquido** = bruto − devoluções.
- **Meta de visitas:** 16/semana (vendedor), 8/semana (coordenador), segunda a sexta, só itens **concluídos** (check-out com relato).
- **Meta de faturamento:** diretoria define por BU/UF → coordenador redistribui por vendedor.
- **Semana operacional** (acompanhamento semanal): sexta a quinta, recortada no mês.
- **Horário:** Brasília (America/São Paulo). Moeda: R$.

---

## 2. Login, Senha e Configurações do Usuário

> Módulo: acesso ao sistema e preferências pessoais.
> Rotas: `/login` e `/configuracoes` (ícone de engrenagem no topo ou item "Configurações" no menu).

---

### Como entrar no sistema (login)

A tela de login (`Entrar` — "Escolha como deseja acessar") oferece três formas de acesso:

1. **`Continue com Google`** — abre uma janela pop-up do Google. Enquanto aguarda, o botão mostra `Aguarde...`.
2. **`Continue com Microsoft`** — mesma lógica, com conta Microsoft.
3. **E-mail e senha** — abaixo do separador `Ou entre com e-mail`: campos `Email` e `Senha`, botão `Entrar` (mostra `Entrando...`).

Depois do login, o usuário **sempre** cai no **Dashboard** (`/`). Espaços no início/fim do e-mail e da senha são removidos automaticamente.

Sem sessão ativa, qualquer endereço do sistema redireciona para `/login`. Para sair, use **`Sair`** no rodapé do menu lateral.

#### Mensagens do login

| Mensagem | Significado / o que fazer |
|---|---|
| `Preencha o email` / `Preencha a senha` / `Preencha o nome` | Campo obrigatório vazio. |
| `Falha no login. Tente novamente.` | O login por Google/Microsoft não terminou (pop-up fechado, bloqueado pelo navegador ou recusado). Liberar pop-ups para o site e tentar de novo. |
| `Erro na autenticação` | Erro genérico de e-mail/senha (senha errada, conta inexistente). Usar "Esqueci minha senha". |

**Pop-up bloqueado:** se nada acontece ao clicar em Google/Microsoft, o navegador provavelmente bloqueou o pop-up. Orientar o usuário a permitir pop-ups para o endereço do sistema.

---

### Criar conta

Link `Não tem conta? Crie a sua aqui` → tela `Criar conta` ("Preencha os dados para criar sua conta").

1. Preencher `Nome` (nome completo), `Email` e `Senha` e clicar `Cadastrar`.
2. O sistema envia um **código de 6 dígitos** por e-mail → tela `Verifique seu email` ("Enviamos um código para <email>").
3. Digitar o código em `Código de verificação` e clicar `Verificar`.

Mensagens: `Digite o código de 6 dígitos`; `Código inválido ou expirado` (código errado ou vencido — usar `Reenviar código`). O "Reenviar código" não mostra confirmação na tela; basta checar o e-mail (inclusive spam).

> **Importante para o suporte:** criar a conta **não** dá acesso aos dados comerciais. Um usuário novo entra, mas vê telas vazias até que a gestão configure o papel (vendedor/coordenador/diretoria), o vínculo com o RCA do TOTVS, a BU e a carteira. Ver seção 13 — Governança: Papéis, RCA, BUs, Escopo, Coordenadores, Carteira e Férias e seção 15 — Solução de Problemas — Diagnóstico por Sintoma ("Usuário novo não vê nada").

---

### Esqueci minha senha

1. Na tela de login, clicar `Esqueci minha senha`.
2. Tela `Recuperar senha`: informar o e-mail e clicar `Enviar código`.
   - Erro: `Não foi possível enviar o código. Confira o email e tente novamente.`
3. Tela `Criar nova senha`: digitar o código recebido, `Nova senha` e `Confirmar nova senha`; clicar `Redefinir senha`.
   - Validações: `Digite o código de 6 dígitos`, `Preencha a nova senha`, `As senhas não conferem`, `Código inválido ou expirado`.
4. Sucesso: volta ao login com `Senha redefinida. Entre com a nova senha.`

Quem entra com Google ou Microsoft **não tem senha no sistema** — deve continuar usando o botão do provedor.

---

### Configurações do Usuário (`/configuracoes`)

Título: `Configurações do Usuário` — "Edite seus dados de cobertura, substituição e preferências da interface." Qualquer usuário logado acessa.

#### O que aparece

- **Card do perfil:** nome, `ID do usuário: X` e selo `Status: Ativo` ou `Status: Férias`.
- **Cards informativos:** `Nome`, `Tipo de Acesso` (`Usuário`), `Perfil` (`Usuário autenticado`), `Substituto em Férias` (`Usuário #ID` ou `Não definido`).

#### Seção "Edição de Configurações"

| Campo | Opções |
|---|---|
| `Nome de exibição` | Texto livre, até 120 caracteres. É o nome usado na saudação do Dashboard. |
| `Status do Funcionário` | `Ativo` / `Férias` |
| `Substituto` | `Sem substituto` ou um colega (`Nome (email)`) |
| `Modo padrão da Agenda` | `Dia` / `Semana` / `Mês` |
| `Exibição padrão de Atividades` | `Lista` / `Kanban` |
| `Página inicial` | `Dashboard`, `Agenda`, `Clientes`, `Atividades`, `Mix Builder`, `Analytics`, `Painel de Gestão` |

Botão `Salvar Configurações`. Mensagens: `Configurações atualizadas com sucesso.` ou `Falha ao salvar configurações.` (o salvamento é feito em duas partes — dados e preferências; se a segunda falhar, parte pode ter sido salva: conferir e salvar de novo).

> **Comportamento atual conhecido:** as preferências `Modo padrão da Agenda`, `Exibição padrão de Atividades` e `Página inicial` são gravadas, mas **ainda não são aplicadas** pelas telas: a Agenda sempre abre em **Semana** e o login sempre leva ao **Dashboard**. Se o usuário reclamar que "salvei a preferência e não mudou", explicar que é uma limitação conhecida e registrar a sugestão em **Suporte**.

> **Férias:** marcar `Férias` e um substituto aqui é o autosserviço do próprio usuário. O cadastro oficial de férias de RCA (com período e substituto) é feito pelo coordenador em **Férias de Vendedores** (ver seção 13 — Governança: Papéis, RCA, BUs, Escopo, Coordenadores, Carteira e Férias).

---

### Google Agenda — conectar, trocar de agenda e desconectar

Fica no fim de **Configurações**. Texto da tela: "Conecte sua conta Google em um clique. Visitas e atividades com prazo passam a ser enviadas para o seu Google Agenda." Selo: `Configurado` ou `Não configurado`.

#### O que vai para o Google

O sistema cria e atualiza no Google **apenas os eventos que ele mesmo gera**; compromissos pessoais não são lidos nem alterados:

- Visitas a clientes (para o vendedor da visita);
- Visitas de prospecção;
- Reuniões internas e deslocamentos (para o criador **e** cada participante convidado; quem é retirado da lista tem o evento removido);
- Atividades **com data limite**.

A sincronização acontece ao **criar, reagendar/editar, editar relato e cancelar** itens. **Check-in e check-out não atualizam o Google.**

#### Conectar (passo a passo)

1. Em Configurações, clicar `Conectar Google Agenda` (se já conectado: `Reconectar conta Google`).
2. Escolher a conta Google e autorizar (o Google sempre pede consentimento).
3. Ao voltar, aparece `Google Agenda conectado com sucesso.` e os cards `Conta conectada`, `Calendário` e `Última sincronização` (ou `Ainda não sincronizado`).

Se o botão estiver desabilitado com o aviso "A integração com o Google ainda não foi liberada pelo TI...", a credencial da empresa ainda não foi cadastrada — é uma configuração do TI, não do usuário.

#### Mensagens de erro na conexão

| Mensagem | Causa | Orientação |
|---|---|---|
| `Você recusou o acesso ao Google Agenda.` | O usuário clicou em negar no Google. | Conectar de novo e aceitar. |
| `O Google não concluiu a autorização. Tente novamente.` | Erro do lado do Google. | Tentar novamente. |
| `Não foi possível validar a origem da autorização. Tente conectar novamente.` | O retorno do Google chegou em outra aba/navegador ou de um link antigo. | Iniciar e concluir a conexão na mesma aba, sem recarregar. |
| `O Google não devolveu a autorização completa. Tente conectar novamente.` | O Google não devolveu o acesso contínuo. | Tentar novamente; se persistir, remover o acesso do app na conta Google e reconectar. |
| `A autorização expirou antes de ser vinculada. Tente conectar novamente.` | Demorou demais entre autorizar e voltar (janela de ~10 min). | Refazer a conexão. |
| `Não foi possível concluir a autorização com o Google.` / `Falha ao conectar o Google Agenda.` | Erro inesperado. | Tentar novamente; persistindo, abrir chamado em Suporte. |

#### Escolher ou trocar a agenda de destino

- Campo `Agenda de destino` com a lista das agendas da conta (a principal aparece como `<nome> (principal)`). Botões `Salvar agenda` e `Atualizar lista`.
- Se aparecer "Não foi possível listar suas agendas do Google. Se você conectou antes desta atualização, clique em Reconectar conta Google...", o usuário conectou numa versão antiga sem permissão de ler a lista: **basta clicar em `Reconectar conta Google`**. Enquanto isso, dá para digitar o identificador manualmente (ex.: `primary` = agenda principal).
- Mensagens: `Esta já é a agenda de destino.`; sucesso: `Agenda de destino alterada. Os próximos compromissos vão para ela.`
- **Ao trocar de agenda**, os eventos já enviados **saem da agenda anterior** e são **recriados na nova conforme cada item for atualizado** — não reaparecem todos de uma vez.

#### Desconectar

Botão `Desconectar` (não pede confirmação). Mensagem: `Google Agenda desconectado.` ou `Falha ao desconectar Google Agenda.`

#### Falhas de sincronização

- Erros de envio ao Google **não aparecem na Agenda**; aparecem só em Configurações, no aviso amarelo `Último erro: <texto>`.
- Quando um envio falha, o item entra numa **fila de nova tentativa** processada automaticamente **a cada 5 minutos** — não gera evento duplicado.
- "Evento não apareceu no Google": (1) conferir se está `Configurado`; (2) conferir a `Agenda de destino` (o evento pode estar em outra agenda da conta); (3) esperar até 5 minutos; (4) ver `Último erro`; (5) reconectar a conta; (6) lembrar que atividade **sem data limite** não vai para o Google e que check-in/check-out não sincronizam.
- Edições feitas **manualmente no Google** em eventos criados pelo sistema (convidados, lembretes) são **sobrescritas** na próxima sincronização daquele item.

---

## 3. Dashboard (tela inicial)

> Rota: `/` — item **Dashboard** do menu. Acesso: todo usuário logado. É a primeira tela após o login.

### Para que serve

Leitura rápida do dia e do mês: compromissos de hoje, meta semanal de visitas, meta mensal de faturamento, vendas líquidas diárias, alertas importantes, últimas atividades e pendências de relato da semana. Recomendação do manual: abrir no início do dia e após o horário de maior atendimento.

### Filtro de escopo (topo)

Coordenadores, diretoria e vendedores com mais de um escopo veem o **filtro de escopo** no topo (Meu painel / Time inteiro / Vendedor específico / Todos os coordenadores, além de Filial, Departamento e Seção). Vendedor comum não vê o filtro e enxerga apenas os próprios dados. Detalhes em seção 1 — Visão Geral do Sales 360 — Perfis, Menu e Filtro de Escopo → "Filtro de escopo".

### Blocos da tela (de cima para baixo)

1. **Saudação** — `Bom dia, <nome>.` / `Boa tarde, ...` / `Boa noite, ...` (pela hora do aparelho). O nome vem de *Nome de exibição* em Configurações; se não houver, é derivado do e-mail (ou aparece `você`).
2. **Compromissos de hoje** — `Você tem N compromisso(s) para hoje.` ou `Você não tem nenhum compromisso para hoje.` Clicar abre a janela **Compromissos de hoje** com horário, tipo, cliente/título, vendedor ou convidados e status; botão `Abrir agenda completa`. Em escopo de time a frase diz "Você", mas conta os compromissos do time filtrado.
3. **Meta semanal de visitas** — `Realizadas`, `Meta`, `Restantes` e círculo de progresso (ver regra abaixo).
4. **Meta mensal de faturamento** — valor realizado, `P% de <meta>` e selo: `Acima da meta` (≥ 100%), `No ritmo` (≥ 80%) ou `Abaixo da meta` (< 80%). Meta zero = 0%.
5. **Vendas líquidas diárias** — valor do dia selecionado (padrão: hoje), linha `Bruto R$ X - devoluções R$ Y no mês`, comparação `+x,x% vs dia anterior` (ou `—`) e gráfico de barras dos dias úteis. Clicar numa barra seleciona o dia. No celular: `Últimos 7 dias úteis` / `Toque em uma barra`.
6. **Alertas não lidos** — até 5 alertas **não lidos de prioridade ALTA**. Clicar abre o alerta em `/alertas`; `Ver todos` abre a central. Vazio: `Nenhum alerta de alta prioridade pendente.`
7. **Últimas Atividades** — 3 atividades da lista de Atividades; botões `Ver histórico completo` (vai a Atividades) e `Abrir agenda do dia` (abre a Agenda, na visão Semana). Vazio: `Nenhuma atividade recente.`
8. **Resumo da Semana** — "Últimas visitas da semana e pendências de relato." Colunas: `Data da visita`, `Data do relato`, `Cliente`, `Status da visita`, `Relato` (`Ok` ou `Relato pendente`). Inclui visitas de prospecção. Vazio: `Nenhuma visita registrada nesta semana.`

### Regra da Meta semanal de visitas

- **Meta por pessoa:** **16 visitas por semana para vendedor** e **8 para coordenador**. Em "Time inteiro" ou visão global, a meta é a **soma** pessoa a pessoa do filtro aberto (texto: `Meta composta do filtro atual: vendedores 16/semana e coordenadores 8/semana.`).
- **Janela:** segunda a sexta da **semana atual (calendário)**. Sábado e domingo não contam.
- **O que conta como realizada:** itens com status **CONCLUIDA** que sejam:
  - visita a cliente (concluída por **check-out com relato**);
  - visita de prospecção concluída;
  - agenda interna do tipo **Deslocamento** concluída.
- **Não conta:** reuniões internas e "Outros"; visitas **sem check-out** (status Agendada ou Em andamento); visitas canceladas; fins de semana.

> **Por que minha visita não contou?** Quase sempre porque não foi feito o **check-out** (botão `Encerrar visita` com relato preenchido). Visita feita em campo sem check-out continua *Agendada*; com check-in sem check-out fica *Em andamento*. Nos dois casos não soma.
> **Deslocamento:** entra no planejado, mas hoje **a tela não oferece forma de concluir um deslocamento**, então na prática ele não soma no realizado. É uma limitação conhecida — registrar em Suporte se for relevante para o usuário.

### Vendas e meta mensal — de onde vêm os números

- **Vendas líquidas** = faturamento bruto **menos devoluções**. Os dados vêm do ERP (Winthor/TOTVS) por rotinas automáticas (ver seção 14 — Rotinas Automáticas e Integrações); não são em tempo real.
- A venda conta para o vendedor quando o **cliente está na carteira dele** e a venda é de uma **filial/departamento (BU) ao qual ele está vinculado**. Venda de cliente da carteira em outra BU não conta para ele.
- A **meta mensal** é a meta do vendedor definida pelo coordenador (redistribuição da meta da diretoria). Sem meta cadastrada, o percentual fica 0%.

### Perguntas frequentes

- **"O Dashboard está vazio / zerado."** Usuário novo ou sem vínculos (papel, RCA, BU, carteira). Ver seção 15 — Solução de Problemas — Diagnóstico por Sintoma.
- **"Os números do Dashboard são diferentes do Analytics."** Conferir o filtro de escopo e o período de cada tela; o Dashboard usa o mês corrente e a semana calendário (seg–sex), enquanto o Acompanhamento Semanal usa a semana operacional (sexta–quinta).
- **"Venda de hoje não aparece."** A carga de vendas é periódica; aguardar a próxima sincronização.
- **"O badge de Alertas no menu não bate com a tela."** O contador do menu atualiza a cada 5 minutos e usa o escopo padrão.

---

## 4. Agenda e Visitas

> Rotas: `/agenda` (menu **Agenda**) e `/agenda-coordenador` (menu Coordenador → **Agenda dos Vendedores**).

### Para que serve

Planejar e registrar visitas a clientes, visitas de prospecção, reuniões internas e deslocamentos; fazer **check-in / check-out** com relato; acompanhar a **meta semanal de visitas**; e (opcionalmente) enviar os compromissos ao **Google Agenda**.

### Visões e navegação

- Abas **Dia / Semana / Mês** (abre sempre em **Semana**). Setas ‹ › avançam/voltam o período.
- **Dia:** cards do dia; botão `Hoje`. Vazio: `Sem visitas para esta data.`
- **Semana:** 7 dias (segunda a domingo) com `N visita(s)`; clicar num dia abre `Detalhes de dd/mm/aaaa`.
- **Mês:** grade do mês; clicar num dia abre `Dia selecionado: dd/mm/aaaa`.
- Lateral: **Status da Meta Semanal** (`X concluidas` / `Y alvo`, botão `Ver status detalhado`), **Resumo do Periodo** (Agendadas, Em andamento, Concluidas, Canceladas) e **Legenda** de cores: Agendada (amarelo), Em andamento (azul), Concluída (verde), Cancelada (vermelho).
- Dica da tela: "no modo Semana e Mes, clique em um dia para ver os detalhes e executar acoes de agenda."

> O botão `Hoje` da visão Dia volta para a data-base que está sendo exibida, não necessariamente para o dia de hoje (comportamento conhecido). Para ir a hoje, use as setas ou troque de visão.

### Tipos de compromisso

| Tipo | Como aparece | Opções do campo "Tipo" |
|---|---|---|
| **Visita com cliente** | nome do cliente | `Aumento de mix` (padrão), `Gerar demanda`, `Padronização de produto`, `Positivação`, `Financeiro`, `Renegociação`, `Manutenção` |
| **Visita de prospecção** | `<nome> (prospecção)`, selo `Prospecção` | `Prospecção` (padrão), `Apresentação comercial`, `Diagnóstico inicial`, `Follow-up de prospecção` |
| **Agenda interna** | selo `Agenda interna` | `Reunião interna` (padrão), `Outros` |
| **Deslocamento** | `Deslocamento: origem → destino`, `Saída HH:MM · Chegada HH:MM` | `Deslocamento` |

### Status e ações permitidas

| Status | Significado | Ações disponíveis |
|---|---|---|
| **AGENDADA** | Planejada, ainda não iniciada | `Editar / Reagendar / Cancelar`, `Iniciar (Check-in)` |
| **EM ANDAMENTO** | Check-in feito, sem check-out | Só `Encerrar visita` (não dá para cancelar nem reagendar) |
| **CONCLUIDA** | Check-out feito com relato | `Editar Relato` |
| **CANCELADA** | Cancelada com motivo | Só visualização |
| (sempre) | — | `Ver Planejamento` (prospecção: `Ver objetivo`) e `Ver Relato` |

- Agenda interna e deslocamento: só **quem criou** pode editar/cancelar; convidados veem `Ver detalhes`. **Não há check-in nem conclusão** para esses tipos.
- Itens de outras pessoas aparecem com o selo `Somente visualização`.

### Criar um compromisso (`+ Nova agenda`)

1. Clique em `+ Nova agenda` e escolha a aba: `Visita com cliente`, `Visita de prospecção`, `Agenda interna` ou `Deslocamento`.
2. Preencha:
   - **Cliente da carteira** (visita): busca por nome ou código a partir de 2 letras. Só aparecem clientes **da sua carteira** (e de cobertura). ⚠️ **O primeiro cliente da lista já vem selecionado** — confira antes de salvar.
   - **Prospect** (prospecção): só prospects ativos (não aparecem Convertido/Perdido). Se a lista estiver vazia: "Nenhum prospect ativo encontrado. Cadastre o prospect na tela de prospecção antes de agendar." (o cadastro de prospect é feito em **Clientes → Novo cliente prospecto**).
   - **Título** (interna) ou **Origem/Destino** (deslocamento).
   - **Vendedores convidados** (`Adicionar vendedor`): na visita/prospecção, cada convidado recebe **um registro próprio** na agenda e na meta dele. Sem convidados, o item fica na sua agenda e na sua meta. Na agenda interna/deslocamento, o compromisso aparece para quem criou e para os convidados.
   - **Data** (padrão: hoje), **Tipo**, **Hora início / Hora fim** (padrão 08:00–09:00).
   - Texto opcional: Planejamento / Objetivo / Descrição / Observações.
3. Clique em `Criar visita` / `Criar visita de prospecção` / `Criar agenda interna` / `Criar deslocamento`.

#### Regras e mensagens ao criar

| Mensagem | Motivo |
|---|---|
| `Preencha data, horário e tipo.` | Campo obrigatório vazio |
| `Selecione o cliente da visita.` / `Selecione o prospect da visita.` | Falta cliente/prospect |
| `Informe o título da agenda interna.` | Falta título |
| `Informe a origem e o destino do deslocamento.` | Falta origem/destino |
| `O horário de fim deve ser maior que o horário de início.` | Horário inválido |
| `É permitido lançar visitas retroativas em até 5 dias.` | **Retroativo máximo: 5 dias** antes de hoje (horário de Brasília). Datas futuras não têm limite. |
| `Já existe uma visita agendada para <nome/você> às HH:MM neste dia. Escolha outro horário.` | Conflito: já existe visita **com o mesmo horário de início** para a pessoa. Horários que apenas se sobrepõem não são bloqueados. |
| `Não foi possível criar a visita. Verifique se o cliente pertence à sua carteira.` | O cliente não está na carteira do vendedor ou erro no servidor |

### Check-in e check-out (registrar a visita)

1. Na visita **Agendada**, clique `Iniciar (Check-in)`. Registra a hora do aparelho e muda para **Em andamento** (sem confirmação).
2. Abre a janela **Relato e atividades** (prospecção: **Relato da prospecção**).
3. Preencha o **Relato** — **obrigatório**. Sem ele o botão `Concluir visita` não habilita (`Para finalizar a visita, preencha o relato.`).
4. Opcional: `Adicionar atividade` para criar follow-ups já vinculados ao cliente (Título, Prioridade Alta/Média/Baixa, Data limite, Descrição). Atividade sem título é ignorada.
5. Clique `Concluir visita` → status **Concluída**; passa a contar na meta.

- Se fechar com `Voltar`, a visita fica **Em andamento** e o botão vira `Encerrar visita`. **Enquanto não houver check-out, não conta na meta.**
- `Visita encerrada, mas N atividade(s) não foram salvas.` → a visita foi concluída, mas alguma atividade falhou; use `Salvar atividades pendentes`.
- `Não foi possível encerrar a visita. Tente novamente.` → erro ao concluir.

### Editar, reagendar e cancelar

Clique em `Editar / Reagendar / Cancelar` e escolha:

- **Editar planejamento** (interna: *Editar descrição*) — altera o objetivo/pauta.
- **Reagendar** — altera data, horário ou tipo (na interna também título/descrição; no deslocamento, origem/destino).
  - **Mudar a data exige o "Relato da alteração"** (`Ao alterar a data da visita, informe o motivo no relato.`). Mudar só horário/tipo não exige.
  - O motivo é **acrescentado** ao relato com o cabeçalho `Reagendamento em AAAA-MM-DD HH:MM:`.
  - Vale a mesma regra de retroativo (5 dias) e de conflito de horário.
- **Cancelar** — visita: **motivo obrigatório** (`Informe o motivo do cancelamento da visita.`); agenda interna: motivo opcional. Botão `Confirmar cancelamento`.
- **Editar Relato** — só em visitas concluídas.

> Visita **Agendada** com data **mais de 5 dias no passado** não pode ter o planejamento editado sem mudar a data (cai na regra de retroativo). Ainda é possível fazer check-in ou cancelar.

### Histórico do cliente na Agenda

Clicar no nome sublinhado do cliente abre **Histórico de <cliente>** com contadores de Visitas, Tarefas e Vendas e uma linha do tempo dos últimos 10 eventos. Para análise completa, usar **Clientes → Histórico do Cliente**.

### Agenda dos Vendedores (coordenador)

- Menu **Coordenador → Agenda dos Vendedores** (`/agenda-coordenador`). Aparece para quem tem vínculo ativo de coordenador e **não** tem papel Diretoria.
- Sem acesso: `Esta tela está disponível apenas para coordenadores com vínculo ativo.`
- Mostra a agenda dos vendedores do escopo do coordenador, **somente leitura**, incluindo relatos. Não permite criar/editar.

### Meta semanal

Mesma regra do Dashboard: **16 visitas/semana para vendedor, 8 para coordenador**, contando de segunda a sexta itens **concluídos** (visita, prospecção e deslocamento). Detalhes em seção 3 — Dashboard (tela inicial).

### Limites técnicos úteis

- Relato e planejamento: até 20.000 caracteres (o excedente é cortado). Quebras de linha viram espaço ao salvar.
- Título de agenda interna: 200 caracteres; atividade: título 300, descrição 500.
- Datas/horários de "hoje" e retroativo usam horário de Brasília; check-in/check-out usam o relógio do aparelho.

### Integração com Google Agenda

Criar, reagendar, editar relato e cancelar enviam o compromisso ao Google (se o usuário conectou em **Configurações**). Check-in/check-out não sincronizam. Falhas não aparecem na Agenda — ver `Último erro` em Configurações. Fluxo completo em seção 2 — Login, Senha e Configurações do Usuário.

### Perguntas frequentes

- **"Não consigo agendar para o cliente X."** O cliente não está na sua carteira. Adicione-o em **Clientes → Clientes Disponíveis** ou peça ao coordenador para transferi-lo.
- **"Não consigo lançar visita de semana passada."** O retroativo máximo é 5 dias.
- **"O botão Concluir visita está desabilitado."** Preencha o relato.
- **"Minha visita sumiu da meta."** Verifique se ficou *Em andamento* (sem check-out) ou foi cancelada.
- **"Agendei para o cliente errado."** O primeiro cliente vem pré-selecionado. Cancele (com motivo) e crie de novo.
- **"Não consigo editar a reunião que fui convidado."** Só o criador edita agenda interna.

---

## 5. Clientes — Minha Carteira, Clientes Disponíveis e Histórico do Cliente

> Rota: `/clientes` (menu **Clientes**). Acesso: todo usuário logado; cada um vê apenas a própria carteira (coordenador/diretoria conforme o filtro de escopo).
> Atalhos: `/clientes/<id>` abre a carteira com a busca preenchida; `/clientes?clienteId=<id>` abre direto o Histórico do cliente.

### Abas

1. **MINHA CARTEIRA (N)** — clientes do vendedor, com indicadores, filtros e ações.
2. **CLIENTES DISPONÍVEIS** — clientes da BU do vendedor que ainda não têm dono; botão `Adicionar`.
3. **HISTÓRICO DO CLIENTE** — linha do tempo de visitas, atividades, pedidos e mix de um cliente.

Botão **`Legenda`** (canto direito) explica Temperatura, Alerta de Queda, Alertas Inteligentes e Mix de Produtos.

---

### Aba Minha Carteira

#### Indicadores (cards)
| Card | O que mostra |
|---|---|
| **Clientes ativos** | "NN de {total}" — clientes com cadastro `ATIVO`; "X% da base atual". |
| **Visita pendente por curva** | Clientes acima do limite de dias sem visita da curva (A 8d, B 16d, C 32d, D 61d). Clicável: `Ver clientes`. |
| **Receita atual da carteira** | Soma das compras do mês atual dos clientes. |
| **Ticket médio** | Receita do mês ÷ clientes ativos. |
| **Score da carteira** | Média do score de ranking (0–100), com rótulo Quente/Morno/Frio. |

#### Filtros
- **Busca** — "Razão social, fantasia, CNPJ ou código" (busca inteligente, ver abaixo).
- **Ramo** — lista fixa de ramos do ERP (Hospital Privado, Home Care, Órgão Público..., `Sem ramo`).
- **Status** — `Todos os status`, `Ativo`, `Inativo`, `Em risco` (campo de cadastro).
- **Ordenar visualização** — Ranking A→D (padrão), D→A, Nome A–Z/Z–A, Status, Dias sem visita. ⚠️ Reordena **apenas os 10 clientes da página aberta**; com busca preenchida, vale a ordem por relevância.
- `Limpar filtros`.

#### Colunas
Curva (A/B/C/D) · Cliente (nome cortado com "…", "Código: …", sino vermelho = alerta inteligente não lido, selo **Queda** = queda de volume acima do limite) · Ramo · Dias sem visita (vermelho > 30) · Última compra (vermelho > 25 dias) · **Temp.** (Quente/Morno/Frio + score; clicável) · **Status** · Ações (histórico, editar, remover). Paginação de **10 em 10**.

Gráfico "Distribuição por ramo de segmento" no rodapé.

#### Curva A/B/C/D
- **Automática** pelo *score de ranking* (0–100): A ≥ 80, B ≥ 55, C abaixo. Composição do score: 45% compras dos últimos 90 dias (R$ 30 mil = 100), 25% visitas concluídas nos últimos 60 dias, 20% dias desde a última compra, 10% dias sem visita concluída.
- **Manual:** o vendedor pode fixar a curva no lápis (Editar) → "Curva da carteira" (A, B, C, D). A manual prevalece sobre a automática.
- Limites de visita por curva: **A 8 dias, B 16, C 32, D 61**. Só visitas **concluídas** contam; cliente nunca visitado sempre aparece como pendente.

#### Coluna "Status" × filtro "Status"
A coluna **Status** (Ativo / Risco / Crítico) é derivada da **curva**: A = Ativo, B = Risco, C/D = Crítico. Já o **filtro Status** e o card **Clientes ativos** usam o status do **cadastro** (ATIVO/INATIVO). Por isso um cliente ativo pode aparecer "Crítico".

#### Temperatura do cliente (0–100)
| Fator | Peso | Regra |
|---|---|---|
| Recência | 30 | última compra < 30 dias = 30; < 60 = 20; < 90 = 10; senão 0 |
| Frequência | 25 | dias sem comprar até 1,1× o ciclo médio = 25; até 1,3× = 15; até 1,6× = 5; acima = 0 (sem ciclo = 0) |
| Tendência | 25 | volume dos 2 últimos meses vs. 2 anteriores: > +10% = 25; ±10% = 15; até −30% = 5; pior = 0 |
| Visitas | 20 | última visita < 30 dias = 20; < 60 = 12; < 90 = 5; nenhuma = 0 |

**Quente ≥ 70 · Morno 40–69 · Frio < 40.** Clicar na temperatura abre o detalhe por fator e uma recomendação (ex.: "Agende uma visita presencial para fortalecer o relacionamento."). "Frio (0)" = sem dados de compra/visita para o cliente.

#### Ações
- **Editar (lápis)** — janela "Editar cliente da carteira": Nome Fantasia e CNPJ **bloqueados**; editáveis: Razão Social, Segmento, Curva, Cidade, UF, Telefone, E-mail, Endereço. Mensagens: `Dados do cliente atualizados com sucesso.` / `Os dados foram salvos, mas não foi possível atualizar a curva do cliente.`
- **Remover (lixeira)** — confirmação "Deseja remover <cliente> da sua carteira?". Sucesso: `Cliente removido da sua carteira com sucesso.`
- **Histórico (prancheta)** — abre a aba Histórico com o cliente.
- **`+ Novo cliente prospecto`** — cadastra empresa que ainda não é cliente do ERP (razão social obrigatória; opcionais: fantasia, CNPJ, segmento, porte, origem, cidade/UF, potencial mensal, probabilidade %, contato, cargo, telefone, e-mail, observações). Sucesso: "Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda." ⚠️ O prospecto **não entra na Minha Carteira**; é usado nas visitas de prospecção da Agenda.

---

### Aba Clientes Disponíveis

Mostra clientes da BU do vendedor **sem responsável** no mesmo escopo. Só o campo Busca fica visível; paginação de 10.

#### Regras
- Usa o escopo (BU + filial + seção) **mais recente** do vendedor. Vendedor sem escopo ativo não consegue adicionar.
- Clientes do ramo **PESSOA FISICA nunca aparecem**.
- Clientes que já têm dono na mesma filial + seção + BU não aparecem.
- A curva exibida aqui é sempre **B** (valor padrão, a lista não traz curva real).

#### Adicionar — mensagens
| Mensagem | Significado |
|---|---|
| `Cliente adicionado à sua carteira com sucesso.` | OK |
| `Cliente já está na sua carteira para este escopo.` | Já é seu |
| `Este cliente já possui responsável no mesmo escopo da sua carteira.` | Outro vendedor tem o cliente — pedir transferência ao coordenador (Gestão de Carteira) |
| `Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.` | Falta cadastro de escopo do vendedor (gestão: BUs e Vendedores / Escopo Usuários) |
| `Cliente não encontrado para vinculação.` | Cliente inexistente |

---

### Aba Histórico do Cliente

- **Últimas visitas da última semana** (de todos os clientes do vendedor): cartões com data, responsável, relato ("Relato ok" / "Pendente"). Clique abre "Informações da visita".
- **Cliente selecionado** + filtros: `Buscar cliente` (nome, razão, **ID interno** ou cidade — não busca código Winthor), `Cliente`, `Ramo`, `Tipo de histórico` (Visitas, Atividades concluídas, Pedidos, Mix), período `De`/`Até`.
- **HISTÓRICO DE INTERAÇÕES** (linha do tempo, mais recente primeiro):
  - **Visita** — planejamento, relato, `Ver relato completo`;
  - **Atividade concluída** — título, descrição, datas;
  - **Pedido** — "Pedido #NUMPED", Faturado, itens, valor, `Ver detalhes do pedido`;
  - **Mix** — "MIX #ID" enviado pelo Mix Builder, `Ver detalhes do mix`.
- Paginação independente para Histórico e para Pedidos (20 por página).

#### Regras
- **Pedidos** vêm das vendas faturadas do ERP, apenas dentro da filial + departamento + seção do vendedor.
- **Mix** só aparece se foi **enviado ao histórico** no Mix Builder (salvar não basta).
- Atividades aparecem só quando **concluídas** e vinculadas ao cliente.
- Filtro de período e tipo, para pedidos e mix, age sobre a página carregada.

---

### Busca inteligente (Carteira, Disponíveis, seletor de Atividades)

- Pesquisa em nome fantasia, razão social, CNPJ, código, ID, cidade, UF, ramo e segmento.
- Ignora acentos, maiúsculas e pontuação ("12.345.678/0001-90" = "12345678000190").
- Ignora palavras como "cliente", "código", "cod", "id".
- Cada palavra digitada precisa casar com algum campo (lógica "E").
- Tolera erro de digitação: 1 letra em palavras de 4–6 letras, 2 letras em 7+. Palavras com menos de 4 letras exigem casamento exato.
- Em carteiras grandes, a busca pode levar alguns segundos (carrega a carteira toda para filtrar).

### Perguntas frequentes

- **"Cliente não aparece em Disponíveis."** Pessoa Física, já tem dono no escopo, já está na sua carteira, ou você não tem escopo ativo.
- **"Status diz Crítico, mas o cliente está ativo."** A coluna reflete a curva, não o cadastro.
- **"Ordenei e não mudou a carteira inteira."** A ordenação é por página.
- **"Pedido não aparece no histórico."** Venda fora do escopo (filial/depto/seção) do vendedor, ou está em outra página de Pedidos.
- **"Mix não aparece no histórico."** Use "Enviar ao Histórico" no Mix Builder.
- **"Quero o cliente de outro vendedor."** Só o coordenador transfere (Coordenador → Gestão de Carteira).
- **"Temperatura Frio (0)."** Sem dados de compra/visita no escopo.

---

## 6. Atividades (Tarefas / Follow-ups)

> Rota: `/tarefas` — menu **Atividades** (o número verde ao lado é a quantidade de atividades pendentes, atualizado a cada 5 minutos). Acesso: todo usuário logado; cada um vê as próprias atividades (coordenador/diretoria conforme o escopo).

### Para que serve

Controlar pendências comerciais que não podem depender de memória: retornos, cotações, propostas, cobranças e follow-ups, opcionalmente vinculados a um cliente.

### Tela "Gestão de Atividades"

- Alternar visualização: **Lista** (padrão) ou **Kanban**.
- Botão **`+ Nova Atividade`**.
- Cards de resumo: **Total**, **Em andamento**, **Atrasadas**, **Concluídas**.
- Filtros: **Status** (A Fazer, Em andamento, Concluída), **Prioridade** (Alta, Média, Baixa), **Prazo exato** (uma data). Botões `Limpar filtros` e `Atualizar`.

#### Lista
- **Atividades abertas** — "A Fazer" no topo, depois "Em Andamento", ordenadas por prazo (sem prazo no fim). Prazo vencido em vermelho.
- **CONCLUÍDA** — bloco **recolhido por padrão**; clique na seta para expandir.

#### Kanban
Colunas **A FAZER**, **EM ANDAMENTO**, **CONCLUÍDA**. Cada cartão tem seletor de status, **Editar** e **Excluir**.

### Status e prioridade

| Status | Rótulo |
|---|---|
| PENDENTE | A Fazer |
| EM_ANDAMENTO | Em Andamento |
| CONCLUIDA | Concluída |

- O status pode ser trocado livremente pelo seletor (Lista ou Kanban). Mensagem: "Atividade marcada como {a fazer | em andamento | concluída}."
- Prioridades: **Alta** (vermelho), **Média** (amarelo, padrão), **Baixa** (verde).
- **Atrasada** = prazo anterior a hoje (horário de Brasília) e não concluída. Atividade que vence hoje ainda não é atrasada.

### Criar atividade

1. `+ Nova Atividade`.
2. **Título** (obrigatório), **Descrição**, **Cliente** (opcional — busca na sua carteira, até 80 resultados; **clique na opção da lista** para vincular), **Prioridade**, **Prazo** (obrigatório).
3. `Salvar` → "Atividade criada com sucesso."

Validações: "Informe o título da atividade." / "Informe o prazo da atividade." Erro: "Não foi possível salvar a atividade."

Também é possível criar atividades ao **encerrar uma visita** na Agenda (bloco "Atividades para incluir no fechamento").

### Editar

Clique no título ou no lápis → janela **Editar Atividade** (abas **Dados** e **Log**) → `Salvar alterações` ("Atividade atualizada.").
- O **status não muda nesta janela** — use o seletor de status.
- A aba **Log** registra as **mudanças de prazo** ("Prazo alterado — De X para Y — Usuário").

### Excluir

Somente na visão **Kanban** (ícone de lixeira). Confirmação: "Tem certeza que deseja excluir <título>? Esta ação não pode ser desfeita." Sucesso: "Atividade removida."

### Google Agenda

Criar e editar uma atividade **com prazo** envia/atualiza o evento no Google Agenda de quem conectou a conta em Configurações. **Trocar o status não atualiza o Google.**

### Perguntas frequentes

- **"Não acho o botão excluir."** Mude para a visão Kanban.
- **"Minhas concluídas sumiram."** O bloco CONCLUÍDA fica recolhido; expanda-o.
- **"Atividade aparece como atrasada."** O prazo passou; conclua-a ou edite o prazo (fica registrado no Log).
- **"O cliente vinculado ficou errado."** Ao trocar o cliente é preciso **selecionar a opção na lista**; só digitar mantém o cliente anterior. Para remover o vínculo, apague todo o campo.
- **"Cliente não aparece no seletor."** O seletor busca só na sua carteira (até 80 resultados) — refine a busca.
- **"O filtro Prazo exato esconde tudo."** Ele busca a data exata; use `Limpar filtros`.
- **"O contador do menu não atualizou."** Atualiza a cada 5 minutos ou ao recarregar a página.

---

## 7. Mix Builder — Simulador de Margens e Propostas

> Rota: `/simulacao` — menu **Mix Builder**. Acesso: todo usuário logado. Os mixes pertencem a quem os criou.

### Para que serve

Montar propostas de mix de produtos para um cliente com **custo real** (padrão ou especial), definir **margem**, calcular **preço de venda**, comparar com o **concorrente** e gerar **PDF** (para o cliente) ou **CSV** (uso interno).

### Abas

- **Construtor** — monta ou edita um mix. Quando um mix salvo está aberto aparece o selo **"Editando Mix #ID"** (o X cancela a edição e limpa o construtor).
- **Meus Mix** — lista dos mixes salvos (20 por página) com ações.

### Montar um mix (Construtor)

1. **Cliente \*** — lista com busca ("ID - Nome Fantasia"). Aparecem os clientes **da sua carteira** e, se você estiver cobrindo férias de alguém, da carteira dessa pessoa (até 500). O catálogo só libera depois de escolher o cliente.
2. **Nome do Mix \*** e **Descrição** (opcional).
3. **Catálogo de produtos** — escolha antes o alternador **Custo padrão** (padrão) ou **Custo especial**; depois busque por nome ou código (mostra até 8 resultados) e clique no produto para incluir.
4. Na tabela **Itens do mix**, ajuste **Qtd** (mínimo 1), **Margem %** (0 a 95) e, se quiser, o **custo** (clique no valor do custo para escolher outra opção).
5. `Salvar Mix` (em edição: `Salvar alterações`). Sucesso: "Mix salvo com sucesso." / "Mix atualizado com sucesso." O construtor é limpo após salvar.

O botão salvar fica desabilitado e informa o motivo: "Selecione o cliente para salvar", "Informe o nome do mix para salvar", "Adicione ao menos um produto para salvar".

Com mais de 5 itens aparecem o filtro "Filtrar itens..." e a ordenação (Ordem de inclusão, Menor margem, Maior margem, Maior subtotal). O botão **Comparativo** mostra as colunas de preço do concorrente.

### Fórmulas

| Item | Cálculo |
|---|---|
| **Preço de venda** | custo ÷ (1 − margem/100). Ex.: custo R$ 70 com margem 30% = R$ 100. |
| **Margem inicial** | **30%** (margem padrão sugerida) para todo produto incluído. |
| Alterar margem | recalcula o preço. **O preço não é digitável** — ajuste pela margem. |
| Alterar custo | mantém a margem e recalcula o preço. |
| Subtotal | quantidade × preço de venda |
| **Margem média do mix** | (venda total − custo total) ÷ venda total × 100 (ponderada pelo valor) |
| CMV % do item | custo ÷ preço de venda × 100 |
| CMV do concorrente | custo ÷ preço do concorrente × 100 |

Faixas de margem: **≥ 30% Saudável** (verde), **20–29% Atenção** (âmbar), **< 20% Baixa** (vermelho — a linha fica destacada). CMV do concorrente: até 70% verde, até 85% âmbar, acima vermelho.

### Tipos de custo

| Tipo | Origem | Quem vê |
|---|---|---|
| **Padrão** | custo padrão do produto, sincronizado do sistema de gestão de custos | todos (quando > 0) |
| **Especial** | políticas de custo especial | só quando o custo especial é **do próprio cliente**, o cliente está **vinculado à política**, ou a política é **geral** (sem clientes). Custo especial **não vaza** entre clientes. |

- O alternador "Custo padrão / Custo especial" define o custo escolhido **no momento da inclusão**; com "especial" marcado, se o produto não tiver custo especial para aquele cliente, usa o padrão. Depois dá para trocar item a item.
- Produto **sem nenhum custo** entra com R$ 0 e aviso "Nenhum custo disponível para este produto. Produto adicionado com custo zero." e a etiqueta "Custo zero: verificar fonte".

### Atualização dos custos

- Os custos são sincronizados **automaticamente a cada 30 minutos** (minutos 00 e 30), e o catálogo de produtos é atualizado **toda segunda-feira às 8h**. Não há botão manual na tela.
- Se a última sincronização tiver mais de 2 horas, aparece: "Custos sincronizados há {N}. Os valores podem estar desatualizados." Persistindo, abrir chamado em Suporte.

### Meus Mix — ações (menu ⋮)

| Ação | O que faz |
|---|---|
| **Visualizar** | resumo do mix (itens, unidades, valor final) |
| **Editar Mix** | abre no Construtor |
| **Duplicar Mix** | cria "{nome} - Cópia" e abre em edição |
| **Enviar ao Histórico** | registra o mix no **Histórico do cliente** (aba Clientes → Histórico, tipo "Mix"). A lista não indica se já foi enviado. |
| **Imprimir/PDF** | abre a proposta para impressão — escolha "Salvar como PDF". **Não mostra custo nem margem** (pode ir para o cliente). |
| **Excluir** | confirmação "Excluir <nome> e todos os seus itens? Esta ação não pode ser desfeita." |

**Exportar planilha (CSV)** (botão Exportar do Construtor, no mix aberto): separador ";", decimais com vírgula, **inclui custo, margem e CMV** — uso interno.

### Perguntas frequentes

- **"Custo especial não aparece."** O cliente não é elegível à política, a política está inativa, ou o produto foi incluído com "Custo padrão" marcado — troque pelo menu do custo do item.
- **"Troquei o cliente e os custos ficaram errados."** Itens já incluídos mantêm o custo do cliente anterior. Escolha o cliente antes, ou remova e inclua de novo os itens.
- **"Produto com custo zero."** Não há custo padrão nem especial sincronizado; verificar com a área de custos/TI.
- **"Não acho o produto."** A busca procura trecho do nome ou código (sem tolerância a erro de digitação) e mostra só 8 resultados — refine.
- **"Não consigo digitar o preço."** Ajuste a margem.
- **"Cliente não aparece."** Só clientes da sua carteira (ou da carteira que você cobre nas férias). Coordenador não vê a carteira do time nesta tela.
- **"O PDF não abre."** Libere pop-ups do site ("Libere os pop-ups deste site para gerar o PDF do mix.").
- **"O mix não aparece no histórico do cliente."** Use "Enviar ao Histórico".

---

## 8. Analytics, Metas e Acompanhamento Semanal

> Rotas: `/analytics` (menu **Analytics**, todos), `/acomp-semanal` (menu Gestão → **Acomp. Semanal**, perfis de gestão), `/admin-acomp-semanal` (restrito à TI). A visão semanal do vendedor fica na aba **Semanal** do Analytics.

---

### Conceitos

#### Faturamento bruto, devolução e líquido
- **Bruto** = total vendido no período (vendas importadas do ERP Winthor/TOTVS).
- **Devolução** = valor das notas de devolução.
- **Líquido (realizado)** = bruto − devoluções. É o número usado para meta.

#### Quando uma venda conta para o vendedor
A venda conta **somente** se (1) o cliente está na **carteira** do vendedor **e** (2) a filial/departamento (e seção, quando definida) da venda batem com um **escopo de BU ativo** do vendedor. O código RCA da nota **não** decide a atribuição. Venda de cliente da carteira em outra BU não conta para ele; o mesmo cliente pode contar para vendedores diferentes em BUs diferentes.

#### Semana operacional (sexta a quinta, recortada no mês)
- A semana comercial vai de **sexta a quinta**.
- É **recortada no mês**: a semana 1 sempre começa no dia 1 e a última termina no último dia. Um mês tem de 4 a 6 semanas. Ex.: outubro/2026 — Sem 1: 01/10; Sem 2: 02–08/10; Sem 3: 09–15/10; Sem 4: 16–22/10; Sem 5: 23–29/10; Sem 6: 30–31/10. Semana de um dia só é normal.
- ⚠️ O Dashboard e a Agenda usam a **semana calendário (seg–sex)** para a meta de visitas — são semanas diferentes.

#### B/W (variação)
- Por semana: (semana N do mês − semana N do mês anterior) ÷ semana N do mês anterior.
- No fechamento: (mês − mês anterior) ÷ mês anterior.
- **"Sem base"**: o mês anterior foi zero (não há como calcular). Verde = alta, vermelho = queda, cinza = zero/sem base.

---

### Analytics (`/analytics`)

Cabeçalho "ANALYTICS COMERCIAL — Performance, carteira, mix e devoluções do vendedor logado." Abas: **Overview, Semanal, Clientes, Produtos, Metas** (só coordenador/diretoria) e **Comparativo**.

#### Filtros da análise
| Filtro | Opções |
|---|---|
| Período | **Último mês** (padrão — na prática é o **mês corrente inteiro**), Último trimestre (3 meses contando o atual), Último ano (12 meses), Intervalo personalizado (DD/MM/AAAA) |
| Filiais / Departamentos / Seções | para quem tem filtro de escopo |
| Ramos, Cliente | todos |

⚠️ **Os filtros só valem depois de clicar em `Buscar`.** Aviso da tela: "Alterações nos filtros só afetam os blocos após clicar em Buscar." Erro parcial: "Alguns blocos não carregaram."

#### Overview
- Cards: **Meta do período** (meta distribuída pelo coordenador), **Faturamento líquido** ("R$ X bruto menos devoluções"), **Falta para meta** (% atingido), **Total devolvido** (% do bruto).
- **Progresso da meta** e **Projeção por dias úteis** = líquido ÷ dias úteis já passados × dias úteis do período (segunda a sexta; **feriados não são descontados**).
- **Evolução Histórica** (barras = líquido; linha tracejada = meta), **Ranking de Produtos** (por valor e por quantidade), **Devoluções do Período** (cards, maiores devoluções, detalhamento paginado de 50; casos com mais de 30 dias destacados).

#### Semanal
Mostra o Acompanhamento Semanal do vendedor (ver abaixo), herdando os filtros do Analytics. Exibe **um mês**: o da data final do período.

#### Clientes
- **Análise de Carteira**: Carteira, **Ativos** (compraram no período), **Inativos** e **Em risco** (clicáveis, listam até 500), **Novos** (primeira compra no período), Ticket médio.
- **Indicador de Tipos de Visita** (visitas concluídas por tipo, média semanal).
- **Top Clientes** (ranking, segmento, tabela das 8 primeiras linhas; "Evolução do cliente" exige selecionar clientes no filtro).

#### Produtos
Top produtos (valor, quantidade, devolução), Distribuição por Fornecedores, Tendência de ranking, Faturamento por ramo, Top produtos por ramo.

#### Comparativo
Até **4 blocos** lado a lado, cada um com Categoria (Cliente, Ramo, Seção, Produto, Departamento), Métrica (QTD ou Preço/Faturamento) e período próprio. Gráfico mostra os 6 primeiros. `Exportar Excel` gera `comparativo-analytics-AAAA-MM-DD.xlsx` com variação entre blocos.
- Em Cliente/Ramo, "QTD" = número de pedidos; em Seção/Departamento a métrica é sempre faturamento.

#### Gráficos e tabelas
Os gráficos mostram valores ao passar o mouse (sem drill por clique). Nas tabelas, o clique no cabeçalho ordena — colunas de valor formatado em R$ podem ordenar alfabeticamente.

---

### Aba Metas — redistribuição da meta (coordenador)

#### De onde vem a meta
1. **Diretoria → BU:** o planejamento estratégico define meta por **BU + UF**. Cada filial recebe a meta da sua UF; com várias filiais da BU na mesma UF, a divisão é pelo faturamento dos 12 meses anteriores. Se a diretoria lançar meta manual da BU (tela Gestão de Metas), ela **prevalece**.
2. **Coordenador → vendedor:** o coordenador redistribui a meta da BU entre a equipe. Essa é a meta usada no Dashboard, no Overview e nos painéis.

**Quem edita:** apenas **coordenador**. A **diretoria acompanha em modo leitura** (botão "Somente leitura"; mensagem "Diretoria acompanha as metas em modo leitura. A redistribuição permanece com os coordenadores."). Quem tem as duas permissões também fica em leitura.

#### Tela
- Filtros próprios (independentes do Analytics): **Mês de referência**, **Ano**, **Filial / BU**, **UF**, **Ramo**; botão `Atualizar Dados`.
- Status: "rateio fechado", "nao distribuido", "em aberto", "alteracoes nao salvas".
- Cards: **Meta geral** (meta da diretoria para as BUs; mostra a origem), **Total distribuído**, **Saldo disponível**, **Vendedores com meta**.
- **Ajuste inteligente de metas:** `Ratear igual`, `Por realizado`, `Manter proporção` — **só preenchem** os campos; é preciso `Salvar`. Dica: filtre uma BU antes de ratear (com todas as BUs, o rateio mistura as BUs).
- **Detalhamento por Vendedor:** colunas Vendedor, Meta atual, **Nova meta (R$)**, Impacto, Ações. **O vendedor aparece uma vez por Filial/BU** em que atua (rótulo "Filial N · UF · Departamento") — cada uma tem meta própria.
- **Personalizar por ramo/UF** (clique no vendedor): distribui a meta entre ramos/UF; `Aplicar ao vendedor` **não grava** — só o `Salvar` principal grava. Linha personalizada não é recalculada pelo rateio.
- **Ocupação por Região** e **Insights Estratégicos** (região destaque, ramo líder, performance por estado).

#### Salvar
- Grava só o que mudou e **valida tudo antes** de gravar.
- Formatos aceitos: `1.500,50`, `1500.50`, `R$ 1.500,50`. Atenção: `1,500` = mil e quinhentos.
- Para zerar a meta de um vendedor, digite **0** (campo vazio dá "Valor de meta invalido em: ... Nada foi gravado.").
- Mensagens: "Metas salvas: N vendedor(es) e M ajuste(s) por ramo/UF." · "Nenhuma alteração para salvar." · "Nenhuma meta da diretoria encontrada para o período."
- Trocar mês/BU com edição pendente pede confirmação para descartar.

Status do vendedor: ≥ 100% acima; ≥ 80% atenção ("no ritmo"); < 80% risco; meta 0 = sem meta.

---

### Acompanhamento Semanal do vendedor (aba Semanal)

- Cards: **Clientes no mês**, **Fechamento do mês**, **Clientes em alerta**.
- Filtros: Ramo, Mês, Ano.
- **Tabela Semanal:** Cliente (clicável para detalhar), Curva, Ramo, **1ª sem ... 6ª sem** (valor + B/W), Fechamento mês anterior, Fechamento do mês (+ B/W), Status. Linha TOTAL.
- A tabela lista **toda a carteira**, inclusive clientes **sem venda no mês** (linha zerada, B/W "Sem base").
- Status (variação do fechamento): |B/W| > 25% **Alerta**; 15–25% **Fora do padrão**; < 15% **No padrão**; "Sem base".
- **Detalhe do cliente** (clique): semanas do mês com pedidos e valor; itens comparados com a mesma semana do mês anterior (Movimento: Deixou de comprar, Queda, Novo na semana, Comprou a mais, Estável); aba **Sazonalidade** (12 meses).
- **`Exportar Excel`** → `analytics-semanal-AAAA-MM.xlsx`: aba "Dados semanais" (valores como número puro, B/W como %, dá para somar/filtrar) e aba "Produtos" (somente semanas com movimento). Carteiras grandes demoram.

### Acompanhamento Semanal de gestão (`/acomp-semanal`)

- Acesso: perfis de gestão. Bloqueio: "Este módulo está disponível apenas para perfis de gestão."
- Card de sincronização: **Última sincronização TOTVS**, Status, Válidos, Erros e botão **`Sincronizar agora`** ("Sincronizacao concluida. Validos: N | Erros: N").
- Filtros: escopo, Vendedor, Filial, Departamento, Ramo, Mês, Ano. Tabela agrupada por vendedor com totais.
- Status aqui é de **recorrência**: **Alerta** = cliente que costuma comprar nesta semana (ou toda semana) e ainda não comprou; **Fora do padrão** = comprou numa semana que não é a habitual; **No padrão**.

### Sincronização das vendas

As vendas do ERP são sincronizadas automaticamente **de hora em hora, das 8h às 19h, de segunda a sexta**, e as devoluções **a cada hora**. Gestores podem forçar em `Sincronizar agora`; o botão `Atualizar` da aba Prospecção também dispara a sincronização.

### Perguntas frequentes

- **"Os números do Analytics não batem com o Dashboard/painéis."** Conferir período (Último mês = mês corrente), escopo, se clicou em Buscar, e se a tela usa bruto ou líquido. Cada painel tem regras próprias (ver seção 12 — Painéis de Gestão e Diretoria).
- **"Cliente aparece zerado no semanal."** Não comprou no mês, comprou em filial/departamento fora do seu escopo, a devolução zerou o valor, ou a sincronização ainda não rodou.
- **"Vendedor aparece várias vezes na aba Metas."** Uma linha por Filial/BU — use o filtro Filial / BU.
- **"Duas filiais da mesma BU com metas diferentes."** A meta é por UF.
- **"Diretoria não consegue editar meta."** Por regra, quem redistribui é o coordenador; a diretoria ajusta a meta da BU em Gestão de Metas.
- **"Salvei e a meta ficou errada."** Verifique separadores; `1,500` = 1.500.
- **"Substituto de férias não vê a carteira do titular no semanal."** Limitação conhecida do cálculo semanal — registrar em Suporte.
- **"Semana 1 tem só um dia."** Comportamento esperado da semana operacional recortada no mês.

---

## 9. Alertas Inteligentes e Prospecção

> Rota: `/alertas` (menu **Alertas**, com contador vermelho de não lidos). Abas: **Alertas** (padrão) e **Prospecção** (`/alertas?aba=prospeccao`). Acesso: todo usuário logado.

### Para que serve

Transformar o histórico de compras em ação: o sistema analisa as vendas de cada cliente da carteira e gera **alertas** de risco e oportunidade (produto perdido, sazonalidade, reposição, crescimento). A aba **Prospecção** prioriza quais clientes da carteira têm maior chance de recompra nesta semana.

### Aba Alertas

#### Cabeçalho
- Título **Alertas e Prospecção**; indicadores **`N alertas pendentes`** (não lidos no escopo aberto) e **`R$ X potencial`** (soma do valor dos alertas carregados/filtrados).
- Botão **`Marcar tudo como lido`** — marca os não lidos **do usuário logado**, dentro do escopo (filial/departamento/seção) aberto na tela.

#### Filtros (ficam gravados na URL)
| Filtro | Opções |
|---|---|
| Busca | "Buscar por cliente ou CNPJ..." — na prática procura **pelo nome do cliente** (sem acento/maiúsculas); **não busca por CNPJ** |
| Ramo | `Todos os ramos` + ramos presentes nos alertas carregados |
| Tipo | `Todos os avisos`, `Produto Perdido`, `Sazonalidade`, `Reposição`, `Volume Crescente`, `Não Explorado`, `Pedido Incompleto` |
| Valor mínimo | valor em R$ |
| Situação | **`Não lidos` (padrão)**, `Lidos`, `Todos` |
| `Limpar` | remove todos os filtros |

**Alertas lidos ficam ocultos por padrão.** Para revê-los, mude Situação para `Lidos` ou `Todos`.

#### Blocos
- **Oportunidades e Vendas Perdidas** — até 3 produtos com mais alertas de "Produto Perdido"/"Não Explorado", com clientes impactados e `Ver detalhes`.
- **Alertas Prioritários por Cliente** — agrupado por cliente: maior prioridade, quantidade de novos, faturamento potencial. Ações: `Ver alertas (n)`, `Cliente` (abre o cadastro), `Marcar como lido`.
- Em **Volume Crescente** aparece "Produtos para oferecer no crescimento" (sugestões pelo histórico do cliente ou de clientes do mesmo ramo).
- Gráfico histórico: `Ver padrão histórico` (Sazonalidade/Reposição) ou `Ver gráfico` (Volume Crescente). Sem dados: `Dados históricos indisponíveis`.

#### Tipos de alerta

| Tipo (tela) | Quando é gerado | Prioridade | Valor exibido |
|---|---|---|---|
| **Produto Perdido** | Cliente comprava o produto (entre 12 e 3 meses atrás) e **parou de comprar nos últimos 3 meses**. Até 3 por cliente. | Alta | média mensal histórica |
| **Sazonalidade** | Cliente comprou o produto **neste mesmo mês no ano anterior** e ainda não comprou neste mês. Até 3 por cliente. | Alta | média daquele mês |
| **Reposição** | Pelo **ciclo médio de compra**, a próxima compra do produto está prevista para **os próximos 7 dias**. | Média | sem valor (R$ 0) |
| **Volume Crescente** | Faturamento dos últimos 3 meses **acima de 120%** dos 3 meses anteriores — momento de ampliar mix. | Média | valor dos 3 meses |
| Não Explorado / Pedido Incompleto | Tipos previstos no filtro, mas **não são gerados na versão atual**. | — | — |

Prioridades exibidas: **Alta** (vermelho), **Média** (amarelo), **Baixa** (azul).

#### Mensagens
- `Não foi possível marcar o alerta como lido.` / `Não foi possível marcar todos os alertas como lidos.`
- Vazio: `Nenhum alerta no momento` — "Sua carteira não tem oportunidades ou riscos pendentes para a busca selecionada. Use o filtro de situação para rever os alertas já lidos."

#### Como os alertas são gerados (importante para o suporte)
- **Não é em tempo real.** Uma fila diária reprocessa todos os vendedores com BU ativa; o processamento roda automaticamente **a cada 10 minutos, das 6h às 20h**, alguns vendedores por vez. Um vendedor pode receber os alertas do dia algumas horas depois do início da fila.
- **Pré-requisitos** para um cliente gerar alerta: estar na **carteira** do vendedor; o vendedor ter **BU ativa** (filial + departamento); haver **vendas nos últimos 12 meses** naquela filial/departamento/seção.
- **Escopo por BU:** o alerta pertence ao par vendedor + filial + departamento. Vendedor com vários departamentos pode usar o filtro de escopo para ver um por vez. Coordenador vê só alertas das BUs dele.
- **Retenção:** alertas com mais de **60 dias** são apagados. Não se cria alerta duplicado (mesmo cliente, tipo, mês e produto) enquanto houver um igual **não lido**.
- **Marcar como lido não impede** que o alerta volte num processamento seguinte, se a situação persistir.
- **Marcar como lido só vale para alertas do próprio usuário.** Coordenador que tenta marcar alerta de um vendedor não vê mudança.
- A tela carrega no máximo **100 alertas** (por prioridade e data); busca/ramo/tipo/valor filtram dentro desses 100. Para um cliente específico, use `Ver alertas (n)` (filtra no servidor).
- **E-mail semanal:** toda **quinta-feira de madrugada** cada vendedor recebe "Resumo semanal de avisos comerciais" com os avisos dos últimos 7 dias (até 30 linhas).

### Aba Prospecção — "Prospecção desta semana"

- Subtítulo: "Semana N de <mês> — N clientes com alta tendência de recompra".
- Botão **`Atualizar`** (mostra `Sincronizando...`): dispara a sincronização de vendas e recarrega. Mensagens: `Sincronização concluída com sucesso.` / `Falha ao sincronizar os dados.`
- Filtros: `Todos` (padrão), `Alta`, `Media`, `Baixa`, `Cliente inativo`.
- Colunas: **Tendência, Cliente, Curva, Segmento, Última compra, Dias sem comprar** (vermelho quando passa do ciclo médio), **Ciclo médio, Temperatura**, ação **`Agendar visita`** (abre a Agenda com o cliente).
- Vazio: `Nenhum cliente da sua carteira com histórico de compras encontrado.`

#### Regras
- Lista os clientes **da carteira do usuário logado** (ou de quem ele substitui nas férias) **com histórico de compras**. **O filtro de escopo do topo não se aplica a esta aba.**
- **Tendência:** `Alta` = está na janela de recompra (dias sem comprar ≥ 80% do ciclo médio) **e** costuma comprar nesta semana do mês; `Media` = só uma das condições; `Baixa` = nenhuma; `Perdido` = mais de 90 dias sem comprar.
- Clientes **Perdido** aparecem só em **`Todos`** (o botão "Cliente inativo" não os mostra — limitação conhecida).
- **Curva:** a curva manual da carteira; sem ela, ticket médio de 3 meses ≥ R$ 15.000 = A, ≥ R$ 7.000 = B, abaixo = C.
- **Temperatura:** ≥ 70 Quente, 40–69 Morno, < 40 Frio (fórmula em seção 5 — Clientes — Minha Carteira, Clientes Disponíveis e Histórico do Cliente).

### Prospects (novos clientes, ainda não do ERP)

- **Cadastrar:** em **Clientes → `Novo cliente prospecto`** (razão social obrigatória + contato). Sucesso: "Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda."
- **Agendar e registrar visita de prospecção:** na **Agenda** → `+ Nova agenda` → `Visita de prospecção`; check-in/check-out iguais aos da visita comum.
- **Etapas do prospect:** Novo → Visita agendada → Visitado → Negociação → **Convertido** (virou cliente do ERP) ou **Perdido**. Prospects Convertidos/Perdidos não aparecem mais para agendamento.

### Perguntas frequentes

- **"Meu alerta sumiu."** Foi marcado como lido (mude Situação), tem mais de 60 dias, o cliente saiu da carteira/BU, ou está fora dos 100 carregados.
- **"Não aparece alerta para o cliente X."** Sem vendas em 12 meses no escopo, vendedor sem BU ativa, fila do dia ainda não processou, ou o tipo esperado (Não Explorado/Pedido Incompleto) não é gerado hoje.
- **"Marquei como lido e voltou."** A condição continua; o processamento pode gerar o alerta novamente.
- **"O contador do menu é diferente do da tela."** O menu atualiza a cada 5 min no escopo padrão; a tela usa o escopo escolhido.
- **"Busquei pelo CNPJ e não achou."** A busca é pelo nome do cliente.
- **"Cliente não aparece em Prospecção."** Precisa estar na sua carteira e ter histórico de compra; clientes Perdidos aparecem só em "Todos".

---

## 10. Solicitações de Compras

> Rota: `/solicitacoes-compras` — menu **Solicitações**.

### Disponibilidade

A tela está em fase de liberação: hoje só aparece para a conta de TI autorizada. Para os demais usuários o item **não aparece no menu**, e o acesso direto mostra "Acesso restrito — Página indisponível para este usuário — Esta tela de desenvolvimento está liberada apenas para o usuário autorizado." Executivos comuns, quando liberados, veem só as próprias solicitações; a **visão de gestão** (todas as solicitações e filtro Executivo) exige cargo de gestão/coordenação/diretoria.

### Para que serve

Canal do comercial para pedir produtos ao time de **Compras**: o executivo informa cliente, filial, tipo, prioridade, prazo e produtos; a solicitação é enviada ao sistema de Compras e o status volta automaticamente.

### Tela "Pedidos de produtos"

- Indicadores: **Total filtrado**, **Abertas na página**, **Alta prioridade**, **Prazos vencidos** (os três últimos contam só a página atual).
- Filtros: Buscar (cliente, tipo ou descrição), Status, Prioridade, Executivo (visão de gestão).
- Lista com 20 por página: #ID, status, prioridade, cliente, tipo, descrição, motivo de recusa, criação, prazo, responsável. Clique abre o detalhe com os produtos e o status de cada item vindo de Compras.

### Criar solicitação (`Nova solicitação`)

1. **Cliente** — busque e **selecione na lista** (obrigatório).
2. **Filial** — obrigatório; trocar a filial apaga os produtos.
3. **Tipo** — Produto (padrão), Complemento de mix, Cotação, Outro.
4. **Prioridade** — Média (padrão), Alta, Baixa.
5. **Prazo desejado** — calendário (obrigatório).
6. **Referência comercial** (opcional) e **Descrição** (opcional).
7. **Produtos** — busque por código ou nome (exige filial); cada produto entra com quantidade 0, que deve ser alterada. Ao selecionar um produto aparecem os gráficos "Saída geral do produto" e "Clientes compradores".
8. `Criar solicitação`.

Validações: "Informe o cliente." · "Informe o tipo da solicitação." · "Informe a filial." · "Adicione ao menos um produto com quantidade." · "Informe uma quantidade maior que zero para todos os produtos." · "Informe o prazo no formato AAAA-MM-DD."

Sucesso: "Solicitação criada e enviada para compras." ou "{N} solicitações criadas e enviadas para compras."

### Regras

- É criada **uma solicitação por produto** (referência com sufixo -1, -2...; sem referência, "SOL-<data>").
- O executivo responsável é sempre o **usuário logado**.
- Após o envio a Compras, o status passa de **Aberta** para **Em análise**. Prioridade Média/Baixa chega em Compras como "Normal".
- O status é **sincronizado automaticamente a cada carregamento da lista**: todos os itens recusados → **Recusada** (com motivo); todos atendidos → **Concluída**; algum aprovado → **Aprovada**; demais → **Em análise**.
- Se der erro no meio do envio, parte das solicitações pode já ter sido criada — conferir a lista antes de tentar de novo, para evitar duplicidade.

Status: Aberta (cinza), Em análise (amarelo), Aprovada (verde), Recusada (vermelho), Concluída (verde claro).

---

## 11. Suporte (Reportar bug) e Ajuda (Manual do vendedor)

> Rotas: `/suporte` (botão **Suporte** no rodapé do menu), `/ajuda` (menu **Ajuda** ou ícone "?" no topo). Acesso: todos.

### Reportar bug (`/suporte`)

Formulário para abrir chamado com a TI. O sistema captura automaticamente usuário, e-mail, rota atual, navegador e tamanho de tela ("Contexto capturado"). **Não coleta senha nem credenciais.**

#### Campos
- **Título do bug** (obrigatório) — ex.: "Tela de clientes não carrega".
- **Tela afetada** — ex.: "/clientes ou Dashboard".
- **Categoria** — Bug funcional (padrão), Dados incorretos, Lentidão ou travamento, Acesso ou permissão, Problema visual, Outro.
- **Prioridade** — Baixa, Média (padrão), Alta, **Crítica** (usar só quando o problema impede operação, atendimento, vendas ou acesso).
- **Descrição do problema** (obrigatória), **Passos para reproduzir**, **Resultado esperado**, **Resultado obtido**, **Impacto no trabalho**.
- **Anexo de print** (opcional) — uma imagem PNG, JPEG, WEBP ou GIF (`Selecionar print`).

Botão **`Enviar bug`**.

#### Mensagens
- "Informe o título e a descrição do problema."
- "Não foi possível anexar o print. Tente novamente."
- Sucesso: **"Protocolo BUG-AAAAMMDD-XXXXXX criado. E-mail enviado ao TI."** ou "... O e-mail falhou, mas o chamado já aparece no painel." (o chamado foi registrado mesmo assim).
- "Não foi possível enviar o chamado."

#### Regras
- O protocolo aparece num selo verde e **some ao recarregar a página — anote-o**.
- A data do protocolo é em UTC (à noite pode aparecer com o dia seguinte).
- Não há tela para o usuário acompanhar os próprios chamados; a TI acompanha pelo **Painel Dev** (restrito à equipe técnica), que lista os 100 chamados mais recentes.
- O print anexado é enviado como link — evite anexar imagens com dados sensíveis desnecessários.

#### Como orientar um bom chamado
Peça ao usuário: tela e caminho exato, o que fez (passos), o que esperava e o que aconteceu, mensagem de erro literal, cliente/visita/pedido envolvido (código), data e hora, e um print.

### Ajuda — Manual do vendedor (`/ajuda`)

Conteúdo estático com:
- **Como conduzir o dia:** (1) Dashboard no início do dia; (2) revisar a carteira em Clientes; (3) Alertas e Prospecção; (4) registrar visitas na Agenda com objetivo e resultado; (5) controlar pendências em Atividades; (6) Analytics no fim do dia/semana.
- **Regras de ouro:** registrar toda visita importante na Agenda; toda oportunidade vira próxima ação; tratar clientes em risco antes de prospecções frias; conferir filtros de período e carteira antes de analisar; atualizar o status ao concluir tarefas.
- **Manual por tela:** Dashboard, Agenda, Clientes, Atividades, Mix Builder, Analytics, Alertas e Prospecção — cada uma com objetivo, quando usar, passo a passo, boas práticas e resultado esperado.

O manual não cobre Solicitações, Suporte nem as telas de coordenação e diretoria — use esta base de conhecimento para essas.

---

## 12. Painéis de Gestão e Diretoria

> Telas: **Painel de Gestão** (`/painel-gestao`), **Análise Diretoria** (`/analise-diretoria`), **Faturamento** (`/faturamento`), **Gestão de Metas** (`/gestao-metas`), **Gestão Cadastros** (`/gestao-cadastros`) e **Painel de Validação** (`/painel-validacao`).
> Quem vê cada menu está em seção 1 — Visão Geral do Sales 360 — Perfis, Menu e Filtro de Escopo.

---

### Painel de Gestão (`/painel-gestao`)

- **Acesso:** perfis de gestão (cargo GESTOR ou ADMIN). Bloqueio: "Este painel está disponível apenas para perfis de gestão. Perfil atual: <CARGO>."
- **Período:** sempre o **mês atual** (sem filtro de mês).
- **Filtro:** "Vendedor: Toda a equipe" ou um vendedor (só vendedores com RCA vinculado).
- **Cards:** **Receita no mês**, **Meta do mês**, **Atingimento** (realizado ÷ meta; com "Clientes ativos"), **Gap da meta** ("Faltam R$ X" ou "Meta superada em R$ X"; com "Atividades pendentes").
- **Fila Operacional da Equipe:** tarefas e visitas pendentes com ação recomendada — "Cobrar conclusão imediata" (tarefa vencida), "Acompanhar andamento", "Priorizar na próxima rotina", "Reagendar ou concluir hoje" (visita atrasada), "Confirmar agenda com cliente". Vazio: "Nenhum item operacional pendente para o filtro selecionado."
- **Botão `Gerar novos alertas`** (só cargo ADMIN): com "Toda a equipe" inicia/avança o ciclo diário de alertas ("Ciclo diário de alertas iniciado. N vendedor processado agora e M pendente(s)..."); com um vendedor, recalcula os alertas dele.

Particularidades:
- **"Meta do mês" vem da tela Gestão Cadastros → Metas**, não da meta da diretoria nem da redistribuída pelo coordenador. Por isso pode aparecer R$ 0,00 ou valor diferente do Dashboard.
- Meta 0 e realizado 0 mostram "Meta superada em R$ 0,00".
- "Atividades pendentes" conta **visitas** agendadas/em andamento até hoje (não tarefas).

---

### Análise Diretoria (`/analise-diretoria`)

- **Acesso:** Diretoria e administradores. Bloqueio: "Esta análise é exclusiva para Diretoria e administradores."
- **Filtros executivos:** Mês, Ano, Coordenador, BU — **aplicar em `Atualizar análise`**.
- **Resumo Executivo:** **Meta total**, **Realizado líquido** (com bruto), **Gap para meta** (% de atingimento), **Devoluções** (% do bruto), **Clientes com compra** (pedidos); "Atingimento consolidado" com **BUs críticas** (< 80%), **Sem meta**, **Sem coord.**
- **Tendência e Comparativos:** Realizado vs Meta (6 meses), Top BUs por realizado, Coordenadores, Mapa de riscos. **Clicar numa barra filtra a página** (drill por BU ou coordenador).
- **Ranking de BUs** e **Performance por coordenador** (Meta, Líquido, Gap, % Meta, % Dev., Status).
- **Riscos Prioritários:** "Sem coordenador", "Sem meta cadastrada", "Devolução alta" (≥ 12%), "Meta crítica" (< 70%), "Atenção na meta" (< 90%), "Monitorar".

Definições: meta = meta da BU lançada em Gestão de Metas; realizado = vendas de clientes em carteira dentro do escopo de BU; devolvido = devoluções da filial/departamento pela data da devolução; líquido = bruto − devolvido; status da BU: SEM_COORDENADOR, SEM_META, ACIMA_META (≥ 100%), ATENCAO (≥ 80%), CRITICO (< 80%).

Observações: os cortes de "BUs críticas" (80%) e de "Meta crítica" (70%) são diferentes de propósito. Para desfazer um drill, escolha "Todas as BUs"/"Todos os coordenadores" e clique em Atualizar. Não há exportação.

---

### Faturamento (`/faturamento`)

- **Acesso:** Diretoria e administradores ("Esta rota é exclusiva para Diretoria e administradores.").
- **Filtros:** Mês, Ano, Coordenador, Filial, Vendedor, Cliente (múltiplo, com busca), Produto — aplicar em `Atualizar`. Listas mostram até 250 opções.
- **Resumo:** Faturamento (pedidos), Ticket médio (faturamento ÷ pedidos), Produtos vendidos (unidades), Time comercial.
- **Rankings** (clicáveis): Filiais, Coordenadores, Vendedores, Produtos, Clientes.
- **Detalhamento:** até os 500 maiores agrupamentos (coordenador, vendedor, filial, cliente, produto, departamento, seção, faturamento, itens, pedidos).

⚠️ Aqui o **faturamento é bruto** (sem descontar devoluções); na Análise Diretoria o número principal é o **líquido**. Só entram vendas de clientes em carteira e no escopo de BU do vendedor.

---

### Gestão de Metas (`/gestao-metas`) — meta da BU pela diretoria

- **Acesso:** Diretoria/Admin ("Esta tela está disponível apenas para o perfil Diretoria.").
- **Cadastrar ou editar meta:** escolha a **BU** (Filial · Depto), **Mês**, **Ano**, **Meta em R$** → `Salvar meta` ("Meta salva com sucesso."). Clicar numa linha do comparativo preenche o formulário. Se já existe meta para BU/mês/ano, o valor é substituído.
- **Comparativo meta vs realizado:** BU, Departamento, Meta, Bruto, Devolvido, Realizado Líquido, % Meta (filtros Mês, Ano, BU aplicam na hora).
- **Histórico de metas:** BU, período, meta, criado por, criado em, atualizado em. ⚠️ Guarda **só o último valor** de cada BU/mês/ano — não mostra o valor anterior.
- ⚠️ **Formato do valor:** use **vírgula** como decimal (`1500,50` ou `1.500,50`). Digitar `1500.50` grava 150050.
- A meta da BU lançada aqui **prevalece** sobre o rateio automático do planejamento estratégico e é a base que o coordenador redistribui (Analytics → Metas).
- Validações: "Selecione uma BU." / "Informe um valor de meta válido." Não há exclusão.

---

### Gestão Cadastros (`/gestao-cadastros`) — Metas e Comissões por vendedor

- **Acesso:** menu Gestão (cargo GESTOR/ADMIN).
- Abas **Metas** (Vendedor, Mês/Ano, Meta, Realizado) e **Comissões** (Vendedor, Mês/Ano, Vendas, %, Comissão). Busca por nome do vendedor; 10 por página.
- `+ Novo` / lápis abrem o formulário; `Salvar` ("Meta salvo(a) com sucesso."). O **realizado e a comissão são digitados à mão** (não são calculados).
- ⚠️ **A lixeira exclui na hora, sem confirmação.**
- ⚠️ **Formato do valor:** digite **sem separador de milhar** (`1500,00` ou `1500.00`). `1.500,00` é gravado como 0.
- Esta meta é a usada pelo **Painel de Gestão** — diferente da meta da BU (Gestão de Metas) e da meta redistribuída pelo coordenador.

---

### Painel de Validação (`/painel-validacao`)

- **Acesso:** restrito à conta de TI (ti@benenutri.com). Demais: "Esta rota é restrita ao usuário ti@benenutri.com."
- Conferência de vendas reais, devoluções, metas e vínculo de BU por pedido, cliente e item: cards (Total Realizado, Clientes, Pedidos, Itens, Ticket Médio), Composição do Faturamento (bruto estimado = líquido + devolvido), Total por Ramo, Detalhamento de Devoluções e de Vendas (50 por página, ordenação no servidor), `Exportar vendas` / `Exportar devoluções` (CSV com ";").
- Filtros aplicam em `Buscar`; o ano padrão é 2026 e a lista vai de 2024 a 2027.

---

### Por que os números diferem entre os painéis

| Tela | Período | Vendas consideradas | Devoluções | Meta |
|---|---|---|---|---|
| Dashboard / Analytics | mês corrente / filtro | carteira + escopo de BU do vendedor | descontadas (líquido) | redistribuída pelo coordenador |
| Painel de Gestão | sempre o mês atual | carteira + escopo de BU (a equipe inclui clientes sem carteira) | não descontadas | Gestão Cadastros → Metas |
| Análise Diretoria | mês do filtro | carteira + escopo de BU | descontadas | meta da BU (Gestão de Metas) |
| Faturamento | mês do filtro | carteira + escopo de BU | **não** (bruto) | — |
| Gestão de Metas | mês do comparativo | todas as vendas da filial/departamento | descontadas | meta da BU |

Ao responder divergências, pergunte **qual tela**, **qual período/filtro** e se o usuário está comparando **bruto com líquido**.

### Mensagem genérica de erro

"Não foi possível carregar este bloco agora. Tente atualizar a tela." — uma consulta falhou no servidor. Peça para recarregar a página (F5); se persistir, abrir chamado em Suporte com print e horário.

---

## 13. Governança: Papéis, RCA, BUs, Escopo, Coordenadores, Carteira e Férias

> Estas telas configuram **quem vê o quê** no sistema. A maioria dos chamados do tipo "não vejo nada" ou "minha venda não aparece" se resolve aqui.

### Glossário

| Termo | Significado |
|---|---|
| **Papel / cargo** | DIRETORIA, COORDENADOR, VENDEDOR (atribuíveis na tela Papéis de Usuários). GESTOR e ADMIN existem mas só a TI atribui. Sem cargo = VENDEDOR. |
| **RCA** | Código do vendedor no ERP TOTVS/Winthor (ex.: 936). Cada usuário tem **um** RCA e cada RCA pertence a **um** usuário. |
| **Supervisor** | RCA do supervisor do vendedor no ERP. |
| **Coordenador** | Cadastro com código de supervisor, ligado a um login e a uma lista de BUs. |
| **Filial** | Filial da empresa no ERP (ex.: 1 = Matriz). |
| **BU / Departamento** | Unidade de negócio = **filial + departamento (CODEPTO do ERP, numérico)**. |
| **Seção** | Subdivisão de um departamento. |
| **Escopo do vendedor** | Combinação **BU + filial + seção** em que o vendedor atua. Pode ter vários. |
| **Carteira** | Lista de clientes de cada vendedor (por filial e seção). |

### Checklist para um vendedor funcionar

1. **Papel** (Papéis de Usuários) — VENDEDOR é o padrão.
2. **RCA vinculado** (Governança RCA).
3. **Escopo ativo** BU + filial + seção (BUs e Vendedores ou Escopo Usuários).
4. **Vínculo RCA ↔ departamento/filial** (BUs e Vendedores, bloco "Vincular vendedor ao departamento e filial") — usado por alguns indicadores de vendas e metas.
5. **Carteira com clientes** (o próprio vendedor em Clientes → Disponíveis, ou o coordenador em Gestão de Carteira).
6. **Coordenador** cuja lista de BUs inclua a filial + departamento do vendedor (para aparecer para o coordenador).
7. **Meta** redistribuída pelo coordenador (Analytics → Metas).

---

### Papéis de Usuários (`/gestao-cargos-usuarios`) — menu Diretoria

- **Acesso:** Diretoria e administradores ("A definição de papéis é exclusiva para Diretoria e administradores.").
- Cards: Diretoria, Coordenadores, Vendedores, Outros. Busca (nome, e-mail, ID ou RCA) e filtro de papel — aplicados em `Atualizar`.
- **Como definir:** clique na linha do usuário → escolha **Diretoria**, **Coordenador** ou **Vendedor** → `Salvar papel` ("<Nome> definido como <PAPEL>.").
- **Efeitos:** DIRETORIA → seção Diretoria do menu; COORDENADOR → seção Coordenador (os dados só aparecem com o cadastro em Gestão Coordenadores); VENDEDOR → menu principal.
- ⚠️ Salvar um papel para quem era **GESTOR ou ADMIN** substitui esse cargo e a pessoa perde a seção Gestão. Ao clicar num GESTOR/ADMIN, o cartão Vendedor vem pré-selecionado — confira antes de salvar. Restaurar GESTOR/ADMIN só pela TI.
- O menu da pessoa atualiza em até **5 minutos** (ou ao recarregar a página).

### Governança RCA (`/governanca-rca`) — menu Gestão

- **Acesso:** perfis de gestão.
- **Vínculos atuais:** Usuário, E-mail, RCA ("Sem vínculo"), Supervisor ("Sem supervisor"), `Editar vínculo`.
- **Editar vínculo:** escolha o **RCA** (o supervisor é preenchido automaticamente pelo ERP, pode ser trocado) → `Salvar vínculo` ("Vínculo RCA salvo com sucesso.").
- Regra: cada RCA só pode estar ligado a **um** usuário. Antes de salvar, procure o código na busca para ver se já pertence a alguém.
- **Auditoria de alterações:** últimas 80 mudanças (quando, usuário, RCA anterior/novo, supervisor anterior/novo, quem alterou).
- Não é possível remover o RCA de um usuário por esta tela.
- Sem RCA: o vendedor não aparece para o coordenador, não pode ter férias/substituto cadastrados e indicadores por RCA ficam vazios.

### BUs e Vendedores (`/gestao-bus-vendedores`) — menu Gestão

Três blocos:

1. **BUs cadastradas** — lista com Código, Nome, Status (Ativa/Inativa), nº de vendedores; `+ Nova BU`, editar, `Inativar`/`Ativar` (sem confirmação).
   - ⚠️ BU criada por "Nova BU" recebe código automático `BU000N`, que **não corresponde a nenhum departamento do ERP**: não tem seções, não casa com vendas nem com coordenadores. Para o escopo comercial, use as BUs **numéricas** vindas do ERP.
2. **Vincular BU ao vendedor** (escopo) — BU, Vendedor, Filial, Seção (todos obrigatórios) → `Salvar vínculo` ("Vínculo BU x vendedor salvo com sucesso."). `Desvincular` inativa o vínculo (sem confirmação); recadastrar a mesma combinação reativa.
3. **Vincular vendedor ao departamento e filial** — Vendedor (só quem tem RCA), Departamento (código numérico do ERP), Filial, Nome da filial → `Salvar vínculo de departamento/filial`. Erros: "Use o código CODEPTO do TOTVS no departamento (ex.: 1, 2, 3)." · "Este vendedor não possui RCA vinculado na governança."

### Escopo Usuários (`/configuracao-escopo-usuarios`) — menu Gestão

Versão simplificada do bloco 2 acima (mesmos dados), permitindo marcar **várias seções de uma vez**: Usuário, BU, Filial, Seções → `+ Adicionar escopos` ("N escopos vinculados com sucesso."). "Foram salvos X de Y vínculos" = alguns já existiam. Remover pela lixeira (sem confirmação).

### Gestão Coordenadores (`/gestao-coordenadores`) — menu Diretoria

- **Acesso:** Diretoria ou Admin.
- **Cadastro:** Código supervisor (numérico, obrigatório), Nome (obrigatório), E-mail, **Usuário** (o login da pessoa — **essencial**), Status → `Salvar` ("Coordenador salvo com sucesso."). `Inativar/Ativar coordenador` grava na hora.
- **BUs do coordenador:** selecione o coordenador na tabela → escolha a BU → `Vincular` ("BU vinculada ao coordenador."); `Remover` desvincula.
- ⚠️ Ordem correta: **Salvar** o coordenador primeiro, depois selecionar a linha e vincular BUs.
- O coordenador enxerga os vendedores que têm **escopo ativo** em alguma das suas BUs (filial + departamento) **e RCA vinculado**.
- Sem o campo **Usuário** preenchido, o login não é reconhecido como coordenador: Gestão de Carteira e Férias ficam vazias.

### Gestão de Carteira (`/gestao-carteira`) — menu Coordenador

- **Acesso:** coordenadores com vínculo ativo ("Esta tela está disponível apenas para coordenadores com vínculo ativo.").
- Filtros: Vendedor, Ramo, busca por cliente/código (aplicam na hora). Tabela de 50 por página: Código, Cliente, Vendedor/RCA, Ramo, Cidade/UF, Status, Escopo.
- **Transferir cliente:** clique na linha → Destino → `Transferir cliente`.
- **Transferir toda carteira:** Origem → Destino → `Transferir toda carteira` (duplicados no destino são preservados sem duplicar).
- **Adicionar cliente:** escolha o Vendedor → busque → `Adicionar à carteira` (mostra até 8 resultados; Pessoa Física não aparece; o filtro Ramo do topo também limita).
- ⚠️ A mensagem de sucesso aparece mesmo quando nada muda (destino já tinha o cliente, ou vendedor fora do escopo do coordenador) — confira a lista.
- O cliente adicionado entra na primeira filial/seção do vendedor.

### Férias de Vendedores (`/ferias-vendedor`) — menu Coordenador

- **Cadastrar:** Vendedor, Substituto (diferente do vendedor), Data início e Data fim → `Cadastrar férias`.
- Validações: "Selecione o vendedor e o substituto." · "O substituto deve ser diferente do vendedor em férias." · "A data de início deve ser anterior ou igual à data de fim."
- Lista "Férias ativas e futuras" (status ATIVA ou FUTURA); **Encerrar selecionada** encerra hoje (sem confirmação).
- **O que o substituto passa a ver durante as férias ativas:** agenda e visitas do titular (listar, criar, check-in/out, editar, cancelar).
- A carteira em Clientes e o Mix Builder usam o campo **"Substituto em Férias"** da tela Configurações do titular.
- ⚠️ Limitações conhecidas: o acompanhamento semanal ainda não herda a carteira do titular; a tela não valida férias sobrepostas; só aparecem vendedores com RCA e escopo nas BUs do coordenador.

---

### Perguntas frequentes

- **"Vendedor novo não vê nada."** Seguir o checklist do topo (RCA, escopo, vínculo de departamento, carteira).
- **"Minha venda não aparece."** O cliente precisa estar na carteira **e** a filial/departamento/seção da venda precisa estar no escopo do vendedor. Escopo criado com BU `BU000N` não casa com vendas.
- **"Coordenador não vê a equipe."** Falta cadastro em Gestão Coordenadores com o **Usuário** dele, o coordenador está inativo, sem BUs, ou os vendedores não têm escopo/RCA naquela BU.
- **"Mudei o papel e o menu não mudou."** Aguardar 5 minutos ou recarregar a página.
- **"Perdi o acesso à seção Gestão depois de mudar meu papel."** Salvar papel sobrescreveu GESTOR/ADMIN — acionar a TI.
- **"Removi um vínculo por engano."** Recadastre a mesma combinação; ela é reativada.
- **"Substituto de férias não vê a carteira."** Conferir se as férias estão ATIVAS (não FUTURAS), se o substituto tem RCA, e o campo "Substituto em Férias" em Configurações do titular.

---

## 14. Rotinas Automáticas e Integrações

> Use este documento para responder "quando o dado atualiza?" e "por que ainda não apareceu?". Horários em Brasília.

### Integrações

| Sistema | O que traz/envia |
|---|---|
| **ERP Winthor/TOTVS** | Vendas (pedidos/notas), devoluções, clientes (com ramo/segmento e UF), RCAs e supervisores, filiais, departamentos e seções |
| **Planejamento estratégico** | Metas de faturamento por BU e UF (base para a meta da diretoria) |
| **Gestão de custos** | Catálogo de produtos e custos (padrão e especial) usados no Mix Builder |
| **Compras** | Recebe as Solicitações de Compras e devolve o status de cada item |
| **Google Agenda** | Recebe visitas, prospecções, reuniões, deslocamentos e atividades com prazo de quem conectou a conta |
| **E-mail** | Resumo semanal de alertas para vendedores, relatório semanal para coordenadores, chamados de suporte para a TI |

### Rotinas agendadas

| Rotina | Frequência | Efeito para o usuário |
|---|---|---|
| Sincronização de vendas (acompanhamento semanal) | **De hora em hora, 8h às 19h, segunda a sexta** | Atualiza vendas no Dashboard, Analytics, Semanal e painéis. Gestores podem forçar em **Acomp. Semanal → Sincronizar agora**. |
| Devoluções do ERP | **A cada hora** | Atualiza o faturamento líquido. |
| Clientes do ERP | **Diariamente às 4h** | Novos clientes, ramo/segmento e relação cliente/BU/vendedor. |
| Metas do planejamento estratégico | **Segundas-feiras às 7h** | Atualiza a meta recebida da diretoria por BU/UF. |
| Alertas inteligentes | Fila diária processada **a cada 10 minutos, das 6h às 20h** | Novos alertas surgem ao longo do dia, alguns vendedores por vez. |
| E-mail "Resumo semanal de avisos comerciais" | **Quintas-feiras, de madrugada (3h)** | Avisos dos últimos 7 dias para cada vendedor (até 30 linhas). |
| Relatório semanal para coordenadores | **Segundas-feiras às 8h** | Vendas da semana anterior com KPIs e gráficos por escopo. |
| Custos do Mix Builder | **A cada 30 minutos** | Atualiza custos; a tela avisa se passaram mais de 2 horas. |
| Catálogo de produtos do Mix | **Segundas-feiras às 8h** | Novos produtos no catálogo. |
| Fila do Google Agenda | **A cada 5 minutos** | Reenvia ao Google o que falhou na hora; limpa autorizações vencidas. |
| Carteira de comunicação (depto 9) | A cada 30 minutos | Mantém a carteira do usuário de comunicação com clientes do departamento 9 (filiais 1, 2 e 6). |

### Respostas prontas

- **"Fiz uma venda hoje e não aparece."** As vendas entram de hora em hora (8h–19h, dias úteis). Após o horário, entram na próxima janela. Conferir também se o cliente está na carteira e na BU do vendedor.
- **"Cliente novo no ERP não aparece no sistema."** A sincronização de clientes é diária às 4h; aparece no dia seguinte.
- **"Ainda não recebi alertas hoje."** A fila de alertas roda das 6h às 20h, alguns vendedores por vez.
- **"Meta da diretoria mudou no planejamento e não refletiu."** Atualiza às segundas, 7h (ou a diretoria pode lançar manualmente em Gestão de Metas).
- **"Custo desatualizado no Mix."** Atualiza a cada 30 min; se a tela avisa mais de 2 horas, abrir chamado.
- **"Evento não chegou ao Google."** Até 5 minutos pela fila; ver "Último erro" em Configurações.

---

## 15. Solução de Problemas — Diagnóstico por Sintoma

> Guia rápido para a central de chamados. Cada item traz causas prováveis em ordem de frequência e a ação recomendada. Detalhes nos documentos de cada módulo.

### Acesso e telas vazias

#### "Entrei e o sistema está vazio / tudo zerado"
1. Usuário novo sem configuração. Gestão deve conferir: RCA vinculado (Governança RCA), escopo BU + filial + seção (BUs e Vendedores / Escopo Usuários), vínculo de departamento/filial, carteira com clientes. Ver seção 13 — Governança: Papéis, RCA, BUs, Escopo, Coordenadores, Carteira e Férias.
2. Filtro de escopo ou período restritivo — conferir o topo da tela.
3. Falha momentânea — recarregar (F5).

#### "Não aparece o menu X"
- Itens de Coordenador, Diretoria e Gestão dependem do papel. Ver tabela de menu em seção 1 — Visão Geral do Sales 360 — Perfis, Menu e Filtro de Escopo.
- Papel alterado recentemente: aguardar 5 minutos ou recarregar.
- Diretoria não vê *Análise Diretoria*, *Faturamento* e *Gestão de Metas* no menu (acesso pelo endereço direto).
- Solicitações, Painel de Validação, Acomp. Semanal Admin e Painel Dev são restritos à TI.

#### "Esta tela está disponível apenas para..."
Mensagem de bloqueio por perfil. Coordenador precisa de cadastro ativo em Gestão Coordenadores com o **Usuário** dele; gestão precisa de cargo GESTOR/ADMIN (atribuído pela TI); diretoria precisa de papel DIRETORIA.

#### "Não consigo entrar"
- Google/Microsoft: liberar pop-ups; usar a mesma conta de sempre.
- E-mail/senha: usar "Esqueci minha senha". Contas criadas com Google/Microsoft não têm senha.
- Código de verificação: verificar spam; "Reenviar código".

#### "Não foi possível carregar este bloco agora. Tente atualizar a tela."
Falha de consulta no servidor. Recarregar; se persistir, abrir chamado em **Suporte** com print, tela e horário.

#### "Limite de execuções atingido" / sistema lento em horário de pico
O sistema tem limite de consultas por minuto somando todos os usuários. Aguardar um minuto e tentar de novo, sem clicar repetidamente.

### Vendas, metas e números

#### "Minha venda não aparece / faturamento menor que o esperado"
1. A sincronização ainda não rodou (de hora em hora, 8h–19h, dias úteis).
2. Cliente **não está na carteira** do vendedor.
3. Venda em **filial/departamento/seção fora do escopo** do vendedor (não conta para ele — esperado).
4. **Devoluções** descontadas (as telas mostram líquido).
5. Escopo cadastrado com BU criada manualmente (`BU000N`) em vez do departamento do ERP.

#### "Números diferentes entre telas"
Cada tela tem período, base e meta próprios (tabela em seção 12 — Painéis de Gestão e Diretoria). Perguntar: qual tela, qual período, qual escopo, bruto ou líquido, clicou em Buscar/Atualizar?

#### "Minha meta está zerada / errada"
- Meta do vendedor é definida pelo **coordenador** (Analytics → Metas). Sem redistribuição no mês, fica 0 ou valor antigo.
- Painel de Gestão usa outra meta (Gestão Cadastros).
- Erro de digitação de separador: em Gestão de Metas use vírgula decimal; em Gestão Cadastros não use ponto de milhar; na aba Metas, `1,500` = 1.500.

#### "Cliente aparece zerado no acompanhamento semanal"
Não comprou no mês (a tabela lista a carteira inteira), comprou fora do escopo, devolução zerou, ou sincronização pendente.

#### "Semana 1 com um dia só"
Semana operacional sexta–quinta recortada no mês — esperado.

### Agenda e visitas

#### "Visita não contou na meta"
Faltou **check-out** (com relato). Visita *Agendada* ou *Em andamento* não conta. Deslocamentos não têm conclusão na tela (limitação conhecida). Reuniões internas não contam.

#### "Não consigo agendar"
- `É permitido lançar visitas retroativas em até 5 dias.` — limite de retroativo.
- `Já existe uma visita agendada para ... às HH:MM` — mesmo horário de início.
- `Verifique se o cliente pertence à sua carteira.` — adicionar o cliente à carteira.
- Lista de prospects vazia — cadastrar em Clientes → Novo cliente prospecto.

#### "Botão Concluir visita desabilitado"
Preencher o relato.

#### "Não consigo editar/cancelar"
Visita *Em andamento* só permite encerrar; agenda interna só o criador edita; itens de outros aparecem "Somente visualização"; mudar a data exige relato da alteração.

#### "Evento não foi para o Google Agenda"
Conta conectada? Agenda de destino certa? Aguardar 5 min. Ver "Último erro" em Configurações. Reconectar. Check-in/check-out e troca de status de atividade não sincronizam. Atividade sem prazo não sincroniza.

### Clientes e carteira

#### "Cliente não aparece para adicionar"
Pessoa Física (nunca aparece), já tem dono no mesmo escopo (pedir transferência ao coordenador), já está na sua carteira, ou você não tem escopo ativo (`Seu usuário não possui vínculo ativo de filial/seção...`).

#### "Status Crítico em cliente ativo"
Coluna Status reflete a curva (C/D = Crítico), não o cadastro.

#### "Temperatura Frio (0)"
Sem compras/visitas registradas no escopo.

#### "Pedido ou mix não aparece no histórico"
Pedido fora do escopo ou em outra página; mix precisa de "Enviar ao Histórico".

### Atividades

- **Não acho excluir:** visão Kanban.
- **Concluídas sumiram:** bloco recolhido na Lista.
- **Cliente vinculado errado:** selecionar a opção na lista ao trocar.

### Mix Builder

- **Custo especial não aparece:** cliente não elegível à política, política inativa, ou produto incluído com "Custo padrão" — trocar no menu do custo.
- **Custo zero:** produto sem custo sincronizado.
- **Aviso de custos desatualizados (> 2h):** abrir chamado.
- **PDF não abre:** liberar pop-ups.

### Alertas

- **Alerta sumiu:** foi lido (mudar Situação), > 60 dias, cliente saiu da carteira/BU, ou fora dos 100 carregados.
- **Voltou depois de lido:** situação persiste; o processamento gera de novo.
- **Coordenador não consegue marcar como lido:** só o dono do alerta marca.
- **Busca por CNPJ não acha:** a busca é pelo nome.

### Coordenação e governança

- **Coordenador não vê equipe:** cadastro sem Usuário, inativo, sem BUs, ou vendedores sem escopo/RCA nessas BUs.
- **Transferência "não funcionou":** destino já tinha o cliente ou vendedor fora do escopo (a mensagem de sucesso aparece mesmo assim).
- **Substituto de férias não vê carteira:** conferir férias ATIVAS, RCA do substituto, campo "Substituto em Férias" do titular em Configurações; acompanhamento semanal tem limitação conhecida.
- **Perdeu acesso à Gestão após mudar papel:** acionar a TI para restaurar GESTOR/ADMIN.

### Preferências

- **Página inicial / modo da agenda / exibição de atividades não mudam:** preferências salvas ainda não são aplicadas (limitação conhecida).
- **Filtro de escopo volta ao padrão:** o filtro não é memorizado.

### Quando escalar para a TI (abrir chamado em Suporte)

- Mensagem de erro persistente após recarregar;
- Números divergentes depois de conferir escopo, período e regras;
- Necessidade de cargo GESTOR/ADMIN, liberação de tela restrita, criação de BU/escopo ou correção de RCA;
- Custos desatualizados por mais de 2 horas; sincronização de vendas com erros;
- Google Agenda com "Último erro" persistente após reconectar.

Oriente o usuário a informar: tela, passos, mensagem literal, cliente/visita/pedido (código), data e hora, print — e **anotar o protocolo** gerado.
