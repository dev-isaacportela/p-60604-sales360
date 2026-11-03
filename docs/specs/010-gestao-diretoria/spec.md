# Spec: Gestão, coordenação e diretoria

**ID:** 010-gestao-diretoria · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve as telas acima do vendedor como estão em
> produção, já com os defeitos conhecidos corrigidos. Regras transversais são
> citadas pelo id da spec 000 (`RNT-00N`, `RNFT-00N`). Proibido citar stack,
> tabela ou componente fora do anexo **Rastreabilidade de origem**.

## Problema

Coordenadores, diretoria e gestão usam 10 telas para acompanhar resultado e
manter os cadastros que decidem quem vê o quê (papel, código de vendedor do
ERP, BU, escopo, coordenador, carteira, férias, acesso). Hoje cada painel
calcula venda e meta de um jeito (bruto num, líquido noutro; três metas
diferentes), cadastros aceitam combinações que não funcionam (BU que não casa
com o ERP, férias sobrepostas), ações destrutivas não pedem confirmação e
várias telas dizem "sucesso" quando nada foi gravado. Resultado: chamados de
"não vejo nada" e "os números não batem" que só a TI resolve.

## Resultado esperado

Quem gerencia a força de vendas tem cadastros de governança que gravam só
combinações válidas, pede confirmação antes de desfazer algo e diz exatamente o
que mudou.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Gestão (GESTOR/ADMIN) | Manter código de vendedor do ERP e escopos; acesso de executivas de qualquer equipe | diária / sob demanda |
| Diretoria (DIRETORIA/ADMIN) | Papéis e coordenadores; férias e acesso de executivas de qualquer equipe | semanal |
| Coordenador (cadastro ativo) | Mover carteira da equipe, cadastrar férias, desativar acesso de executiva da equipe | semanal |
| TI | Mesmos acessos de gestão às telas de acesso de executivas | sob demanda |
| Rotinas automáticas | Trazer metas do planejamento estratégico, clientes e BUs do ERP | semanal / diária |

## Cenários

### Governança de cadastros

**C-012 — Escopo com várias seções, uma já existente**
- **Dado que** Ana já tem escopo ativo Filial 1 · Nutrição · Seção 2
- **Quando** o gestor adiciona Filial 1 · Nutrição com as seções 1, 2 e 3
- **Então** a mensagem é "2 escopos vinculados. 1 já existia." e Ana fica com 3 escopos ativos

**C-013 — Desvincular escopo pede confirmação**
- **Dado que** Ana tem o escopo Filial 1 · Nutrição · Seção 3
- **Quando** o gestor clica em `Desvincular` e cancela; depois clica de novo e confirma
- **Então** no primeiro caso nada muda; no segundo o escopo fica inativo, e recadastrar a mesma combinação o reativa

**C-014 — Código de vendedor já usado por outra pessoa (erro)**
- **Dado que** o código de vendedor 936 está vinculado a Ana
- **Quando** o gestor tenta vincular 936 a Bruno
- **Então** vê "O RCA 936 já está vinculado a Ana. Remova o vínculo dela antes." e nada é gravado, nem na auditoria

**C-015 — Remover o código de vendedor de um usuário**
- **Dado que** Bruno tem o RCA 940 e supervisor 12
- **Quando** o gestor clica em `Remover vínculo` e confirma
- **Então** Bruno fica "Sem vínculo" e a auditoria mostra RCA anterior 940, RCA novo vazio, supervisor anterior 12, quem removeu e quando

**C-016 — Coordenador e BUs num único salvar**
- **Dado que** a diretoria cadastra o coordenador Carlos (supervisor 45, usuário carlos@) com as BUs Filial 1 · Nutrição e Filial 2 · Nutrição
- **Quando** clica em `Salvar` uma única vez
- **Então** o cadastro e as 2 BUs são gravados juntos e a mensagem é "Coordenador salvo com 2 BUs."; código de supervisor "45A" é recusado com "Informe um código de supervisor numérico."

**C-017 — Papel novo não apaga papel de gestão**
- **Dado que** Paulo tem o papel GESTOR
- **Quando** a diretoria marca Coordenador para Paulo e clica em `Salvar papéis`
- **Então** Paulo fica com GESTOR e COORDENADOR e continua vendo o menu Gestão (RNT-001)

### Coordenação

**C-018 — Transferência que não muda nada (erro)**
- **Dado que** o cliente 1020 está na carteira de Ana e também na de Bruno, na mesma filial e seção
- **Quando** o coordenador transfere o 1020 de Ana para Bruno
- **Então** vê "Nada foi alterado: Bruno já tem este cliente nesta filial e seção." (RNT-013)

**C-019 — Transferir carteira inteira com duplicados**
- **Dado que** Ana tem 40 clientes e 3 deles já estão com Bruno na mesma filial e seção
- **Quando** o coordenador transfere a carteira de Ana para Bruno e confirma
- **Então** a mensagem é "37 clientes transferidos. 3 já estavam com Bruno." e Ana fica com 3 clientes

**C-020 — Adicionar cliente escolhendo o escopo**
- **Dado que** Ana tem escopos Filial 1 · Nutrição · Seção 1 e Filial 2 · Nutrição · Seção 1
- **Quando** o coordenador adiciona o cliente 3050 à carteira de Ana
- **Então** a tela pede a filial/seção, e o cliente entra só na escolhida

**C-021 — Férias sobrepostas são recusadas (erro)**
- **Dado que** Ana tem férias de 01/11/2026 a 15/11/2026
- **Quando** o coordenador cadastra férias de Ana de 10/11/2026 a 20/11/2026
- **Então** vê "Ana já tem férias entre 01/11/2026 e 15/11/2026." e nada é gravado (RNT-010)

**C-022 — Encerrar férias ativa e cancelar futura**
- **Dado que** hoje é 30/10/2026, Bruno tem férias ativas de 20/10 a 10/11 e Ana férias futuras de 01/12 a 15/12
- **Quando** o coordenador encerra as de Bruno e as de Ana, confirmando cada uma
- **Então** as de Bruno terminam em 30/10/2026 (ENCERRADA) e as de Ana ficam canceladas, sem fim anterior ao início

**C-023 — Coordenador desativa executiva da equipe**
- **Dado que** a executiva Joana tem escopo em Filial 1 · Nutrição, BU do coordenador Carlos
- **Quando** Carlos clica em `Desativar acesso`, informa o motivo "Desligamento" e confirma
- **Então** Joana aparece "Desativada" com o motivo, quem e quando; na próxima ação ela é desconectada e não consegue entrar; carteira e histórico continuam

**C-024 — Executiva fora das BUs do coordenador (erro)**
- **Dado que** a executiva Rita só tem escopo em Filial 3 · Medicamento, fora das BUs de Carlos
- **Quando** Carlos tenta alterar o acesso de Rita
- **Então** Rita não aparece na lista dele e um pedido forçado é recusado com "Você não tem permissão sobre esta executiva."

### Rotinas automáticas e falhas

**C-026 — Falha do servidor numa tela de governança**
- **Dado que** a consulta da lista de férias falha
- **Quando** o coordenador abre Férias de Vendedores
- **Então** o bloco da lista mostra "Não foi possível carregar este bloco agora. Tente atualizar a tela." e o formulário de cadastro continua utilizável (RNFT-007, C-007 da spec 000)

## Requisitos funcionais

### Comuns

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE liberar cada tela e item de menu desta spec pelo papel ou cadastro da RN-001, conferido no servidor a cada carga | Para cada linha da RN-001, um usuário sem o papel recebe a mensagem de bloqueio e zero dados; com o papel, vê o item no menu | must |
| RF-003 | O sistema DEVE pedir confirmação antes de toda ação da RN-025 | Cancelar a confirmação não grava nada (C-013) | must |
| RF-004 | O sistema DEVE responder toda gravação com o que mudou (RNT-013) | C-012, C-018, C-019 | must |
| RF-005 | O sistema DEVE isolar falhas por bloco em todas as telas desta spec | C-026 | must |

### Usuários

Uma tela só para papéis, vínculo RCA, escopo e acesso de cada usuário (antes Papéis de Usuários, Governança RCA, Escopo Usuários e Executivas de Venda; fundidas em 2026-11-03). A lista mostra cada usuário uma vez; `Editar` abre o painel do usuário com as partes que o papel de quem abre pode editar (RN-001).

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-022 | O sistema DEVE manter escopos por usuário (BU, filial, uma ou várias seções ou "Todas as seções") só no painel do usuário em Usuários, listando os escopos ativos dele com `Desvincular` com confirmação | C-012, C-013; BUs e Vendedores não grava escopo | must |
| RF-023 | O sistema DEVE listar usuários com busca por nome, e-mail, ID ou RCA e filtro de papel (Usuário, E-mail, Papéis, RCA ou "Sem vínculo", Supervisor ou "Sem supervisor") e permitir editar o vínculo no painel do usuário, com supervisor sugerido pelo ERP e editável | "Vínculo RCA salvo com sucesso." | must |
| RF-024 | O sistema DEVE permitir `Remover vínculo` com confirmação | C-015 | must |
| RF-025 | O sistema DEVE mostrar a auditoria das 80 últimas alterações (quando, usuário, RCA e supervisor anteriores e novos, quem alterou, observação) | C-014, C-015 | must |

### Gestão Coordenadores e papéis

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-026 | O sistema DEVE cadastrar coordenador (código de supervisor, nome, e-mail, usuário, status) junto com suas BUs num único `Salvar`, e permitir `Inativar coordenador`/`Ativar coordenador` com confirmação | C-016 | must |
| RF-027 | O sistema DEVE mostrar em Usuários, para quem edita papéis, cards por papel (Diretoria, Coordenadores, Vendedores, Outros), e permitir no painel do usuário marcar e desmarcar DIRETORIA, COORDENADOR e VENDEDOR | C-017; "<Nome>: papéis salvos (COORDENADOR, GESTOR)." | must |

### Gestão de Carteira (coordenador)

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-028 | O sistema DEVE listar a carteira da equipe (Código, Cliente, Vendedor/RCA, Ramo, Cidade/UF, Status, Escopo), 50 por página, com filtros Vendedor, Ramo e busca | Filtro Ramo "Hospital" mostra só clientes desse ramo | must |
| RF-029 | O sistema DEVE `Transferir cliente`, `Transferir toda carteira` e `Adicionar à carteira` pela RN-018/RN-019 | C-018, C-019, C-020 | must |

### Férias de Vendedores

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-030 | O sistema DEVE cadastrar férias (vendedor, substituto, início, fim por calendário) e listar "Férias ativas e futuras" com `Encerrar` | C-021, C-022 | must |

### Usuários: acesso das executivas

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-031 | O sistema DEVE mostrar na lista de Usuários a situação de acesso (Com acesso / Desativada), com filtro Todas / Com acesso / Desativadas, 20 por página, desativadas primeiro; o coordenador ativo vê só a equipe | Coordenador vê "Você vê as executivas do seu departamento." | must |
| RF-032 | O sistema DEVE, no painel do usuário, `Desativar acesso` (motivo opcional) e `Reativar acesso` com confirmação das executivas da RN-021, e bloquear a executiva no servidor | C-023, C-024 | must |

### Rotinas automáticas

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-033 | O sistema DEVE trazer as metas do planejamento estratégico toda segunda às 7h (RN-023) | Meta alterada no planejamento na sexta aparece na segunda após as 7h, com a data da execução | must |
| RF-034 | O sistema DEVE trazer clientes e BUs do ERP todo dia às 4h (RN-024) | Cliente criado no ERP em 29/10 aparece em 30/10; departamento novo no ERP vira BU no dia seguinte | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-002 | Rotinas automáticas não dependem de identificador fixo de outro projeto e rodam com identidade de integração | Revisão das rotinas; execução agendada no ambiente de produção |
| RNF-003 | Toda rotina automática registra início, fim, situação e quantidade de registros; a falha aparece na tela que depende dela | Forçar falha e ver o aviso na aba Metas do Analytics (spec 007) |
| RNF-004 | Transferência de carteira inteira com 2.000 clientes termina em até 10 s, tudo ou nada | Volume de teste no simulador |

Transversais aplicáveis: RNFT-001, RNFT-002, RNFT-004, RNFT-005, RNFT-007, RNFT-008.

## Entidades do domínio

- **BU** — departamento do ERP (código numérico), com nome e status, carregado do ERP (RN-012).
- **Escopo** — usuário + BU + filial + seção (ou todas), ativo ou inativo (spec 000).
- **Vínculo RCA** — usuário ↔ código de vendedor do ERP (1:1) e supervisor, com auditoria.
- **Coordenador** — código de supervisor, nome, e-mail, usuário, status e lista de BUs.
- **Papel** — DIRETORIA, COORDENADOR, VENDEDOR, GESTOR, ADMIN; acumuláveis (RNT-001).
- **Férias** — titular, substituto, início, fim, estado (RNT-010).
- **Bloqueio de acesso** — executiva, situação, motivo, quem alterou e quando.
- **Execução de rotina** — registro de cada sincronização automática.

## Regras de negócio

- **RN-001 — Quem acessa cada tela.**

  | Tela | Libera | Recorte |
  |---|---|---|
  | Usuários | GESTOR, DIRETORIA, ADMIN ou coordenador ativo; vínculo RCA e escopo: GESTOR ou ADMIN; papéis: DIRETORIA ou ADMIN; acesso de executivas: GESTOR, DIRETORIA, ADMIN ou coordenador ativo | todos os usuários; coordenador ativo: a equipe (RNT-004) |
  | Gestão Coordenadores | DIRETORIA ou ADMIN | todas as BUs |
  | Gestão de Carteira | coordenador com cadastro ativo e usuário vinculado | equipe (RNT-004) |
  | Férias de Vendedores | coordenador ativo; DIRETORIA ou ADMIN | equipe; todas as BUs |

  Em Usuários, quem não edita uma parte não a vê no painel do usuário. Papel COORDENADOR sem cadastro ativo não abre as telas do coordenador e vê "Seu cadastro de coordenador não está ativo. Procure a diretoria." O menu mostra exatamente as telas liberadas (spec 001).
- **RN-002 — Mensagem de bloqueio.** "Esta tela está disponível apenas para <papéis>." seguida de "Seu perfil: <papéis do usuário>", sem nome de cadastro interno.
- **RN-012 — BU.** Vem direto do ERP (Winthor): código = código numérico do departamento, nome e status do ERP, carregados pela rotina da RN-024; não há cadastro, renomeação nem inativação de BU por tela. BU inativa não aceita novos escopos nem vínculo com coordenador; os existentes continuam até serem desvinculados.
- **RN-013 — Escopo.** Usuário + BU + filial + seção (ou "Todas as seções") é única. Recadastrar uma combinação inativa a reativa; ativa conta como "já existia". Desvincular inativa, não apaga.
- **RN-014 — Vínculo RCA.** Um RCA por usuário e um usuário por RCA. Supervisor sugerido pelo ERP, editável. Vincular, trocar e remover gravam auditoria na mesma operação, com os valores reais anteriores lidos pelo servidor; tentativa recusada não gera auditoria. Sem RCA, o usuário some da equipe do coordenador (RNT-004) e não pode ter férias.
- **RN-015 — Coordenador.** Código de supervisor numérico e único; nome obrigatório; usuário obrigatório para ficar ativo; um usuário tem no máximo um cadastro ativo. Cadastro e BUs gravam juntos; remover BU tira da equipe os vendedores que só tinham escopo nela.
- **RN-016 — Papéis.** O painel do usuário em Usuários marca e desmarca DIRETORIA, COORDENADOR e VENDEDOR; GESTOR e ADMIN aparecem mas não são alterados aqui (RNT-001). Usuário sem papel = VENDEDOR. O menu da pessoa reflete a mudança em até 5 minutos ou ao recarregar.
- **RN-017 — Carteira da equipe.** O coordenador só vê e altera carteira de vendedores da sua equipe (RNT-004), recortada pelas suas BUs.
- **RN-018 — Transferência.** Origem e destino na equipe; o destino precisa ter escopo ativo na filial + departamento (+ seção, se o escopo definir) do vínculo transferido, senão "Nada foi alterado: <destino> não atua em <filial · departamento>."; o vínculo mantém filial e seção; se o destino já tem o cliente na mesma filial e seção, não duplica. Carteira inteira é tudo ou nada e responde transferidos e já existentes.
- **RN-019 — Adicionar cliente.** Só cliente disponível (regras da spec 002), nunca pessoa física; busca até 8 resultados (RNT-014); com mais de um escopo do vendedor, o coordenador escolhe filial/seção.
- **RN-020 — Férias.** RNT-010. Titular e substituto da equipe do coordenador (diretoria: qualquer), ambos com RCA, diferentes; datas por calendário. Encerrar ATIVA → fim = hoje; encerrar FUTURA → cancelada. É o único cadastro de férias.
- **RN-021 — Executivas visíveis.** Usuários sem papel DIRETORIA ou ADMIN, sem cadastro ativo de coordenador e diferentes de quem abre a tela, que tenham escopo ativo (coordenador: nas suas BUs) ou, para os perfis globais (GESTOR, DIRETORIA, ADMIN), RCA vinculado.
- **RN-022 — Bloqueio de acesso.** Motivo opcional até 500 caracteres. Executiva desativada é recusada pelo servidor em qualquer ação e na entrada, e a sessão aberta é encerrada na próxima ação, com a mensagem de acesso desativado no login. Reativar libera na hora. Carteira, histórico e vendas não mudam. Grava quem e quando.
- **RN-023 — Rotina de metas do planejamento.** Segundas às 7h (Brasília): atualiza as metas por BU, UF e mês e registra a execução; a data da última atualização aparece na aba Metas do Analytics (spec 007, RNT-015).
- **RN-024 — Rotina de clientes e BUs do ERP.** Diária às 4h: inclui clientes novos e atualiza ramo, UF e cidade; inclui departamentos novos como BU e atualiza nome e status das existentes; valor vazio no ERP não apaga o atual; registra a execução.
- **RN-025 — Confirmações.** Pedem confirmação, nomeando o alvo: `Desvincular` escopo, `Remover vínculo` RCA, `Inativar coordenador`, remover BU do coordenador, `Transferir toda carteira`, `Encerrar` férias, `Desativar acesso`.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-012 | Seções 1, 2, 3 com 2 já ativa → 2 novas, 1 existente | regra de negócio |
| C-013 | Desvincular confirmado → inativo; recadastrar → ativo, mesma combinação | regra de negócio |
| C-014 | Vincular 936 (de Ana) a Bruno → recusado, 0 linhas gravadas, 0 linhas de auditoria | regra de negócio |
| C-015 | Remover 940 de Bruno → sem RCA; auditoria anterior 940/12, novo vazio | regra de negócio |
| C-016 | Coordenador + 2 BUs → 1 cadastro e 2 BUs gravados; "45A" recusado | regra de negócio |
| C-017 | GESTOR + marcar COORDENADOR → papéis = {GESTOR, COORDENADOR} | regra de negócio |
| C-018 | Destino já tem o cliente → 0 alterados e mensagem "Nada foi alterado…" | regra de negócio |
| C-019 | 40 clientes, 3 duplicados → 37 transferidos, 3 existentes; Ana fica com 3 | regra de negócio |
| C-020 | Vendedor com 2 escopos → adicionar sem escolher escopo é recusado; com escolha grava 1 vínculo | regra de negócio |
| C-021 | Férias 01–15/11 + nova 10–20/11 → recusada | regra de negócio |
| C-022 | Encerrar ativa em 30/10 → fim 30/10; encerrar futura → cancelada | regra de negócio |
| C-023 | Desativar Joana → qualquer ação dela é recusada; entrada recusada; carteira inalterada | regra de negócio |
| C-024 | Carlos pede alteração de Rita (fora das BUs) → 0 gravados, "sem permissão" | regra de negócio |
| C-026 | Consulta da lista falha → bloco com a mensagem padrão; formulário ativo | regra de tela |
| RN-001 | Matriz papel × tela: cada tela da RN-001 (em Usuários, cada parte) recusa os perfis fora da linha; papel COORDENADOR sem cadastro → mensagem própria | regra de negócio |
| RN-002 | Bloqueio de Usuários para VENDEDOR não contém nome de cadastro interno | regra de tela |
| RN-012 | BU inativa: novo escopo recusado; escopos existentes seguem ativos; nenhuma SF desta spec grava BU | regra de negócio |
| RN-013 | Recadastro de combinação ativa → 0 novos, 1 existente | regra de negócio |
| RN-014 | Trocar 936→937 com auditoria lida do servidor mesmo se a tela enviar "anterior=999" | regra de negócio |
| RN-015 | Ativar coordenador sem usuário → recusado; segundo cadastro ativo para o mesmo usuário → recusado | regra de negócio |
| RN-016 | Desmarcar COORDENADOR de quem tem {COORDENADOR, GESTOR} → {GESTOR}; tentar alterar ADMIN por esta tela → recusado | regra de negócio |
| RN-017 | Coordenador da Filial 1 · Nutrição pede carteira de vendedor só da Filial 3 → 0 linhas | regra de negócio |
| RN-018 | Destino sem escopo na Filial 2 · Nutrição → recusado com a mensagem da regra; falha no meio da carteira inteira → nada transferido | regra de negócio |
| RN-019 | Cliente pessoa física não aparece na busca; busca devolve no máximo 8 | regra de negócio |
| RN-020 | Substituto sem RCA → recusado; substituto = titular → recusado | regra de negócio |
| RN-021 | Lista não contém DIRETORIA, coordenador ativo nem o próprio usuário | regra de negócio |
| RN-022 | Motivo de 600 caracteres → recusado; reativar → próxima ação aceita | regra de negócio |
| RN-023 | Rotina grava as metas do planejamento por BU, UF e mês e 1 execução com contagem | regra de negócio |
| RN-024 | Cliente com ramo vazio no ERP mantém o ramo atual; cliente novo e departamento novo aparecem após a execução das 4h | regra de negócio |
| RN-025 | Cada uma das 9 ações sem confirmação não chega ao servidor | regra de tela |

Verificação manual:
- [ ] Menu de DIRETORIA mostra Usuários e Gestão Coordenadores; em Usuários, a diretoria vê só papéis e o gestor só RCA e escopo
- [ ] As telas em tema escuro e em 360 px (as de diretoria só precisam ser legíveis)

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Bloqueio cita nome de cadastro interno ao vendedor | Mensagem da RN-002 | `PainelGestaoPage.tsx:197` |
| Telas e acessos liberados pelo e-mail da TI | Papel ADMIN (TI) (RNT-002) | `backend/add-gestao-acesso-executivas.mjs:24` |
| Papel COORDENADOR abre telas do coordenador que ficam vazias sem cadastro | Exige cadastro ativo, com mensagem (RN-001) | manual seção 13, Gestão Coordenadores |
| Lixeira, `Desvincular`, `Inativar`, `Remover`, `Encerrar` sem confirmação | Confirmação (RN-025) | manual seção 13 |
| `+ Nova BU` gera código BU000N que não casa com o ERP | BU vem do ERP; a tela BUs e Vendedores sai (RN-012) | manual seção 13; `backend/add-gestao-bus-vendedores.mjs:229` |
| Escopo exige seção; "Foram salvos X de Y" sem dizer quais já existiam | Seção opcional ("Todas"); resposta com novos e existentes (RN-013) | manual seção 13 |
| Não dá para remover o RCA de um usuário | `Remover vínculo` com auditoria (RF-024) | manual seção 13, Governança RCA |
| Auditoria de RCA gravada numa segunda chamada, com valores enviados pela tela | Auditoria na mesma operação, valores do servidor (RN-014) | `GovernancaRcaPage.tsx:173` |
| Telas mostram nomes de cadastro interno ao gestor | Só linguagem de negócio (RNFT-007) | `GestaoBuVendedoresPage.tsx:739,877` |
| Escopo gravado em dois lugares: bloco "Vincular BU ao vendedor" de BUs e Vendedores e tela Escopo Usuários | Só em Usuários (RF-022); a tela BUs e Vendedores sai | `GestaoBuVendedoresPage.tsx`; `ConfiguracaoEscopoUsuariosPage.tsx` |
| BUs e Vendedores tem um bloco de vínculo vendedor ↔ departamento e filial, paralelo ao escopo | Bloco sai da tela; o registro só é aposentado depois de confirmado que nada mais o usa | `GestaoBuVendedoresPage.tsx` (bloco 3) |
| Coordenador precisa ser salvo antes de vincular BUs | Cadastro e BUs num único salvar (RN-015) | manual seção 13, Gestão Coordenadores |
| Salvar papel substitui GESTOR/ADMIN e pré-seleciona Vendedor | Papéis acumulam (RN-016, RNT-001) | manual seção 13, Papéis de Usuários |
| Gestão de Carteira diz sucesso quando nada muda | Contagem do que mudou (RN-018, RNT-013) | manual seção 13, Gestão de Carteira |
| Destino da transferência não precisa atuar na BU do cliente | Destino precisa de escopo (RN-018) | `backend/add-gestao-carteira-coordenador.mjs:115` |
| Cliente adicionado entra na primeira filial/seção do vendedor | Coordenador escolhe (RN-019) | manual seção 13, Gestão de Carteira |
| Férias sobrepostas aceitas; dois cadastros de férias | Sem sobreposição; cadastro único (RN-020, RNT-010) | manual seção 13, Férias |
| Encerrar férias futuras grava fim antes do início | Férias futura é cancelada (RN-020) | `backend/migrations/update-sf-feriasvendedorencerrar-1792673536.sql:4` |
| Datas de férias digitadas como AAAA-MM-DD | Calendário, dd/mm/aaaa (RNT-011) | `FeriasVendedorPage.tsx:263` |
| Executiva desativada só é expulsa na checagem do menu a cada 5 min; o servidor não recusa | Recusa no servidor em toda ação (RN-022) | `Layout.tsx:52` |
| Cinco telas chamam o servidor sem o tratamento de erro padrão | Falha isolada por bloco (RF-005) | `docs/pendencias.md` item 6 |
| Clientes do ERP sincronizam a cada 2 dias | Diário às 4h (RN-024) | `backend/import-clientes-winthor.mjs:26`; manual seção 14 |
| Rotina de metas cita o projeto do planejamento por número fixo e o registro mais recente está sem agendamento | Leitura pela integração, sem id fixo, agendada em produção (RNF-002) | `backend/migrations/update-sf-syncintegrationbillingtargets-1790255948.sql` |

## Fora de escopo

- [ ] Painel de Validação (spec 006) e redistribuição de meta pelo coordenador (spec 007).
- [ ] Titulares de Clientes (spec 002), Direcionamento Semanal (spec 008).
- [ ] Análise Diretoria, Faturamento e Gestão de Metas: canceladas em 2026-11-03. A meta da BU vem do planejamento estratégico, que é outro sistema (RNT-009); os cenários, requisitos e regras dessas telas saíram desta spec e os ids não são reaproveitados (C-004 a C-009, C-025, RF-010 a RF-019, RN-008 a RN-010). Agenda dos Vendedores: cancelada no mesmo dia (spec 003).
- [ ] Um "Painel do coordenador" com KPIs, performance, anomalias, riscos, gaps e concentração: não há tela e as funções que existem sem tela são aposentadas (decidido em 2026-10-30).
- [ ] Painel de Gestão e Gestão Cadastros (comissões): cancelados em 2026-11-03 (D4, `docs/specs/pendencias-consolidadas.md`). Saíram desta spec os cenários C-001 a C-003 e C-010, os requisitos RF-002, RF-006 a RF-009 e RF-020, as regras RN-003 a RN-007 e RN-011 e o RNF-001; os ids não são reaproveitados. O cadastro manual de comissão deixa de existir; `Gerar novos alertas` (RF-009) fica com a spec 008.
- [ ] Tela BUs e Vendedores: sai em 2026-11-03, com o bloco "Vincular BU ao vendedor" (escopo só em Usuários) e o cadastro de BU (BU vem do ERP, RN-012). RF-021 e C-011 saíram desta spec e os ids não são reaproveitados.
- [ ] Bloco de vínculo vendedor ↔ departamento e filial de BUs e Vendedores: sai da tela; o registro é aposentado só depois de confirmado que nada mais o usa.
- [ ] Cadastro de produtos pela gestão: não há tela hoje; o catálogo vem do sistema de custos (spec 009).
- [ ] Tela para corrigir a UF de uma filial: continua ajuste da TI.
- [ ] Atribuir GESTOR e ADMIN por tela (ver Pendências da spec 000).

## Pendências

- [x] Decidido em 2026-10-30: vendas a clientes sem carteira ficam fora do realizado e aparecem no card `Vendas sem carteira` do Painel de Gestão (RN-003). *Sem efeito desde 2026-11-03: o Painel de Gestão foi cancelado (D4).*
- [x] Decidido em 2026-10-30: a aba Metas de Gestão Cadastros é retirada; a meta do vendedor é a distribuída pelo coordenador. *Sem efeito desde 2026-11-03: Gestão Cadastros foi cancelada (D4).*
- [x] Decidido em 2026-10-30: o "Painel do coordenador" não é construído; as funções que existem sem tela são aposentadas.
- [x] Decidido em 2026-10-30: o bloco de vínculo vendedor ↔ departamento e filial sai, e o registro só é aposentado depois de confirmado que nada mais o usa.
- [x] Decidido em 2026-10-30: escopo é cadastrado só em Escopo Usuários; sai o bloco duplicado de BUs e Vendedores.
- [x] Decidido em 2026-11-03: Papéis de Usuários, Governança RCA e Escopo Usuários viram uma tela só, Usuários (`/governanca-rca`); cada papel edita a sua parte (RN-001). `/configuracao-escopo-usuarios` e `/gestao-cargos-usuarios` saem do menu.
- [x] Decidido em 2026-11-03: Executivas de Venda (`/gestao-acesso-executivas`) entra em Usuários; o coordenador ativo abre Usuários com a equipe e só a parte Acesso, e o GESTOR passa a desativar e reativar o acesso de qualquer executiva.
- [x] Decidido em 2026-11-03 (D4): Painel de Gestão (`/painel-gestao`) e Gestão Cadastros (`/gestao-cadastros`) são cancelados, com o cadastro manual de comissão.
- [x] Decidido em 2026-11-03: BUs e Vendedores (`/gestao-bus-vendedores`) deixa de existir; a BU vem direto do ERP (Winthor) pela rotina da RN-024.
- [x] Decidido em 2026-10-30: não há histórico de alterações da meta da BU; guarda só o último valor e quem lançou, como hoje. *Sem efeito desde 2026-11-03: a tela Gestão de Metas foi cancelada e a meta vem só do planejamento.*
- [x] Decidido em 2026-10-30: a diretoria tem o botão `Remover lançamento manual`, que volta à meta do planejamento (RN-010). *Sem efeito desde 2026-11-03: a tela Gestão de Metas foi cancelada e a meta vem só do planejamento.*
- [x] Decidido em 2026-10-30: não; quem está de férias não pode ser substituto no mesmo período, e quem está substituindo não pode sair de férias nele.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo e da coluna Origem
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminhos de erro (C-014, C-018, C-021, C-024, C-026)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

Rotas atuais cobertas: `/painel-gestao`, `/analise-diretoria`, `/faturamento`, `/gestao-metas`, `/gestao-cadastros`, `/gestao-bus-vendedores`, `/configuracao-escopo-usuarios`, `/governanca-rca`, `/gestao-coordenadores`, `/gestao-cargos-usuarios`, `/gestao-carteira`, `/ferias-vendedor`, `/gestao-acesso-executivas` (menu "Executivas de Venda").

Páginas atuais: `PainelGestaoPage.tsx`, `AnaliseDiretoriaPage.tsx`, `FaturamentoDiretoriaPage.tsx`, `GestaoMetasDiretoriaPage.tsx`, `GestaoCadastrosPage.tsx`, `GestaoBuVendedoresPage.tsx`, `ConfiguracaoEscopoUsuariosPage.tsx`, `GovernancaRcaPage.tsx`, `GestaoCoordenadoresPage.tsx`, `GestaoCargosUsuariosPage.tsx`, `GestaoCarteiraCoordenadorPage.tsx`, `FeriasVendedorPage.tsx`, `GestaoAcessoExecutivasPage.tsx`; menu e bloqueio em `components/Layout.tsx`. Chamam o SDK direto (sem wrapper): Férias, Papéis, Carteira, Coordenadores, Metas.

| RF / RN | SFs atuais (alias · id) | Tabelas |
|---|---|---|
| RF-001, RN-001, RN-002 | painelGestaoPermissao 29 · painelCoordenadorPermissao 153 · gestaoMetasDiretoriaPermissao 167 (gate de Análise, Faturamento e Metas) · gestaoCoordenadoresPermissao 172 · gestaoCargosUsuariosPermissao 204 · gestaoAcessoExecutivasPermissao 383 | USUARIO_CARGO, COORDENADORES, INT_USER |
| RF-006–RF-008, RN-005–RN-007 — **tela cancelada em 2026-11-03 (D4): aposentar** | painelGestaoVendedores 30 · painelGestaoResumo 31 · painelGestaoOperacional 32 | METAS, EQUIPE_CLIENTE, BU_VENDEDOR, PEDIDOS_SEMANAIS_SYNC_RAW, TAREFAS, VISITAS, CLIENTE_TITULAR_DEPTO, USUARIO_BLOQUEIO |
| RF-009 — **botão do Painel cancelado (D4); fica com a spec 008** | alertasInteligentesPopular 130 · alertasInteligentesProcessarFila 264 (spec 008) | ALERTAS_* |
| RF-010–RF-013, RN-008 — **tela cancelada em 2026-11-03: aposentar** | analiseDiretoriaFiltros 198 · analiseDiretoriaResumo 199 · analiseDiretoriaBus 200 · analiseDiretoriaCoordenadores 201 · analiseDiretoriaTendencia 202 · analiseDiretoriaRiscos 203 | METAS_BU, IMP_DEVOLUCOES_TOTVS, PEDIDOS_SEMANAIS_SYNC_RAW, COORDENADORES_BU |
| RF-014–RF-016, RN-009 — **tela cancelada em 2026-11-03: aposentar** | faturamentoDiretoriaFiltros 240 · Resumo 241 · Coordenadores 242 · Vendedores 243 · Produtos 244 · Clientes 245 · Detalhe 246 · Filiais 247 | PEDIDOS_SEMANAIS_SYNC_RAW, EQUIPE_CLIENTE, BU_VENDEDOR, VENDEDOR_RCA |
| RF-017–RF-019, RN-004, RN-010 — **tela cancelada em 2026-11-03: aposentar** | gestaoMetasDiretoriaBus 168 · gestaoMetasDiretoriaListar 169 · gestaoMetasDiretoriaHistorico 170 (último valor e autor) · gestaoMetasDiretoriaSalvar 171; remover lançamento manual: nova (não existe hoje); cálculo da meta recebida: painelCoordenadorMetasBuRecebidas 195 (spec 007) | METAS_BU, INTG_MONTHLY_BILLING_TARGET, FILIAL.UF |
| RF-020, RN-011 — **tela cancelada em 2026-11-03 (D4): aposentar** | adminListarComissoes 79 · adminContarComissoes 80 · adminCriarComissao 81 · adminAtualizarComissao 82 · adminExcluirComissao 83; vendedores via painelGestaoVendedores 30 | COMISSOES |
| Aba Metas de Gestão Cadastros (sai; aposentar) | adminListarMetas 74 · adminContarMetas 75 · adminCriarMeta 76 · adminAtualizarMeta 77 · adminExcluirMeta 78 | METAS |
| RF-021 (**tela sai em 2026-11-03: aposentar**), RN-012 | adminListarBus 94 · adminContarBus 95 · adminCriarBu 96 · adminAtualizarBu 97 | BU, SECAO |
| RF-022, RN-013 (só Escopo Usuários; o bloco de BUs e Vendedores deixa de chamá-las) | adminListarVendedoresBu 98 · adminListarVinculosBuVendedor 99 · adminContarVinculosBuVendedor 100 · adminVincularBuVendedor 101 · adminDesvincularBuVendedor 102 · listarFiliais 117 · listarSecoesDisponiveis 118 | BU_VENDEDOR, FILIAL, SECAO |
| Vínculo RCA ↔ departamento (bloco sai da tela; aposentar após confirmar que nada mais usa) | vincularRcaDepartamento 112 · desvincularRcaDepartamento 113 · listarDepartamentosPorRca 114 | RCA_DEPARTAMENTO |
| RF-023–RF-025, RN-014 | listarVinculosVendedorRca 33 · vincularVendedorRca 34 · listarRcasTotvs 35 · registrarAuditoriaVinculoRca 36 · listarAuditoriaVinculoRca 37 · desvincularVendedorRca 63 (**sem uso**; base para RF-024) | VENDEDOR_RCA, VENDEDOR_RCA_AUDITORIA, RCA_TOTVS |
| RF-026, RN-015 | gestaoCoordenadoresUsuarios 173 · gestaoCoordenadoresBus 174 · gestaoCoordenadoresListar 175 · gestaoCoordenadoresSalvar 176 · gestaoCoordenadoresDefinirStatus 177 · gestaoCoordenadoresBuListar 178 · gestaoCoordenadoresBuVincular 179 · gestaoCoordenadoresBuDesvincular 180 | COORDENADORES, COORDENADORES_BU |
| RF-027, RN-016 | gestaoCargosUsuariosResumo 205 · gestaoCargosUsuariosListar 206 · gestaoCargosUsuariosSalvar 207 | USUARIO_CARGO (hoje 1 papel por usuário) |
| RF-028, RF-029, RN-017–RN-019 | gestaoCarteiraCoordenadorVendedores 158 · Ramos 159 · Listar 160 · Contar 161 · TransferirCliente 162 · TransferirToda 163 · ClientesDisponiveis 248 · ContarClientesDisponiveis 249 · AdicionarCliente 250 | EQUIPE_CLIENTE, BU_VENDEDOR, COORDENADORES_BU, VENDEDOR_RCA |
| RF-030, RN-020 | feriasVendedorListar 164 · feriasVendedorCadastrar 165 · feriasVendedorEncerrar 166; vendedores via 158 | FERIAS_VENDEDOR, FUNCIONARIOS.ID_SUBSTITUTO (segunda fonte, spec 001) |
| RF-031, RF-032, RN-021, RN-022 (hoje tela própria; agora parte de Usuários) | gestaoAcessoExecutivasListar 384 · gestaoAcessoExecutivasAlterar 385 · meuAcessoBloqueado 386 | USUARIO_BLOQUEIO |
| RF-033, RN-023 | syncIntegrationBillingTargets 288 (JS, cita projeto 44515) · listIntegrationBillingDimensionsLocal 289 · listIntegrationMonthlyBillingTargetsLocal 290 · getIntegrationBillingTargetSummaryLocal 291 · listIntegrationBillingSyncLogs 292 — 289–292 **sem uso** em tela | INTG_BUSINESS_UNIT, INTG_REGION, INTG_ACTIVITY_SEGMENT, INTG_MONTHLY_BILLING_TARGET, INTG_BILLING_SYNC_LOG |
| RF-034, RN-024 | SF de sincronização criada por `backend/import-clientes-winthor.mjs` (cron `0 0 4 */2 * *`) · sincronizarClientesUfRamoTotvs 294 (**sem uso** em tela; registro mais recente sem cron) | IMP_CLIENTES_TOTVS, CLIENTES, CLIENTE_BU_VENDEDOR |

SFs do módulo **sem uso** no frontend (aposentar; decidido em 2026-10-30):
painelCoordenadorKpis 154 · painelCoordenadorPerformanceVendedores 155 · painelCoordenadorDevolucoesRecentes 156 · painelCoordenadorAnomaliasTerritorio 189 · painelCoordenadorVendedoresRisco 190 · painelCoordenadorClientesSemCompra 191 · painelCoordenadorGapMetaVendedor 192 · painelCoordenadorDevolucoesCriticasRca 193 · painelCoordenadorConcentracaoClientes 194 (todas em `backend/add-painel-coordenador-*.mjs`, atualizadas por migrations `update-sf-painelcoordenador*`) · adminListarProdutos 68 · adminContarProdutos 69 · adminCriarProduto 70 · adminAtualizarProduto 71 · adminInativarProduto 72 · adminExcluirProduto 73 · desvincularVendedorRca 63 · 289–292 · 294.

painelCoordenadorSemCarteiraDetalhe 213 (base do card `Vendas sem carteira`, sem uso): aposentar com o Painel de Gestão (D4).

SFs usadas por estas telas mas de outra spec: adminListarVendedores 145 (Acomp. Semanal Admin, spec 006; tela cancelada) · painelCoordenadorMetasBuRecebidas 195, painelCoordenadorMetasVendedoresBu 196, painelCoordenadorSalvarMetaVendedorBu 197, metasVendedorRamoUfAplicadas 295, painelCoordenadorSalvarMetaVendedorRamoUf 296, painelCoordenadorSincronizarMetaVendedorPorRamo 396 (spec 007).

Agendamentos: metas do planejamento (segunda 7h) e clientes (4h) conforme manual seção 14; o cron das metas não está no repositório.
