# Spec: Agenda e visitas

**ID:** 003-agenda-visitas · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve a Agenda que está em produção, já com os
> defeitos conhecidos corrigidos. Regras transversais são citadas pelo id
> (`RNT-00N`, `RNFT-00N`) da spec 000. Proibido citar stack, tabela ou
> componente fora do anexo **Rastreabilidade de origem**.

## Problema

A visita é o trabalho do vendedor externo e a base da meta semanal de visitas. Hoje a Agenda tem
furos que distorcem esse número e a confiança nele: deslocamento nunca pode ser concluído e por isso
nunca soma no realizado; o primeiro cliente da lista vem marcado e gera visita no cliente errado;
check-in e check-out usam o relógio do aparelho; o check-out apaga o histórico de reagendamentos;
criar uma visita para vários vendedores pode gravar só parte delas; e o substituto de férias opera a
agenda do titular mesmo sem férias ativas. A integração com o Google Agenda funciona, mas expõe a
autorização do usuário ao navegador e falha em silêncio.

## Resultado esperado

O vendedor planeja e registra cada compromisso em poucos toques, no celular, e tudo o que ele concluiu
de segunda a sexta aparece certo na meta semanal e no Google Agenda dele.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Planejar visitas, prospecções, reuniões e deslocamentos; fazer check-in/check-out com relato; reagendar e cancelar | diária, em campo |
| Substituto de férias | Operar a agenda do titular enquanto as férias estão ativas (RNT-010) | durante as férias |
| Coordenador | Ver a agenda e os relatos da equipe sem alterar nada; registrar a própria agenda (meta de coordenador) | diária |
| Diretoria | Ver a agenda de qualquer equipe pelo filtro de escopo (RNT-003) | semanal |

## Cenários

**C-001 — Criar visita a cliente da carteira**
- **Dado que** Ana tem o cliente Mercado Sol na carteira e hoje é 04/11/2026
- **Quando** ela abre `+ Nova agenda` › `Visita com cliente`, busca "sol", escolhe Mercado Sol, data 05/11/2026, 09:00–10:00, tipo `Aumento de mix`, e clica `Criar visita`
- **Então** a visita aparece em 05/11 como Agendada (amarelo), soma 1 no planejado da semana e, se Ana conectou o Google, surge "[Agendada] Visita: Mercado Sol" das 09:00 às 10:00 na agenda de destino dela

**C-002 — Nenhum cliente vem pré-selecionado**
- **Dado que** Ana tem 40 clientes na carteira
- **Quando** abre `+ Nova agenda` e clica `Criar visita` sem escolher cliente
- **Então** vê `Selecione o cliente da visita.` e nada é gravado

**C-003 — Limite de retroativo (erro)**
- **Dado que** hoje é 10/11/2026 em Brasília
- **Quando** Ana tenta criar visita em 04/11/2026 (6 dias atrás) e depois em 05/11/2026 (5 dias atrás)
- **Então** a primeira é recusada com `É permitido lançar visitas retroativas em até 5 dias.` e a segunda é criada; a mesma recusa vem do servidor se a tela for contornada

**C-004 — Conflito de horário por sobreposição (erro)**
- **Dado que** Ana tem em 05/11 uma visita das 09:00 às 10:00, uma prospecção cancelada das 10:00 às 11:00 e um deslocamento das 11:00 às 12:00
- **Quando** tenta criar uma visita das 09:30 às 10:30, depois uma visita das 10:00 às 11:00 e depois uma reunião interna das 11:30 às 12:30
- **Então** a primeira é recusada com `Já existe uma visita agendada para você das 09:00 às 10:00 neste dia. Escolha outro horário.`; a segunda é criada (encostar no fim e ignorar cancelada não é conflito); a terceira é recusada com `Já existe um compromisso interno agendado para você das 11:00 às 12:00 neste dia. Escolha outro horário.`

**C-005 — Check-in e check-out com relato obrigatório**
- **Dado que** a visita de C-001 está Agendada
- **Quando** Ana clica `Iniciar (Check-in)` às 09:05, deixa o relato vazio, e depois preenche "Cliente aprovou 3 itens novos" e clica `Concluir visita`
- **Então** às 09:05 a visita fica Em andamento com check-in 05/11/2026 09:05 e o evento no Google passa a "[Em andamento] Visita: Mercado Sol"; com relato vazio o botão `Concluir visita` fica desabilitado com `Para finalizar a visita, preencha o relato.`; ao concluir, fica Concluída, soma 1 no realizado da semana e o evento passa a "[Concluída] Visita: Mercado Sol", com o relato na descrição

**C-006 — Atividade de follow-up que falha no check-out (borda)**
- **Dado que** Ana está concluindo a visita e adicionou 2 atividades, e a gravação da segunda falha
- **Quando** clica `Concluir visita`
- **Então** a visita fica Concluída, a primeira atividade é criada e a tela mostra `Visita encerrada, mas 1 atividade(s) não foram salvas. Revise e tente novamente.` com o botão `Salvar atividades pendentes`

**C-007 — Reagendar exige motivo quando muda a data, e preserva o histórico**
- **Dado que** a visita de 05/11 está Agendada com planejamento "Levar catálogo"
- **Quando** Ana muda a data para 06/11 sem motivo; depois informa "Cliente pediu outro dia" e salva às 14:30 de 04/11; em 06/11 conclui com relato "Pedido fechado"
- **Então** sem motivo vê `Ao alterar a data da visita, informe o motivo no relato.`; com motivo o relato recebe `Reagendamento em 04/11/2026 14:30:` seguido do motivo; após a conclusão o relato contém o reagendamento e "Pedido fechado"

**C-008 — Cancelar (erro e borda)**
- **Dado que** Ana tem uma visita Agendada, uma Em andamento e uma Concluída
- **Quando** cancela a Agendada sem motivo, depois com motivo "Cliente fechado"; e tenta cancelar as outras duas
- **Então** sem motivo vê `Informe o motivo do cancelamento da visita.`; com motivo a visita fica Cancelada (vermelho) e some do Google; Em andamento só oferece `Encerrar visita`, Concluída só `Editar Relato`, e o servidor recusa cancelar as duas mesmo se pedido

**C-009 — Deslocamento concluído com relato conta na meta**
- **Dado que** na sexta 06/11 Ana cria `Deslocamento` de Recife → Caruaru para a segunda 09/11, 07:00–09:00, com Bruno convidado
- **Quando** Ana tenta concluir em 06/11; depois, em 09/11, clica `Concluir deslocamento` com o relato vazio e em seguida com o relato "Chegada às 08:50, rota pela BR-232"
- **Então** em 06/11 vê `O deslocamento só pode ser concluído a partir do dia agendado.`; com relato vazio vê `Para concluir o deslocamento, preencha o relato.`; com relato o deslocamento fica Concluído e o realizado da semana de 09/11 sobe 1 para Ana e 1 para Bruno

**C-010 — Compromisso interno com participantes**
- **Dado que** Ana cria `Reunião interna` "Alinhamento de mix" em 10/11, 14:00–15:00, com Bruno e Carla
- **Quando** Bruno abre a agenda dele; depois Ana edita e retira Carla
- **Então** Bruno vê o compromisso com `Ver detalhes` e sem botões de editar/cancelar; Carla deixa de ver e o evento sai do Google dela; a reunião não conta na meta de ninguém

**C-011 — Visita para vários vendedores é tudo ou nada (erro)**
- **Dado que** Bruno já tem visita em 05/11 das 09:00 às 10:00
- **Quando** Ana cria visita ao Mercado Sol em 05/11 das 09:00 às 10:00 selecionando Ana e Bruno
- **Então** nenhuma visita é criada e a mensagem cita Bruno; após trocar para 10:00–11:00, as duas são criadas, cada uma na agenda, na meta e no Google do respectivo vendedor

**C-012 — Substituto de férias opera a agenda do titular**
- **Dado que** Ana está de férias de 01/11 a 15/11 com Bruno como substituto
- **Quando** Bruno abre a Agenda em 05/11 e em 16/11
- **Então** em 05/11 vê as visitas de Ana identificadas como "Ana" e pode fazer check-in, check-out, reagendar e cancelar; em 16/11 as visitas de Ana somem da agenda dele

**C-013 — Coordenador vê a agenda da equipe pelo escopo, sem operar**
- **Dado que** Carlos é coordenador ativo e Ana é vendedora da equipe dele
- **Quando** Carlos abre a `Agenda` com o escopo da equipe e Ana abre a `Agenda` dela
- **Então** Carlos vê as visitas e os relatos de Ana identificados como "Ana", com `Somente visualização` nesses itens (sem check-in, reagendar ou cancelar), e continua criando a própria agenda; Ana vê só a própria agenda

**C-014 — Conectar o Google Agenda (caminho feliz e erro)**
- **Dado que** a credencial da empresa está cadastrada e Ana não está conectada
- **Quando** ela clica `Conectar Google Agenda`, autoriza e volta; em outra tentativa demora 12 minutos para voltar
- **Então** na primeira vê `Google Agenda conectado com sucesso.` e os cards `Conta conectada`, `Calendário` (nome da agenda) e `Última sincronização`; na segunda vê `A autorização expirou antes de ser vinculada. Tente conectar novamente.`

**C-015 — Trocar a agenda de destino**
- **Dado que** Ana enviou 230 compromissos para a agenda "Trabalho" e escolhe a agenda "Visitas"
- **Quando** clica `Salvar agenda`
- **Então** os 230 eventos saem de "Trabalho", a tela mostra `Agenda de destino alterada. Os próximos compromissos vão para ela.` e cada compromisso volta a aparecer em "Visitas" quando for criado ou atualizado

**C-016 — Falha de envio ao Google e nova tentativa (borda)**
- **Dado que** o Google está fora do ar às 10:00
- **Quando** Ana cria uma visita às 10:00 e salva a mesma visita mais 4 vezes
- **Então** a visita é gravada normalmente, a Agenda avisa `Não foi possível enviar ao Google Agenda agora. Nova tentativa automática em até 5 minutos.`, existe 1 pedido de reenvio (não 5) e, com o Google de volta, um único evento é criado até 10:05

**C-017 — Histórico do cliente na Agenda**
- **Dado que** Mercado Sol tem 15 visitas, 4 atividades e 9 pedidos
- **Quando** Ana clica no nome sublinhado do cliente numa visita
- **Então** abre `Histórico de Mercado Sol` com os contadores Visitas, Tarefas e Vendas e a linha do tempo dos 10 eventos mais recentes

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE mostrar a agenda nas visões Dia, Semana (segunda a sexta; sábado e domingo só aparecem quando têm algo marcado) e Mês, com setas ‹ › e botão `Hoje` | `Hoje` leva à data atual de Brasília em qualquer visão; a visão inicial é a preferência `Modo padrão da Agenda` do usuário (Semana se não houver) | must |
| RF-002 | O sistema DEVE listar na agenda visitas a clientes, visitas de prospecção, compromissos internos e deslocamentos do escopo aberto (RNT-003), com cor por status | Legenda: Agendada amarelo, Em andamento azul, Concluída verde, Cancelada vermelho; itens de outra pessoa sem direito de operar mostram `Somente visualização` | must |
| RF-003 | O sistema DEVE criar os quatro tipos por `+ Nova agenda` com os campos e tipos da RN-001 | C-001; campos obrigatórios conforme RN-002; mensagens literais da RN-002 | must |
| RF-004 | O sistema DEVE buscar o cliente da visita na carteira do usuário (e dos titulares cobertos por férias ativas; para coordenador, também na da equipe) a partir de 2 letras, sem pré-selecionar nenhum | C-002; busca conforme RNT-014; até 50 resultados | must |
| RF-005 | O sistema DEVE oferecer só prospects ativos na visita de prospecção | Convertido e Perdido não aparecem; lista vazia mostra "Nenhum prospect ativo encontrado. Cadastre o prospect na tela de prospecção antes de agendar." | must |
| RF-006 | O sistema DEVE recusar, no servidor, data retroativa além de 5 dias e conflito de horário | C-003 e C-004 passam também quando a tela é contornada | must |
| RF-007 | O sistema DEVE executar check-in e check-out conforme RN-006 a RN-008 | C-005 e C-006 | must |
| RF-008 | O sistema DEVE permitir editar planejamento, reagendar, cancelar e editar relato conforme o status (RN-005) | C-007 e C-008 | must |
| RF-009 | O sistema DEVE permitir concluir deslocamentos e compromissos internos (RN-011) | C-009; botão `Concluir deslocamento` / `Concluir` só para o criador, só em itens Agendados; deslocamento exige relato e só a partir da data agendada | must |
| RF-010 | O sistema DEVE permitir ao criador adicionar e retirar participantes de um compromisso interno ou deslocamento Agendado | C-010 | must |
| RF-011 | O sistema DEVE criar visitas para vários vendedores numa única operação, tudo ou nada | C-011 | must |
| RF-012 | O sistema DEVE aplicar as férias ativas à agenda (RNT-010) | C-012 | must |
| RF-013 | O sistema DEVE mostrar na `Agenda`, quando o coordenador ativo ou a diretoria abre o escopo da equipe (RNT-003), os itens das outras pessoas com `Somente visualização` (RN-012) | C-013 | must |
| RF-014 | O sistema DEVE mostrar o painel lateral com `Status da Meta Semanal` (realizado × meta da semana exibida, regra da spec 005), `Resumo da semana` (Agendadas, Em andamento, Concluídas, Canceladas) e `Legenda` | Os números do painel batem com o card do Dashboard para a semana atual e o mesmo escopo | must |
| RF-015 | O sistema DEVE abrir o histórico do cliente a partir da visita | C-017 | should |
| RF-016 | O sistema DEVE conectar a conta Google do usuário em um clique, com as mensagens da RN-015 | C-014 | must |
| RF-017 | O sistema DEVE listar as agendas da conta Google e permitir trocar a agenda de destino (RN-017) | C-015; principal aparece como `<nome> (principal)`; `Atualizar lista` recarrega | must |
| RF-018 | O sistema DEVE enviar ao Google os itens da RN-016 a cada criação, edição, check-in, check-out, conclusão e cancelamento | Evento criado uma vez e atualizado no mesmo lugar nas edições seguintes; o título mostra o status atual (RN-016) | must |
| RF-019 | O sistema DEVE reenviar automaticamente o que falhou (RN-018) e avisar a falha na Agenda | C-016 | must |
| RF-020 | O sistema DEVE permitir desconectar a conta Google com confirmação | Confirmação explica que os eventos já enviados ficam no Google; sucesso mostra `Google Agenda desconectado.` | must |
| RF-021 | O sistema DEVE mostrar em Configurações o estado da conexão: `Configurado`/`Não configurado`, conta, nome da agenda, `Última sincronização` (dd/mm/aaaa hh:mm) e `Último erro` | Valores formatados conforme RNT-011; erro em português (RNFT-007) | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | A visão Semana de um vendedor com 40 compromissos abre em até 2 s no celular | Cronômetro em rede 4G simulada |
| RNF-002 | Enviar ao Google não atrasa a gravação: o compromisso aparece na agenda antes da resposta do Google | Com o Google fora do ar, a criação conclui em até 2 s (C-016) |
| RNF-003 | A autorização de acesso contínuo ao Google e o segredo da credencial da empresa ficam só no servidor, guardados de forma protegida, e nenhum código de acesso ao Google trafega no endereço de uma chamada (RNFT-006) | Revisão das respostas e dos registros de chamada |
| RNF-004 | Check-in, check-out e conclusão funcionam com um toque em tela de 360 px (RNFT-003) | Verificação manual |

## Entidades do domínio

- **Visita** — compromisso com um cliente da carteira: vendedor, data, início, fim, tipo, status, planejamento, relato, data e hora de check-in e de check-out.
- **Visita de prospecção** — o mesmo para um prospect ativo (spec 008); objetivo no lugar do planejamento.
- **Compromisso interno** — reunião interna ou "Outros": criador, título, descrição, data, horário, status e participantes.
- **Deslocamento** — compromisso interno do tipo deslocamento, com origem e destino; título "origem → destino".
- **Participante** — usuário convidado para um compromisso interno ou deslocamento.
- **Conexão Google** — vínculo de um usuário com uma conta Google: conta, agenda de destino, última sincronização, último erro.
- **Vínculo de evento** — liga um item da agenda (ou atividade com prazo) ao evento no Google de cada pessoa que o recebe.
- **Pedido de reenvio** — item que falhou ao ir para o Google, com número de tentativas.

## Regras de negócio

- **RN-001 — Tipos.** Visita com cliente: `Aumento de mix` (padrão), `Gerar demanda`, `Padronização de produto`, `Positivação`, `Financeiro`, `Renegociação`, `Manutenção`. Prospecção: `Prospecção` (padrão), `Apresentação comercial`, `Diagnóstico inicial`, `Follow-up de prospecção`. Agenda interna: `Reunião interna` (padrão), `Outros`. Deslocamento: `Deslocamento`. Data padrão hoje; horário padrão 08:00–09:00.
- **RN-002 — Validação ao criar e reagendar.** Mensagens: `Preencha data, horário e tipo.`; `Selecione o cliente da visita.` / `Selecione o prospect da visita.`; `Informe o título da agenda interna.`; `Informe a origem e o destino do deslocamento.`; `O horário de fim deve ser maior que o horário de início.`. Título de agenda interna até 200 caracteres; origem e destino até 200 cada.
- **RN-003 — Retroativo.** Ao criar, e ao reagendar quando a data muda, a data não pode ser anterior a hoje − 5 dias (Brasília). Data futura não tem limite. Editar planejamento ou relato sem mudar a data nunca cai nesta regra.
- **RN-004 — Conflito.** Nenhum compromisso não cancelado da mesma pessoa pode se sobrepor a outro, qualquer que seja o tipo (visita, prospecção, reunião interna, deslocamento, "Outros"); a pessoa é o dono da visita ou prospecção, ou o criador e cada participante do compromisso interno ou deslocamento. Conflito quando início novo < fim existente e fim novo > início existente. A mensagem cita o tipo do compromisso que já existe: `Já existe uma visita agendada para <nome|você> das HH:MM às HH:MM neste dia. Escolha outro horário.`; para prospecção `Já existe uma visita de prospecção agendada ...`; para reunião interna, deslocamento ou "Outros" `Já existe um compromisso interno agendado ...`. Vale ao criar, ao reagendar e ao adicionar participante; se qualquer pessoa tiver conflito, nada é gravado e a mensagem cita essa pessoa. No reagendamento compara com os outros compromissos do **dono** do item (e dos participantes), não de quem está editando.
- **RN-005 — Ações por status.** Agendada: `Editar / Reagendar / Cancelar` e `Iniciar (Check-in)` (visita e prospecção) ou `Concluir`/`Concluir deslocamento` (interno, só criador). Em andamento: só `Encerrar visita`. Concluída: `Editar Relato`. Cancelada: só visualização. Sempre: `Ver Planejamento` (prospecção: `Ver objetivo`; interno: `Ver detalhes`) e `Ver Relato`. O servidor recusa qualquer transição fora desta tabela.
- **RN-006 — Check-in.** Só em visita ou prospecção Agendada, inclusive de data futura. Grava data e hora de Brasília no servidor e muda para Em andamento, sem confirmação, abrindo a janela `Relato e atividades` (prospecção: `Relato da prospecção`). `Voltar` mantém Em andamento.
- **RN-007 — Check-out.** Só a partir de Em andamento; exige relato com texto. Grava data e hora de Brasília, muda para Concluída e **acrescenta** o relato ao texto existente (reagendamentos anteriores ficam). Em visita a cliente permite adicionar atividades vinculadas ao cliente (título até 300, descrição até 500, prioridade Alta/Média/Baixa, data limite); atividade sem título é ignorada; falha de atividade não desfaz a conclusão (C-006).
- **RN-008 — Relato e planejamento.** Texto formatado com até 20.000 caracteres; acima disso a gravação é recusada com `O texto passou do limite de 20.000 caracteres.` (nada é cortado). Quebras de linha são preservadas.
- **RN-009 — Reagendamento.** Altera data, horário e tipo (interno: também título e descrição; deslocamento: origem e destino). Mudar a data de visita ou prospecção exige `Relato da alteração`, acrescentado com o cabeçalho `Reagendamento em dd/mm/aaaa hh:mm:`. Mudar só horário ou tipo não exige.
- **RN-010 — Cancelamento.** Só de item Agendado. Visita e prospecção: motivo obrigatório, acrescentado ao relato com `Cancelamento em dd/mm/aaaa hh:mm:`. Interno e deslocamento: motivo opcional, só o criador cancela. Botão `Confirmar cancelamento`. Não existe exclusão de compromisso.
- **RN-011 — Conclusão de interno e deslocamento.** O criador conclui um item Agendado; o status vira Concluída para todos os participantes. Reunião interna e "Outros": observação opcional. Deslocamento: relato obrigatório (vazio → `Para concluir o deslocamento, preencha o relato.`), com o limite da RN-008, e só a partir da data agendada (antes dela → `O deslocamento só pode ser concluído a partir do dia agendado.`). Deslocamento concluído conta no realizado da meta semanal do criador e de cada participante (spec 005); reunião interna e "Outros" nunca contam.
- **RN-012 — Quem opera.** Visita e prospecção: o dono e o substituto com férias ativas do dono (RNT-010). Interno e deslocamento: só o criador edita, conclui e cancela; participantes só veem. Coordenador e diretoria veem a agenda da equipe pelo escopo (RNT-003/004) sem operar itens de outra pessoa. O campo "Substituto em Férias" sem férias ativas não dá acesso.
- **RN-013 — Vários vendedores na visita.** Em visita e prospecção, `Adicionar vendedor` define para quem a visita é criada: sem seleção, só para o usuário; com seleção, uma visita por selecionado (o usuário só recebe se estiver selecionado). Conflito e retroativo valem para cada um; se qualquer um falhar, nada é criado e a mensagem cita o vendedor. Basta o cliente estar na carteira de quem cria, na de titular coberto por férias ativas ou, para coordenador, na carteira da equipe dele (RNT-004); não precisa estar na carteira do vendedor selecionado. A lista de convite traz os usuários com escopo ativo.
- **RN-014 — Participantes de interno.** Criador e participantes veem o compromisso; quem é retirado deixa de ver e perde o evento no Google.
- **RN-015 — Conexão Google.** Liberada só quando a credencial da empresa existe; sem ela o botão fica desabilitado com "A integração com o Google ainda não foi liberada pelo TI. Assim que a credencial for cadastrada, o botão de conectar fica disponível aqui.". O Google sempre pede consentimento. A conclusão vale só na mesma aba que iniciou e até 10 minutos depois. Mensagens: `Você recusou o acesso ao Google Agenda.`; `O Google não concluiu a autorização. Tente novamente.`; `Não foi possível validar a origem da autorização. Tente conectar novamente.`; `O Google não devolveu a autorização completa. Tente conectar novamente.`; `A autorização expirou antes de ser vinculada. Tente conectar novamente.`; `Não foi possível concluir a autorização com o Google.`; `Falha ao conectar o Google Agenda.`. Conectado, o botão vira `Reconectar conta Google`. O vínculo é sempre com o usuário logado (RNT-012).
- **RN-016 — O que vai para o Google.** Só eventos gerados pelo sistema, na agenda de destino de cada pessoa que conectou: visita "Visita: <cliente>" (tipo, cidade, endereço, relato em texto simples; local = endereço e cidade); prospecção "Prospecção: <nome>" (objetivo, local, resumo, próximo passo); interno "<título>" e deslocamento "Deslocamento: origem → destino" para criador e cada participante (tipo, descrição, trajeto, participantes; local = destino); atividade com data limite "Lembrete: <título>" das 09:00 às 09:15 da data limite (spec 004). Rodapé "Fonte: Comercial Externo 360". Fuso de Brasília. O título de visita, prospecção, interno e deslocamento começa pelo status atual entre colchetes: `[Agendada]`, `[Em andamento]` ou `[Concluída]` (ex.: "[Concluída] Visita: Mercado Sol"); o lembrete de atividade não leva status. Após o check-out (ou a conclusão), o relato vai na descrição. Atualiza: criar, reagendar/editar, editar relato, check-in, check-out, conclusão. Cancelamento remove o evento. Edições manuais no Google de um evento do sistema são sobrescritas na sincronização seguinte. Compromissos pessoais nunca são lidos nem alterados.
- **RN-017 — Agenda de destino.** A principal é guardada como "principal", não pelo e-mail. Escolher a agenda atual responde `Esta já é a agenda de destino.` sem mexer em nada. Trocar remove do destino anterior **todos** os eventos já enviados pelo sistema e só então grava o novo destino; os eventos reaparecem no novo destino quando cada item é criado ou atualizado. Sem permissão de listar agendas (conexão antiga), a tela mostra "Não foi possível listar suas agendas do Google. Se você conectou antes desta atualização, clique em Reconectar conta Google..." e aceita o identificador digitado (`primary` = principal).
- **RN-018 — Reenvio.** Se o envio falhar, o compromisso fica gravado e entra num pedido de reenvio único por item (salvar o mesmo item 5 vezes gera 1 pedido), processado a cada 5 minutos, sem duplicar evento. Após 5 tentativas sem sucesso o item para de ser reenviado e aparece em Configurações como não enviado, com `Tentar novamente`. `Último erro` vai para o dono da conta Google que falhou e some na próxima sincronização bem-sucedida.
- **RN-019 — Desconectar.** Apaga a conexão do usuário e para os envios; eventos já enviados ficam no Google. Falha: `Falha ao desconectar Google Agenda.`.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Criar visita de Ana ao cliente da carteira em 05/11 09:00–10:00 grava 1 visita Agendada de Ana; a listagem da semana 02–08/11 devolve 1 item | regra de negócio |
| C-002 | Formulário aberto com 40 clientes tem cliente vazio; criar sem cliente devolve `Selecione o cliente da visita.` | regra de tela |
| C-003 | Hoje 10/11/2026: data 04/11 recusada no servidor (0 gravados, mensagem do retroativo); 05/11 aceita | regra de negócio |
| C-004 | Existente 09:00–10:00: 09:30–10:30 recusada; 10:00–11:00 aceita; existente cancelada 10:00–11:00 ignorada; deslocamento 11:00–12:00 faz a reunião interna 11:30–12:30 ser recusada com a mensagem de compromisso interno | regra de negócio |
| C-005 | Check-in grava "2026-11-05 09:05" e Em andamento e atualiza o evento para "[Em andamento] Visita: Mercado Sol"; check-out com relato vazio grava 0; com relato grava Concluída e data de check-out, e o evento fica "[Concluída] Visita: Mercado Sol" com o relato na descrição | regra de negócio |
| C-006 | Conclusão + 2 atividades com a 2ª falhando: visita Concluída, 1 atividade criada, mensagem com "1 atividade(s)" | regra de tela |
| C-007 | Reagendar 05/11→06/11 sem motivo grava 0; com motivo, relato termina em "Reagendamento em 04/11/2026 14:30:" + motivo; check-out depois mantém esse trecho | regra de negócio |
| C-008 | Cancelar Agendada sem motivo grava 0; com motivo grava Cancelada; cancelar Em andamento e Concluída grava 0 | regra de negócio |
| C-009 | Deslocamento de 09/11: concluir em 06/11 grava 0 e devolve a mensagem de data; em 09/11 sem relato grava 0; com relato grava Concluído e o realizado da semana 09–13/11 = 1 para Ana e 1 para Bruno | regra de negócio |
| C-010 | Bruno participante não consegue editar (0 gravados); retirar Carla: listagem de Carla não traz o compromisso; reunião concluída não soma na meta | regra de negócio |
| C-011 | Visita para Ana+Bruno com conflito em Bruno grava 0 visitas; sem conflito grava 2 | regra de negócio |
| C-012 | Férias 01–15/11: em 05/11 Bruno lista e faz check-in em visita de Ana; em 16/11 lista 0 visitas de Ana e check-in grava 0 | regra de negócio |
| C-013 | Coordenador ativo com escopo da equipe recebe os itens de Ana e qualquer gravação dele em item dela grava 0; Ana não recebe itens de outra pessoa | regra de negócio |
| C-014 | Conclusão da conexão com 12 min de atraso é recusada; com aba diferente é recusada; dentro de 10 min vincula ao usuário logado mesmo com outro id enviado | regra de negócio |
| C-015 | Troca com 230 eventos enviados remove 230 no destino antigo antes de gravar o novo destino; escolher o destino atual não remove nada | regra de negócio |
| C-016 | Google indisponível: visita gravada; 5 salvamentos = 1 pedido de reenvio; reenvio bem-sucedido cria 1 evento; 5 falhas marcam o item como não enviado | regra de negócio |
| C-017 | Cliente com 15 visitas, 4 atividades, 9 pedidos: contadores 15/4/9 e linha do tempo com 10 itens | regra de negócio |
| RN-001 | Formulário de visita nasce com tipo `Aumento de mix`, data de hoje e 08:00–09:00; de prospecção com `Prospecção` | regra de tela |
| RN-002 | Fim 09:00 com início 09:00 devolve `O horário de fim deve ser maior que o horário de início.`; título com 201 caracteres recusado | regra de tela |
| RN-003 | Visita Agendada de 01/11 com planejamento editado em 10/11 sem mudar data é aceita | regra de negócio |
| RN-004 | Reagendar visita de Ana feito por Bruno (substituto) compara com a agenda de Ana, não a de Bruno; Bruno participante de reunião 14:00–15:00 → visita dele 14:30–15:30 recusada; criar reunião 09:00–10:00 convidando Bruno, que tem visita 09:30–10:30, grava 0 e a mensagem cita Bruno; adicionar Bruno a um deslocamento que sobrepõe outro compromisso dele grava 0 | regra de negócio |
| RN-005 | Concluir item Cancelado grava 0; editar relato de item Agendado grava 0 | regra de negócio |
| RN-006 | Check-in em Em andamento grava 0; check-in em 04/11 de visita Agendada para 05/11 é aceito; hora gravada vem do servidor mesmo se o aparelho estiver 2 h adiantado | regra de negócio |
| RN-007 | Check-out em Agendada sem check-in grava 0 | regra de negócio |
| RN-008 | Relato com 20.001 caracteres recusado com a mensagem do limite; com 20.000 aceito íntegro; quebra de linha preservada | regra de negócio |
| RN-009 | Mudar só a hora 09:00→10:00 sem motivo é aceito e não acrescenta cabeçalho | regra de negócio |
| RN-010 | Interno cancelado sem motivo é aceito; participante cancelando grava 0 | regra de negócio |
| RN-011 | Reunião interna concluída sem observação é aceita e o realizado fica inalterado; deslocamento com relato de 20.001 caracteres recusado; deslocamento agendado num sábado e concluído nele não conta | regra de negócio |
| RN-012 | "Substituto em Férias" preenchido sem férias ativas: substituto lista 0 itens do titular | regra de negócio |
| RN-013 | Cliente fora da carteira de quem cria: 0 visitas gravadas e mensagem `Não foi possível criar a visita. Verifique se o cliente pertence à sua carteira.`; cliente da carteira de Ana e fora da de Bruno, visita criada por Ana para Bruno → 1 visita gravada para Bruno | regra de negócio |
| RN-014 | Participante retirado: vínculo de evento dele marcado como removido | regra de negócio |
| RN-015 | Sem credencial da empresa o botão nasce desabilitado com o aviso do TI; recusa no Google mostra `Você recusou o acesso ao Google Agenda.` | regra de tela |
| RN-016 | Visita criada → título "[Agendada] Visita: <cliente>"; check-in → "[Em andamento] ..."; check-out → "[Concluída] ..." com relato na descrição; deslocamento concluído → "[Concluída] Deslocamento: Recife → Caruaru"; visita cancelada remove o evento; atividade sem data limite não gera envio; lembrete de atividade sem status no título; relato com formatação vai como texto simples | regra de negócio |
| RN-017 | Agenda principal gravada como "principal"; salvar a mesma agenda devolve `Esta já é a agenda de destino.` | regra de negócio |
| RN-018 | Falha de envio grava `Último erro` no dono da conta que falhou (participante), não em quem salvou | regra de negócio |
| RN-019 | Desconectar zera a conexão do usuário e não remove eventos do Google | regra de negócio |
| RNF-003 | Nenhuma resposta usada pela tela contém a autorização contínua ou o segredo da credencial | regra de negócio |

Verificação manual:
- [ ] RF-001 / RNF-004 — Dia, Semana e Mês usáveis em 360 px; check-in e conclusão com um toque
- [ ] RF-002 — cores da legenda corretas em tema claro e escuro (RNFT-004)
- [ ] C-014 — fluxo real de conexão com uma conta Google de teste, do clique à volta

## Fora de escopo

- [ ] Excluir compromisso definitivamente: o cancelamento com motivo é o único caminho (a exclusão que existe hoje não tem uso em nenhuma tela).
- [ ] Ler ou importar compromissos pessoais do Google; sincronizar de volta edições feitas no Google.
- [ ] Check-in com geolocalização ou foto.
- [ ] Notificação push ou e-mail de lembrete de visita.
- [ ] Rota otimizada entre visitas e cálculo de quilometragem do deslocamento.
- [ ] Cadastro de prospect (spec 008) e regras de atividade além da criação no check-out (spec 004).
- [ ] Definição e configuração da meta semanal de visitas (spec 005).
- [ ] Tela separada `Agenda dos Vendedores`: cancelada em 2026-11-03. O coordenador vê a agenda da equipe na própria `Agenda`, pelo escopo (C-013, RN-012).

## Pendências

- [x] Decidido em 2026-10-30: todos os compromissos (visita, prospecção, reunião interna, deslocamento, "Outros") bloqueiam sobreposição de horário da mesma pessoa (RN-004).
- [x] Decidido em 2026-10-30: na visita criada para outro vendedor basta o cliente estar na carteira (ou equipe) de quem cria (RN-013).
- [x] Decidido em 2026-10-30: concluir deslocamento exige relato e só é possível a partir da data agendada (RN-011).
- [x] Decidido em 2026-10-30: o check-in em visita de data futura continua permitido (RN-006).
- [x] Decidido em 2026-10-30: o evento no Google mostra o status no título e o relato na descrição após o check-out; check-in e check-out atualizam o evento e o cancelado é removido (RN-016).

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-004, C-008, C-011, C-014, C-016)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Deslocamento não tem fluxo de conclusão e nunca soma no realizado | `Concluir deslocamento` pelo criador, com relato obrigatório e a partir da data agendada; conta para criador e participantes (RN-011) | `docs/regras-de-negocio.md` "Meta semanal de visitas"; manual seção 3 |
| O primeiro cliente da carteira vem selecionado | Nenhum cliente pré-selecionado (RF-004) | `AgendaPage.tsx:900`; manual seção 4 "Criar um compromisso" |
| A Agenda sempre abre em Semana, ignorando a preferência | Abre no `Modo padrão da Agenda` (RF-001) | `AgendaPage.tsx:477`; manual seção 2 |
| `Hoje` volta para a data-base exibida | Vai para a data atual (RF-001) | `AgendaPage.tsx:1858`; manual seção 4 "Visões" |
| Conflito só com o mesmo horário de início; o de prospecção é conferido na tela | Sobreposição de intervalo entre todos os tipos de compromisso da pessoa (inclusive reunião interna e deslocamento, como criador ou participante), conferida no servidor (RN-004) | `AgendaPage.tsx:1013-1047`; manual seção 4 "Regras e mensagens" |
| Conflito no reagendamento confere o usuário logado, não o dono | Confere o dono do item (RN-004) | `AgendaPage.tsx:1665-1669` |
| Retroativo de 5 dias só na tela, e bloqueia editar planejamento de visita antiga sem mudar data | Conferido no servidor e só quando a data muda (RN-003) | `AgendaPage.tsx:1000,1646`; manual seção 4 nota de retroativo |
| Check-in e check-out com relógio do aparelho e só a hora, sem data | Data e hora de Brasília pelo servidor (RN-006/007) | `AgendaPage.tsx:281,1144`; manual seção 4 "Limites técnicos" |
| Check-out substitui o relato e apaga os motivos de reagendamento | Relato acrescentado (RN-007) | `backend/add-ferias-visibilidade-global.mjs` checkout |
| Cancelar substitui o relato e o servidor aceita cancelar visita concluída | Só Agendada; motivo acrescentado (RN-010) | `backend/add-ferias-visibilidade-global.mjs` cancelar |
| Relato acima de 20.000 caracteres é cortado sem aviso | Recusado com mensagem (RN-008) | `AgendaPage.tsx:293-295`; manual seção 4 "Limites" |
| Cabeçalho de reagendamento em AAAA-MM-DD | dd/mm/aaaa (RNT-011, RN-009) | `AgendaPage.tsx:308`; manual seção 4 |
| Visita para vários vendedores grava uma a uma; falha no meio deixa parte criada | Tudo ou nada (RN-013) | `AgendaPage.tsx:1087-1129` |
| Só o primeiro item encontrado após criar vai ao Google; os demais vendedores não recebem | Cada item criado vai ao Google do seu vendedor (RN-016) | `AgendaPage.tsx:803-865,1131` |
| Vendedor selecionado precisa ter o cliente na própria carteira | Carteira de quem cria (RN-013) | `migrations/update-sf-agendacriarvisita-1792674256-2.sql` |
| "Substituto em Férias" de Configurações dá acesso permanente à agenda do titular | Só férias ativas (RNT-010, RN-012) | `migrations/update-sf-visitasdodia-1792676676.sql` (ramo do substituto) |
| Participantes de interno não podem ser alterados depois de criado | Criador adiciona e retira (RF-010, RN-014) | `backend/add-editar-agenda-interna.mjs` |
| Check-out não atualiza o Google e o título do evento não mostra o status | Check-in, check-out e conclusão atualizam o evento; o título começa por `[Agendada]`, `[Em andamento]` ou `[Concluída]` (RN-016) | manual seção 2 "O que vai para o Google" |
| Relato com formatação vai cru para a descrição do evento | Texto simples (RN-016) | `backend/sf-src/google-agenda-sincronizar.js:124-131` |
| Autorização contínua do Google passa pelo navegador; código de acesso vai no endereço da chamada; segredo guardado sem proteção | Tudo só no servidor, protegido (RNF-003, RNFT-006) | `docs/arquitetura.md` "Sem integração por usuário"; `docs/pendencias.md` item 7 |
| Troca de agenda remove no máximo 200 eventos | Remove todos (RN-017) | `docs/modulos/agenda.md` "Seleção da agenda de destino" |
| Reenvio desiste após 5 tentativas em silêncio | Item aparece como não enviado com `Tentar novamente` (RN-018) | `backend/fix-google-agenda-fila-e-put.mjs:96` |
| `Último erro` em texto técnico e gravado em quem salvou, mesmo se a falha foi na conta de um participante | Mensagem em português, no dono da conta (RN-018, RNFT-007) | `frontend/src/lib/googleAgenda.ts` (marcar sincronização) |
| Falhas de envio não aparecem na Agenda | Aviso discreto após a ação (RF-019) | manual seção 2 "Falhas de sincronização" |
| `Última sincronização` sem formatação e `Calendário` mostra o identificador | dd/mm/aaaa hh:mm e nome da agenda (RF-021) | `ConfiguracoesUsuarioPage.tsx:620-624` |
| `Desconectar` não pede confirmação | Pede confirmação (RF-020) | manual seção 2 "Desconectar" |
| Painel "Resumo do Periodo" mostra números da semana | Chama-se `Resumo da semana` (RF-014) | `AgendaPage.tsx` painel lateral |

---

## Anexo — Rastreabilidade de origem

Rotas atuais cobertas: `/agenda` e a seção Google Agenda de `/configuracoes`. `/agenda-coordenador` foi cancelada em 2026-11-03: o que ela mostrava fica na `/agenda` pelo escopo.
Páginas: `frontend/src/pages/AgendaPage.tsx`, `AgendaCoordenadorPage.tsx`, `ConfiguracoesUsuarioPage.tsx` (Google), `frontend/src/lib/googleAgenda.ts`.
Tabelas: `VISITAS`, `AGENDA_INTERNA`, `AGENDA_INTERNA_PARTICIPANTES`, `PROSPECT_VISITAS`, `CLIENTES`, `EQUIPE_CLIENTE`, `FERIAS_VENDEDOR`, `FUNCIONARIOS`, `GOOGLE_OAUTH_APP`, `GOOGLE_OAUTH_PENDENTE`, `GOOGLE_AGENDA_CONFIG`, `GOOGLE_AGENDA_EVENTOS`, `GOOGLE_AGENDA_LOGS`, `GOOGLE_AGENDA_TICKET`, `GOOGLE_AGENDA_FILA`.

| RF / RN | SFs atuais (alias · id) |
|---|---|
| RF-001/002, RF-014 | `listarVisitasPeriodo` · 5; `prospectsVisitasListar` · 254 (spec 008); `agendaListarVendedoresConvite` · 233 (nomes); `dadosUsuarioLogado` · 28 |
| RF-003, RN-001/002, RN-013 | `agendaCriarVisita` · 44; `prospectsAgendarVisita` · 266 (spec 008); `agendaCriarCompromissoInterno` · 231; `agendaAdicionarParticipanteInterno` · 232; `agendaListarVisitasPaginado` · 42 (usada só para achar o id recém-criado) |
| RF-004/005 | `minhaCarteiraClientes` · 27 (spec 002); `prospectsListar` · 252 (spec 008) |
| RF-006, RN-003/004 | `agendaVerificarConflitoVisita` · 139 (passa a conferir também `AGENDA_INTERNA` e `AGENDA_INTERNA_PARTICIPANTES`, e a ser chamada na criação, edição e inclusão de participante de interno) |
| RF-007, RN-006/007 | `checkinVisita` · 13 (passa a disparar o envio ao Google); `checkoutVisita` · 14; `prospectsCheckinVisita` · 262; `prospectsCheckoutVisita` · 263; `criarTarefa` · 23 (spec 004); `listarTarefas` · 11 |
| RF-008, RN-005/009/010 | `agendaAtualizarVisita` · 45; `agendaCancelarVisitaSeguro` · 46; `prospectsAtualizarVisita` · 260; `prospectsCancelarVisita` · 261; `agendaAtualizarCompromissoInterno` · 285; `agendaCancelarCompromissoInterno` · 286 |
| RF-009, RN-011 | nenhuma (não existe hoje) |
| RF-012, RN-012 | predicado de dono/férias embutido nas SFs 5, 13, 14, 20, 44, 45, 46 |
| RF-013 | `painelCoordenadorPermissao` · 153 (gate da tela cancelada; **aposentar** junto com `/agenda-coordenador`) |
| RF-015 | `historicoVisitasCliente` · 22; `historicoPedidosCliente` · 25 (spec 002) |
| RF-016, RN-015 | `googleOAuthAppConfig` · 364; `googleAgendaTrocarCodigo` · 365; `googleAgendaConfirmarConexao` · 366 |
| RF-017, RN-017 | `googleAgendaAbrirTicket` · 369; `googleAgendaConsumirTicket` · 373; `googleAgendaListarCalendarios` · 370; `googleAgendaTrocarCalendario` · 371; `googleAgendaZerarVinculos` · 376; `googleAgendaGravarAgendaEscolhida` · 377; `googleAgendaLogTroca` · 378 |
| RF-018, RN-016 | `googleAgendaSincronizarItem` · 212 (título com o status; `backend/sf-src/google-agenda-sincronizar.js`); `googleAgendaGravarVinculo` · 379; `googleAgendaLogSync` · 380; `googleAgendaMarcarSync` · 381 |
| RF-019, RN-018 | `googleAgendaEnfileirarSync` · 374; `googleAgendaProcessarFila` · 375 (cron 5 min); `googleAgendaManutencao` · 372 (cron; limpa autorizações vencidas) |
| RF-020/021, RN-019 | `googleAgendaStatus` · 209; `googleAgendaDesconectar` · 211 |

SFs do módulo sem uso em nenhuma tela (aposentar): `agendaContarVisitasPaginado` · 43; `agendaExcluirVisita` · 47; `cancelarVisita` · 21; `googleAgendaSalvarConfig` · 210 (entrada manual de credencial, legado); `googleOAuthDescartarPendente` · 367; `googleAgendaAtualizarCalendario` · 368 (substituída pela 371); `visitasPorStatus` · 3; `proximasVisitas` · 4.

Fontes: `docs/modulos/agenda.md`; `docs/arquitetura.md` (escrita por SF SQL, integrações compartilhadas, PATCH→PUT, fila); `docs/regras-de-negocio.md#meta-semanal-de-visitas`; `docs/base-conhecimento-sales360.md` seções 2, 4 e 15; `backend/add-agenda-interna.mjs`, `add-editar-agenda-interna.mjs`, `add-cancelar-agenda-interna.mjs`, `add-ferias-visibilidade-global.mjs`, `fix-google-agenda-fila-e-put.mjs`, `backend/sf-src/google-agenda-sincronizar.js`.
