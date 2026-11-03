# Spec: Suporte, ajuda e notas de versão

> **Spec cancelada em 2026-10-30.** Ajuda (manual do vendedor), Suporte (chamados), Painel do desenvolvedor e Notas de versão (cadastro e popup de novidades) não existirão no sistema novo. O conteúdo abaixo fica só como registro do sistema atual, para aposentar as telas e as funções do servidor; nada desta spec será construído.

**ID:** 012-suporte-release-notes · **Status:** cancelada em 2026-10-30 · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o ciclo de suporte que está em produção, já
> com os defeitos conhecidos corrigidos. Regras transversais são citadas pelo id
> (`RNT-00N`, `RNFT-00N`) da spec 000. Proibido citar stack, tabela ou
> componente fora do anexo **Rastreabilidade de origem**.

## Problema

O usuário que encontra um problema abre um chamado e recebe um protocolo que some ao recarregar a
página, sem ter onde acompanhar o andamento. A equipe técnica vê os chamados numa lista dos 100 mais
recentes, sem filtro e sem como mudar o status. O acesso a essa lista e ao cadastro de notas de versão
é liberado por dois e-mails fixos (um deles pessoal), e o e-mail do chamado vai para esses mesmos
endereços. Os dados de quem abriu o chamado vêm do navegador e podem ser forjados, e a "tela atual"
registrada é sempre a própria tela de suporte. As notas de versão funcionam, mas a limpeza do texto só
acontece na tela.

## Resultado esperado

Quem tem um problema abre o chamado em um minuto e acompanha a resposta; a equipe técnica tria a fila
e avisa a todos o que mudou no sistema, uma única vez para cada pessoa.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Todo usuário | Consultar o manual, abrir chamado com print, acompanhar os próprios chamados, ler as novidades | sob demanda |
| Equipe técnica (TI) | Triar e atualizar chamados, publicar notas de versão, manter as ferramentas técnicas do painel | diária |

## Cenários

**C-001 — Abrir chamado com print**
- **Dado que** Ana está na tela Clientes e clica `Suporte` no rodapé do menu às 22:30 de 30/10/2026 (Brasília)
- **Quando** o formulário abre com `Tela afetada` já preenchida com "Clientes", ela informa título "Tela de clientes não carrega", descrição, anexa um PNG de 800 KB e clica `Enviar bug`
- **Então** o chamado é gravado com protocolo `BUG-20261030-` + 6 letras/números, a tela mostra `Protocolo BUG-20261030-XXXXXX criado. E-mail enviado ao TI.`, o selo verde com o protocolo e limpa o formulário; o e-mail chega à lista de destinatários da TI

**C-002 — Campos obrigatórios (erro)**
- **Dado que** Ana preencheu só a descrição
- **Quando** clica `Enviar bug`
- **Então** vê `Informe o título e a descrição do problema.` e nada é gravado

**C-003 — E-mail falha, chamado fica (borda)**
- **Dado que** o envio de e-mail está fora do ar
- **Quando** Ana envia um chamado válido
- **Então** o chamado é gravado, a tela mostra `Protocolo BUG-... criado. O e-mail falhou, mas o chamado já aparece no painel.` e o Painel Dev mostra `E-mail: ERRO` com o motivo em `Erro no e-mail`

**C-004 — Print não sobe (erro)**
- **Dado que** o envio do arquivo falha
- **Quando** Ana clica `Enviar bug` com print anexado
- **Então** vê `Não foi possível anexar o print. Tente novamente.` e nenhum chamado é gravado

**C-005 — Identidade vem da sessão**
- **Dado que** Ana está logada e o envio chega dizendo que o solicitante é Bruno
- **Quando** o chamado é gravado
- **Então** o solicitante registrado é Ana, com nome, e-mail e situação (ativo/férias) dela

**C-006 — Meus chamados**
- **Dado que** Ana abriu 3 chamados e Bruno 2
- **Quando** Ana abre `Meus chamados` na tela de Suporte
- **Então** vê os 3 dela, com protocolo, título, data e status atual, e nenhum de Bruno

**C-007 — Painel Dev restrito ao papel ADMIN (TI) (erro)**
- **Dado que** Paula tem papel ADMIN (TI) e Ana é vendedora
- **Quando** as duas abrem o endereço do Painel Dev e o das Notas de versão
- **Então** Paula vê as telas e os itens `Painel Dev` e `Notas de Versão` no menu; Ana vê `Acesso restrito` com "Este painel é exclusivo para a equipe técnica autorizada." (notas: "O cadastro de notas de versão é exclusivo da equipe técnica.") e nenhum dado é carregado

**C-008 — Triagem com status**
- **Dado que** há 130 chamados, 4 de prioridade Crítica e 20 Abertos
- **Quando** Paula abre o Painel Dev, filtra `Crítica` e muda um deles de Aberto para Em andamento e depois para Resolvido
- **Então** a primeira página mostra 50 chamados (mais recentes primeiro) e o total 130; o filtro mostra 4; os contadores passam de 20 para 19 Abertos; Ana vê o novo status em `Meus chamados`

**C-009 — Publicar nota de versão**
- **Dado que** Paula escreve a nota "Relato avulso no histórico do cliente", tipo `Novidade`, versão "v0.8.0"
- **Quando** clica `Publicar` e, em seguida, Ana entra no sistema e fecha o popup com `Entendi`
- **Então** Paula vê `Nota publicada: aparece no próximo acesso de cada usuário.`; Ana vê `O que há de novo` com "Uma atualização chegou ao sistema."; a nota não volta para Ana e o cadastro mostra `1 pessoa viu`

**C-010 — Rascunho e pré-visualização**
- **Dado que** Paula salvou uma nota com `Salvar rascunho`
- **Quando** clica `Pré-visualizar` e fecha com `Fechar pré-visualização`
- **Então** vê exatamente o popup que os usuários veriam; o rascunho não aparece para ninguém e nenhuma leitura é registrada

**C-011 — Limite do popup (borda)**
- **Dado que** Ana não entra há 70 dias e existem 12 notas publicadas nos últimos 60 dias e 1 publicada há 61 dias
- **Quando** entra e fecha o popup; e entra de novo
- **Então** no primeiro acesso vê as 10 mais recentes ("10 atualizações chegaram ao sistema."); no segundo vê as 2 restantes; a de 61 dias nunca aparece

**C-012 — Despublicar e publicar de novo**
- **Dado que** uma nota publicada já foi vista por Ana e não por Bruno
- **Quando** Paula despublica e publica de novo
- **Então** a nota aparece para Bruno no próximo acesso e não volta para Ana

**C-013 — Conteúdo limpo**
- **Dado que** Paula cola na nota um texto do Word com cores, um script, um link "javascript:", um link https e uma imagem http
- **Quando** salva
- **Então** a nota guarda títulos, listas e negrito; o script e as cores somem; o link "javascript:" vira texto; o link https abre em nova aba; a imagem http é descartada — e a mesma limpeza acontece mesmo se o conteúdo chegar sem passar pela tela

**C-014 — Excluir nota**
- **Dado que** a nota "Correção no Mix" está publicada
- **Quando** Paula clica `Excluir` e confirma
- **Então** vê a confirmação "A nota "Correção no Mix" será apagada e deixa de aparecer para quem ainda não a viu.", depois `Nota excluída.`, e a nota some do cadastro e de todo popup futuro

**C-015 — Manual do vendedor**
- **Dado que** Ana clica `Ajuda` no menu ou o ícone "?" do topo
- **Quando** a tela abre
- **Então** vê `Manual do vendedor` com "Como conduzir o dia" (6 passos), "Antes de finalizar o dia" e o "Manual por tela" das 7 telas, sem nenhuma consulta de dados

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE oferecer o formulário `Reportar bug` a todo usuário, pelo rodapé do menu, com os campos da RN-001 | C-001, C-002 | must |
| RF-002 | O sistema DEVE gerar protocolo único (RN-002) e mostrá-lo no selo verde e na mensagem de sucesso | C-001 | must |
| RF-003 | O sistema DEVE registrar o contexto da RN-003 e mostrar ao usuário o que foi capturado (`Contexto capturado`: Usuário, E-mail, Tela de origem, Navegador, Tela) | C-001, C-005 | must |
| RF-004 | O sistema DEVE aceitar 1 print (RN-004) | C-001, C-004 | must |
| RF-005 | O sistema DEVE enviar o chamado por e-mail à lista de destinatários da TI e registrar o resultado (RN-005) | C-001, C-003 | must |
| RF-006 | O sistema DEVE mostrar ao usuário `Meus chamados` | C-006 | should |
| RF-007 | O sistema DEVE oferecer o Painel Dev só ao papel ADMIN (TI) (RNT-002) | C-007 | must |
| RF-008 | O sistema DEVE listar os chamados no Painel Dev com paginação, total, filtros por status, prioridade e categoria, e contadores `Total`, `Abertos`, `Críticos`, `Usuários` (RN-008) | C-008 | must |
| RF-009 | O sistema DEVE permitir à TI mudar o status do chamado (RN-006) | C-008 | must |
| RF-010 | O sistema DEVE permitir à TI reenviar o e-mail de um chamado com `E-mail: ERRO` | Reenvio bem-sucedido muda para `E-mail: ENVIADO` e limpa o erro | could |
| RF-011 | O sistema DEVE oferecer o cadastro de notas de versão ao papel ADMIN (TI): criar, editar, salvar rascunho, publicar, despublicar, excluir e pré-visualizar (RN-009, RN-010, RN-014) | C-009, C-010, C-012, C-014 | must |
| RF-012 | O sistema DEVE mostrar o popup `O que há de novo` ao entrar (RN-011, RN-012) | C-009, C-011 | must |
| RF-013 | O sistema DEVE limpar o conteúdo da nota no momento de gravar (RN-013) | C-013 | must |
| RF-014 | O sistema DEVE mostrar quantas pessoas viram cada nota publicada | `0 pessoas viram`, `1 pessoa viu`, `N pessoas viram` | must |
| RF-015 | O sistema DEVE oferecer o `Manual do vendedor` estático (RN-015) | C-015 | must |
| RF-016 | O sistema DEVE manter no Painel Dev o card `Sistema de fotos` do Mix Builder | Comportamento definido na spec 009 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Enviar um chamado com print de 5 MB conclui em até 10 s em 4G | Cronômetro |
| RNF-002 | O popup de novidades não atrasa a primeira tela: ela aparece antes dele | Verificação manual com 10 notas pendentes |
| RNF-003 | O chamado nunca guarda senha, código de acesso ou credencial (RNFT-006); a tela avisa "Não coletamos senha, token ou credenciais. Apenas contexto técnico da sessão e do navegador." | Revisão do contexto gravado em 5 chamados |

## Entidades do domínio

- **Chamado** — protocolo, solicitante (da sessão), título, tela afetada, categoria, prioridade, descrição, passos, resultado esperado, resultado obtido, impacto, print, contexto técnico, status, situação do e-mail, data de criação e de atualização.
- **Nota de versão** — versão, tipo, título, conteúdo formatado, publicada ou rascunho, data de publicação, autor, datas de criação e alteração.
- **Leitura de nota** — registro de que um usuário viu uma nota, com data; no máximo um por usuário e nota.
- **Manual do vendedor** — conteúdo fixo de orientação de uso.

## Regras de negócio

- **RN-001 — Campos do chamado.** `Título do bug` (obrigatório, até 200), `Tela afetada` (até 200), `Categoria` (`Bug funcional` padrão, `Dados incorretos`, `Lentidão ou travamento`, `Acesso ou permissão`, `Problema visual`, `Outro`), `Prioridade` (`Baixa`, `Média` padrão, `Alta`, `Crítica`), `Descrição do problema` (obrigatória), `Passos para reproduzir`, `Resultado esperado`, `Resultado obtido`, `Impacto no trabalho` — textos longos até 8.000 caracteres cada; acima disso o envio é recusado com o nome do campo e o limite (nada é cortado). A tela orienta: "Use prioridade crítica apenas quando o problema impedir operação, atendimento, vendas ou acesso ao sistema."
- **RN-002 — Protocolo.** `BUG-AAAAMMDD-XXXXXX`, com a data de Brasília (RNT-011) e 6 letras maiúsculas ou números; único. Falha geral: `Não foi possível enviar o chamado.`
- **RN-003 — Contexto.** O solicitante (id, nome, e-mail, situação ativo/férias e substituto) vem da sessão (RNT-012), nunca do que a tela envia. A tela de origem é a última tela visitada antes de abrir o Suporte e pré-preenche `Tela afetada` (editável). Registra ainda endereço da tela de origem, navegador, idioma, fuso, tamanho da tela e da janela, e hora do servidor.
- **RN-004 — Print.** No máximo 1 imagem PNG, JPEG, WEBP ou GIF, até 10 MB, por `Selecionar print`; pode ser removido antes do envio. Se o arquivo não subir, o chamado não é gravado (C-004).
- **RN-005 — E-mail à TI.** Assunto `Bug reportado <protocolo>: <título>`, com solicitante, todos os campos, link do print e o contexto. Destinatários: lista mantida pela TI, nunca fixa no sistema. Situação do e-mail: `PENDENTE` ao gravar, `ENVIADO` ou `ERRO` (com motivo) após a tentativa. Falha de e-mail não desfaz o chamado.
- **RN-006 — Status do chamado.** `Aberto` ao criar; a TI muda para `Em andamento`, `Resolvido` ou `Descartado` e pode reabrir (`Aberto`). Cada mudança grava a data de atualização. Só o papel ADMIN (TI) muda status.
- **RN-007 — Acesso técnico.** Painel Dev e Notas de versão: só papel ADMIN (TI), conferido no servidor a cada carga (RNT-002). As ações de gravar recusam quem não é TI e respondem quantos registros mudaram (RNT-013).
- **RN-008 — Fila no Painel Dev.** Mais recentes primeiro, 50 por página com total (RNFT-001). Cada chamado mostra protocolo, prioridade, status, `E-mail: <situação>`, título, categoria · tela afetada, data e hora (Brasília), solicitante (nome, e-mail, id, situação), descrição, passos, `Esperado`, `Obtido`, impacto, `Anexo` e `Contexto técnico` (endereço · navegador). Contadores sobre o filtro aplicado: Total, Abertos, Críticos, Usuários (e-mails distintos). Vazio: `Nenhum bug reportado até agora.`
- **RN-009 — Nota de versão.** `Versão` opcional (até 30, ex.: v0.8.0); `Tipo` `Novidade` (padrão), `Melhoria` ou `Correção`; `Título` obrigatório (até 200); `O que mudou` obrigatório, com Título para seções, Subtítulo para itens, listas, negrito, itálico, sublinhado, tachado, citação, links e imagens; colar do Word ou Google Docs mantém essa formatação. Sem título ou conteúdo: `Preencha o título e o conteúdo da nota.`
- **RN-010 — Publicação.** `Publicar` grava publicada com data de publicação = agora (Brasília); editar e publicar de novo uma nota já publicada mantém a data original. `Salvar rascunho` grava não publicada e apaga a data de publicação (numa nota publicada, equivale a despublicar). Mensagens: `Nota publicada: aparece no próximo acesso de cada usuário.`, `Rascunho salvo.`, `Não foi possível salvar a nota. Tente novamente.`. Cadastro: rascunhos primeiro, depois publicadas da mais recente para a mais antiga; cabeçalho "N publicadas · M rascunhos"; rodapé `Publicada em dd/mm/aaaa hh:mm` ou `Criada em ...`, `por <autor>`.
- **RN-011 — Popup.** Ao entrar no sistema, uma vez por sessão: notas publicadas nos últimos 60 dias que o usuário ainda não viu, até 10, a mais recente primeiro. Título `O que há de novo`, subtítulo "Uma atualização chegou ao sistema." ou "N atualizações chegaram ao sistema.", cada nota com tipo, versão, data de publicação, título e conteúdo. Sem notas pendentes, nada aparece.
- **RN-012 — Leitura.** Fechar o popup (`Entendi`, X, Esc ou clique fora) registra a leitura de todas as notas exibidas; a nota não volta para aquele usuário, mesmo despublicada e publicada de novo. Pré-visualização nunca registra leitura.
- **RN-013 — Conteúdo limpo.** Ao gravar, o conteúdo mantém só títulos (dois níveis), parágrafos, quebras, negrito, itálico, sublinhado, tachado, listas, citações, links http/https (abrem em nova aba) e imagens https; remove scripts, estilos e qualquer outro elemento, mantendo o texto. Negrito e itálico vindos por estilo viram negrito e itálico. Notas antigas em texto simples continuam válidas: linha com `## ` vira título, `### ` subtítulo, `- ` item de lista.
- **RN-014 — Exclusão.** Só TI, com confirmação; apaga a nota e ela deixa de aparecer para quem ainda não viu. Mensagens `Nota excluída.` / `Não foi possível excluir a nota.`
- **RN-015 — Manual do vendedor.** Conteúdo fixo, sem consulta de dados: "Como conduzir o dia" (1 Dashboard no início do dia; 2 revisar a carteira em Clientes; 3 Alertas e Prospecção; 4 registrar visitas na Agenda com objetivo e resultado; 5 controlar pendências em Atividades; 6 Analytics no fim do dia/semana), "Antes de finalizar o dia" (regras de ouro) e "Manual por tela" de Dashboard, Agenda, Clientes, Atividades, Mix Builder, Analytics e Alertas e Prospecção, cada uma com objetivo, quando usar, passo a passo, boas práticas e resultado esperado. Toda regra citada no manual é a das specs do sistema reconstruído.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Envio às 22:30 de 30/10/2026 em Brasília gera protocolo que começa com `BUG-20261030-` e tela afetada "Clientes" | regra de negócio |
| C-002 | Envio sem título devolve a mensagem e 0 chamados gravados | regra de tela |
| C-003 | E-mail com falha forçada: 1 chamado gravado com situação `ERRO` e motivo; mensagem com "O e-mail falhou" | regra de negócio |
| C-004 | Falha forçada no envio do arquivo: 0 chamados gravados | regra de tela |
| C-005 | Envio como Ana com solicitante "Bruno" no conteúdo grava solicitante = Ana | regra de negócio |
| C-006 | Ana (3) e Bruno (2): `Meus chamados` de Ana devolve 3 | regra de negócio |
| C-007 | Usuário sem papel ADMIN (TI): Painel Dev e cadastro de notas devolvem "sem permissão" e 0 linhas; salvar nota grava 0 | regra de negócio |
| C-008 | 130 chamados: página 1 com 50 e total 130; filtro Crítica = 4; mudar 1 Aberto para Em andamento deixa Abertos = 19 | regra de negócio |
| C-009 | Publicar e fechar o popup como Ana: leitura de Ana registrada; contagem de leituras = 1; pendentes de Ana = 0 | regra de negócio |
| C-010 | Rascunho: pendentes de qualquer usuário não incluem a nota; pré-visualizar não grava leitura | regra de negócio |
| C-011 | 12 notas em 60 dias + 1 com 61 dias: 1ª consulta devolve 10; após registrar leitura das 10, devolve 2; a de 61 dias nunca | regra de negócio |
| C-012 | Despublicar/publicar: pendentes de Ana = 0 e de Bruno = 1 | regra de negócio |
| C-013 | Conteúdo do cenário gravado sem script, sem estilo, link "javascript:" como texto, link https com nova aba, sem imagem http — também quando enviado direto ao servidor | regra de negócio |
| C-014 | Excluir nota publicada: some do cadastro e das pendências de quem não viu | regra de negócio |
| C-015 | Abrir Ajuda não dispara nenhuma consulta; 6 passos e 7 telas presentes | regra de tela |
| RN-001 | Descrição com 8.001 caracteres recusada citando "Descrição do problema"; categoria e prioridade padrão = Bug funcional e Média | regra de negócio |
| RN-002 | 1.000 protocolos gerados no mesmo dia são todos diferentes e seguem `BUG-AAAAMMDD-[A-Z0-9]{6}` | regra de negócio |
| RN-003 | Usuário vindo de Agenda: `Tela afetada` pré-preenchida "Agenda"; contexto sem senha nem código de acesso | regra de tela |
| RN-004 | PDF recusado; segunda imagem substitui a primeira; imagem de 11 MB recusada | regra de tela |
| RN-005 | Destinatários lidos da lista da TI; situação `PENDENTE` → `ENVIADO` após envio bem-sucedido | regra de negócio |
| RN-006 | Vendedor mudando status grava 0; TI reabrindo Resolvido grava `Aberto` e nova data de atualização | regra de negócio |
| RN-007 | Excluir nota como vendedor responde 0 alterados e a tela mostra erro, não sucesso | regra de negócio |
| RN-008 | Chamado criado 01:00 UTC de 31/10 aparece como 30/10/2026 22:00; impacto exibido | regra de tela |
| RN-009 | Tipo inválido "BUG" gravado como `Novidade`; título vazio recusado | regra de negócio |
| RN-010 | Nota publicada em 01/11 e republicada após edição em 05/11 mantém 01/11; rascunho de publicada zera a data | regra de negócio |
| RN-011 | Sem pendências o popup não abre; ordem das notas = data de publicação decrescente | regra de tela |
| RN-012 | Fechar com Esc registra a leitura das notas exibidas | regra de tela |
| RN-013 | Texto antigo "## Novidades\n- item" vira título "Novidades" + lista com "item"; negrito por estilo vira negrito | regra de tela |
| RN-014 | Excluir sem confirmar não apaga nada | regra de tela |
| RN-015 | Manual menciona a regra de meta semanal igual à da spec 005 (deslocamento concluído conta) | regra de tela |

Verificação manual:
- [ ] RF-001 / C-001 — formulário usável em 360 px, `Selecionar print` abre a câmera/galeria no celular
- [ ] RF-012 — popup em tema claro e escuro, legível com 10 notas
- [ ] RF-015 — conteúdo do manual revisado contra as specs 003, 004, 005 e 008

## Fora de escopo

- [ ] Conversa entre usuário e TI dentro do chamado (comentários, respostas).
- [ ] Prazo de atendimento, responsável pelo chamado e relatórios de suporte.
- [ ] Notas de versão segmentadas por papel ou por pessoa.
- [ ] Manual com conteúdo de Solicitações, Suporte e das telas de coordenação e diretoria; editar o manual sem publicar nova versão do sistema.
- [ ] Assistente de chamados com IA (a base de conhecimento existe fora do sistema).
- [ ] Regras do `Sistema de fotos` (spec 009).

## Pendências

- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-002, C-003, C-004, C-007)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Painel Dev e Notas de versão liberados por dois e-mails fixos, um pessoal | Papel ADMIN (TI) (RNT-002, RN-007) | `backend/add-suporte-bugs.mjs:210-218`; `backend/add-release-notes.mjs:29` |
| E-mail do chamado vai para endereços fixos no código, incluindo um pessoal | Lista mantida pela TI (RN-005; pendência) | `backend/add-suporte-bugs.mjs:52` |
| Solicitante do chamado vem do que a tela envia | Vem da sessão (RNT-012, RN-003) | `backend/add-suporte-bugs.mjs:68-77`; `SuportePage.tsx:145-151` |
| Data do protocolo em UTC (à noite sai com o dia seguinte) | Data de Brasília (RN-002) | `backend/add-suporte-bugs.mjs:109-110`; manual seção 11 "Regras" |
| "Rota atual" registrada é sempre a própria tela de suporte | Tela de origem, pré-preenchendo `Tela afetada` (RN-003) | `SuportePage.tsx:83-105,265` |
| Textos acima do limite são cortados sem aviso | Recusados com mensagem (RN-001) | `backend/add-suporte-bugs.mjs:54-56,115` |
| Protocolo some ao recarregar e não há onde acompanhar | `Meus chamados` (RF-006) | manual seção 11 "Regras" |
| Painel lista só os 100 mais recentes, sem filtro | Paginação, total e filtros (RN-008) | `backend/add-suporte-bugs.mjs:205-207` |
| Status aparece no painel mas ninguém consegue mudá-lo | TI muda o status (RN-006) | `PainelDesenvolvedorPage.tsx:130` |
| `Impacto no trabalho` é gravado e não aparece no painel | Exibido (RN-008) | `PainelDesenvolvedorPage.tsx:151-171` |
| E-mail que falhou não pode ser reenviado | `Reenviar e-mail` (RF-010) | `PainelDesenvolvedorPage.tsx:164-169` |
| Conteúdo da nota limpo só na tela; o servidor grava o que receber | Limpeza ao gravar (RN-013) | `frontend/src/lib/notaVersaoHtml.ts`; `backend/add-release-notes.mjs:87-111` |
| Salvar ou excluir nota sem permissão responde sucesso com 0 gravados | Resposta com quantidade e erro claro (RNT-013, RN-007) | `backend/add-release-notes.mjs:87-120`; `tasks.md` da raiz "Pendente" |
| Print sem limite de tamanho | Até 10 MB (RN-004; pendência) | `SuportePage.tsx:211-217` |

---

## Anexo — Rastreabilidade de origem

Rotas atuais cobertas: `/ajuda`, `/suporte`, `/painel-desenvolvedor`, `/release-notes` e o popup montado no layout.
Páginas e componentes: `frontend/src/pages/AjudaPage.tsx`, `SuportePage.tsx`, `PainelDesenvolvedorPage.tsx`, `ReleaseNotesPage.tsx`, `frontend/src/components/ReleaseNotesPopup.tsx`, `frontend/src/lib/notaVersaoHtml.ts`, `frontend/src/components/SistemaFotosCard.tsx` (spec 009), `frontend/src/components/Layout.tsx:145-146,226,258,268`.
Tabelas: `SUPORTE_BUGS`, `RELEASE_NOTES`, `RELEASE_NOTES_LEITURA`, `INT_USER`, `FUNCIONARIOS`. Anexos pelo envio público de arquivos da plataforma.

| RF / RN | SFs atuais (alias · id) |
|---|---|
| RF-001 a RF-005, RN-001 a RN-005 | `suporteEnviarBug` · 234 (JavaScript: grava e envia e-mail); `dadosUsuarioLogado` · 28 (identidade lida pela tela) |
| RF-006 | nenhuma (não existe hoje) |
| RF-007, RN-007 | `suportePainelPermissao` · 236 (também libera o cadastro de notas e o menu) |
| RF-008, RN-008 | `suporteListarBugs` · 235 |
| RF-009/010, RN-006 | nenhuma (não existe hoje) |
| RF-011, RN-009/010/014, RF-014 | `releaseNotesGestaoListar` · 403; `releaseNotesSalvar` · 404; `releaseNotesExcluir` · 405 |
| RF-012, RN-011/012 | `releaseNotesPendentes` · 406; `releaseNotesMarcarLidas` · 407 |
| RF-013, RN-013 | limpeza só na tela (`notaVersaoHtml.ts`) |
| RF-015, RN-015 | nenhuma (conteúdo fixo) |
| RF-016 | `mixFotosConfigStatus` · 400; `mixFotosChaveGravar` · 401; `mixFotosTestar` · 399; `mixFotosSincronizar` · 398 (spec 009) |

Com a spec cancelada em 2026-10-30, **todas** as SFs listadas acima ficam para aposentar quando o sistema antigo sair do ar.

Fontes: `docs/modulos/suporte.md`; `docs/base-conhecimento-sales360.md` seções 1, 11 e 15; `backend/add-suporte-bugs.mjs`; `backend/add-release-notes.mjs`; migrações `create-sf-releasenotes*-1793018564.sql`; `CHANGELOG.md`.
