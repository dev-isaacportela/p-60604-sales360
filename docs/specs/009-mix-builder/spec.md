# Spec: Mix Builder — propostas com custo real

**ID:** 009-mix-builder · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o Mix Builder como está em produção, já com
> os defeitos conhecidos corrigidos. Regras transversais são citadas pelo id da
> spec 000 (`RNT-00N`, `RNFT-00N`). Proibido citar stack, tabela ou componente
> fora do anexo **Rastreabilidade de origem**.

## Problema

A executiva comercial precisa montar, na frente do cliente ou antes da visita,
uma proposta de mix de produtos com o custo real da Benenutri (padrão ou
negociado por política) e a margem que quer praticar, e entregar um PDF limpo
ao cliente. Hoje a proposta funciona, mas tem furos: custo de política vencida
continua aparecendo, trocar o cliente mantém o custo do cliente anterior, a
lista de mixes não diz se o mix já foi para o histórico, a cópia de um mix é gravada antes de a pessoa
decidir salvar, e datas saem no formato técnico. Cada furo vira preço errado na
mão do cliente ou chamado para a TI.

## Resultado esperado

A executiva escolhe um cliente da carteira, monta o mix com o custo que vale
para aquele cliente hoje, vê margem, CMV e mark up na hora, salva, imprime a
proposta sem custo nem margem e registra o envio no histórico do cliente.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor (executiva) | Montar, salvar, duplicar, imprimir e enviar ao histórico mixes dos clientes da carteira | diária |
| Substituto de férias | Montar as próprias propostas para os clientes herdados da titular durante as férias ativas | eventual |
| Coordenador / diretoria | Montar mixes dos próprios clientes (a tela não tem visão de equipe) | eventual |
| TI | Acompanhar a atualização de custos e de fotos (a chave do sistema de fotos é mantida pela equipe técnica fora das telas do sistema) | sob demanda |
| Rotinas automáticas | Atualizar custos (30 min), catálogo (semanal) e fotos (diária) | contínua |

## Cenários

**C-001 — Montar e salvar um mix com custo padrão**
- **Dado que** o cliente Mercado Bom (código 1520) está na carteira de Ana e o produto 714 tem custo padrão R$ 70,00
- **Quando** Ana escolhe o cliente, dá o nome "Campanha Verão", inclui o produto 714, muda `Qtd` para 10 e clica `Salvar Mix`
- **Então** o item entra com margem 30,0%, preço R$ 100,00 e subtotal R$ 1.000,00; aparece "Mix salvo com sucesso.", o Construtor é limpo e o mix aparece no topo de `Meus Mix`

**C-002 — Ajustar pela margem ou pelo preço**
- **Dado que** o item 714 tem custo R$ 70,00 e margem 30,0%
- **Quando** Ana muda a margem para 20 e depois digita o preço R$ 65,00
- **Então** com margem 20 o preço vira R$ 87,50; com preço R$ 65,00 a margem vira −7,7%, a faixa fica `Baixa` e a linha é destacada

**C-003 — Custo especial só para o cliente elegível**
- **Dado que** a política "Rede Sul", ativa e vigente de 01/10/2026 a 31/12/2026, dá custo R$ 60,00 ao produto 714 e só tem o cliente 1520 vinculado
- **Quando** Ana, com `Custo especial` marcado, inclui o 714 para o cliente 1520 e depois, em outro mix, para o cliente 1777
- **Então** para 1520 o item entra com R$ 60,00 (Especial · Rede Sul); para 1777 entra com R$ 70,00 (Padrão) e o menu de custo do item não lista a "Rede Sul"

**C-004 — Política vencida não oferece custo (borda)**
- **Dado que** a política "Promo Set" do cliente 1520 terminou em 30/09/2026 e hoje é 30/10/2026
- **Quando** Ana abre o menu de custo do item 714 para o cliente 1520
- **Então** a "Promo Set" não aparece; só o custo padrão R$ 70,00 e as políticas vigentes

**C-005 — Produto sem custo**
- **Dado que** o produto 9001 não tem custo padrão nem especial
- **Quando** Ana o inclui no mix
- **Então** ele entra com custo R$ 0,00, aparece o aviso "Nenhum custo disponível para este produto. Produto adicionado com custo zero." e a etiqueta "Custo zero: verificar fonte" fica na linha

**C-006 — Trocar o cliente reavalia os custos**
- **Dado que** o mix tem o 714 com custo especial R$ 60,00 do cliente 1520 e o 715 com custo padrão R$ 40,00
- **Quando** Ana troca o cliente para 1777, que não é elegível à "Rede Sul"
- **Então** o 714 volta para R$ 70,00 (padrão) mantendo a margem, o 715 não muda, e aparece "1 item teve o custo trocado para o padrão porque o novo cliente não tem direito ao custo especial."

**C-007 — Totais do mix**
- **Dado que** o mix tem o item A (custo R$ 70,00, preço R$ 100,00, 10 un.) e o item B (custo R$ 50,00, margem 20%, 4 un.)
- **Quando** a tela calcula os totais
- **Então** B custa R$ 62,50; `Custo Total` R$ 900,00; `Venda Total` R$ 1.250,00; `Margem Bruta Média` 28,0% (faixa `Atenção`); CMV 72,0%; `Mark up Médio` 38,9%

**C-008 — Salvar bloqueado com motivo**
- **Dado que** Ana escolheu o cliente e incluiu 2 produtos, mas não deu nome ao mix
- **Quando** ela passa o mouse no botão salvar
- **Então** o botão está desabilitado e mostra "Informe o nome do mix para salvar"

**C-009 — Meus Mix mostra só os mixes da pessoa**
- **Dado que** Ana criou 23 mixes e Bruno criou 5
- **Quando** Ana abre `Meus Mix`
- **Então** vê "Exibindo 1-20 de 23", nenhum mix de Bruno, e a página 2 mostra os 3 restantes

**C-010 — Substituto usa os clientes da titular, não os mixes dela**
- **Dado que** Ana está de férias de 01/11 a 15/11 com Bruno como substituto e tem 23 mixes
- **Quando** Bruno abre o Mix Builder em 05/11 e em 16/11
- **Então** em 05/11 o seletor de cliente traz os clientes de Ana e Bruno pode montar e salvar um mix seu para eles, mas `Meus Mix` mostra só os mixes de Bruno, nenhum dos 23 de Ana; em 16/11 os clientes de Ana somem do seletor

**C-011 — Duplicar não grava antes de salvar**
- **Dado que** Ana tem o mix "Campanha Verão" com 2 itens
- **Quando** ela escolhe `Duplicar Mix` e fecha a edição sem salvar
- **Então** o Construtor abriu "Campanha Verão - Cópia" com os mesmos itens, e `Meus Mix` continua com o mesmo total; se ela clicar `Salvar Mix`, o total sobe 1

**C-012 — Enviar ao histórico**
- **Dado que** o mix "Campanha Verão" nunca foi enviado
- **Quando** Ana escolhe `Enviar ao Histórico` em 30/10/2026
- **Então** aparece "Mix enviado para o histórico do cliente.", a linha passa a mostrar "Enviado em 30/10/2026" e o mix aparece no Histórico do cliente 1520 com o tipo "Mix"

**C-013 — Proposta em PDF sem custo nem margem**
- **Dado que** o mix de C-007 está salvo, criado em 30/10/2026
- **Quando** Ana escolhe `Imprimir/PDF`
- **Então** abre a proposta com o logo da Benenutri, cliente, data 30/10/2026, `Valor Final` R$ 1.250,00, `Unidades` 14, `Preço Médio` R$ 89,29 e, por item, só código, foto, produto, quantidade, preço e subtotal

**C-014 — Bloqueador de pop-up (erro)**
- **Dado que** o navegador de Ana bloqueia pop-ups
- **Quando** ela escolhe `Imprimir/PDF`
- **Então** aparece "Libere os pop-ups deste site para gerar o PDF do mix." e nada é gravado

**C-015 — Exportar planilha**
- **Dado que** o mix de C-007 está aberto no Construtor
- **Quando** Ana escolhe `Exportar` → `Exportar planilha (CSV)`
- **Então** baixa "campanha-verao.csv" separado por ";", com custo, CMV, mark up e margem por item, decimais com vírgula (ex.: "1250,00") e uma linha TOTAL

**C-016 — Aviso de custos desatualizados**
- **Dado que** a última atualização de custos foi às 11:00 e agora são 14:10
- **Quando** Ana abre o Construtor
- **Então** vê "Custos sincronizados há 3h. Os valores podem estar desatualizados."; às 12:30 só veria "Custos atualizados às 11:00"

**C-017 — Cliente que saiu da carteira (borda)**
- **Dado que** o cliente 1600 saiu da carteira de Ana depois de ela salvar o mix "Inverno"
- **Quando** Ana escolhe `Editar Mix` no "Inverno"
- **Então** vê "Este cliente não está mais na sua carteira. O mix pode ser visualizado, duplicado e impresso, mas não alterado." e o salvar fica bloqueado

**C-018 — Gravação com cliente fora da carteira é recusada (erro)**
- **Dado que** o cliente 1777 não está na carteira de Ana nem de alguém que ela substitui
- **Quando** chega ao sistema um pedido para salvar um mix de Ana para o cliente 1777
- **Então** nada é gravado e a resposta é "Este cliente não está na sua carteira."

**C-019 — Produto sem foto**
- **Dado que** o produto 714 tem foto e o 9001 não
- **Quando** Ana busca os dois no catálogo e imprime um mix com ambos
- **Então** o 714 mostra a foto (ampliada ao passar o mouse ou tocar) e o 9001 mostra o quadro "Sem foto"; no PDF o 9001 fica com o espaço da foto em branco

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE oferecer as abas `Construtor` e `Meus Mix` | Construtor mostra o nº de itens em montagem; com mix salvo aberto aparece "Editando Mix #ID" com X que cancela e limpa | must |
| RF-002 | O sistema DEVE listar no seletor de cliente só a carteira do usuário e a dos titulares que ele substitui com férias ativas (RNT-010), com busca no servidor (RNT-014) | C-010; seletor mostra "código - nome fantasia"; carteira de 800 clientes encontra qualquer um pela busca | must |
| RF-003 | O sistema DEVE liberar o catálogo só depois de escolhido o cliente, buscar produtos ativos por nome, código, código de fábrica ou código auxiliar e mostrar até 8 resultados com foto | Busca "whey" com 30 produtos mostra 8; sem cliente o campo diz "Selecione um cliente para liberar o catálogo de custos" | must |
| RF-004 | O sistema DEVE incluir o produto com o custo escolhido pelo alternador `Custo padrão` / `Custo especial` (RN-008) e margem inicial de 30% | C-001, C-003 | must |
| RF-005 | O sistema DEVE permitir editar por item `Qtd`, `Margem %`, preço de venda e custo (menu com as opções válidas) | C-002; menu sem opções mostra "Sem custos disponíveis" | must |
| RF-006 | O sistema DEVE recalcular custos ao trocar o cliente com itens no mix (RN-010) | C-006 | must |
| RF-007 | O sistema DEVE mostrar por item custo, preço, CMV, mark up, margem com faixa e subtotal, e no rodapé itens, unidades, custo total, venda total, mark up médio e margem média | C-007 | must |
| RF-008 | O sistema DEVE mostrar, sob o botão `Comparativo`, preço do concorrente e CMV do concorrente por item, sem afetar os totais | Preço concorrente R$ 80,00 com custo R$ 70,00 → CMV Conc. 87,5% em vermelho; totais iguais com ou sem concorrente | should |
| RF-009 | O sistema DEVE oferecer filtro "Filtrar itens..." e ordenação (Ordem de inclusão, Menor margem, Maior margem, Maior subtotal) quando o mix tiver mais de 5 itens | 6 itens → controles aparecem; 5 → não | could |
| RF-010 | O sistema DEVE salvar e atualizar o mix com validação no servidor (RN-011, RN-012, RN-013) e explicar por que o salvar está bloqueado | C-008, C-018; sucesso "Mix salvo com sucesso." / "Mix atualizado com sucesso." e Construtor limpo | must |
| RF-011 | O sistema DEVE listar `Meus Mix` com 20 por página e total, colunas Mix, Cliente, Data, Venda, Margem e situação de envio, e ações Visualizar, Editar Mix, Duplicar Mix, Enviar ao Histórico, Imprimir/PDF e Excluir | C-009, C-010, C-012; vazio: "Nenhum mix salvo ainda." | must |
| RF-012 | O sistema DEVE duplicar abrindo a cópia "{nome} - Cópia" no Construtor, sem gravar até `Salvar Mix` | C-011 | must |
| RF-013 | O sistema DEVE excluir só após a confirmação "Excluir "{nome}" e todos os seus itens? Esta ação não pode ser desfeita." | Cancelar mantém o mix; confirmar mostra "Mix "{nome}" excluído." | must |
| RF-014 | O sistema DEVE registrar o mix no histórico do cliente e mostrar na lista quando foi enviado (RN-016) | C-012 | must |
| RF-015 | O sistema DEVE gerar a proposta para impressão (salvar como PDF) a partir do mix salvo ou do Construtor (RN-015) | C-013, C-014 | must |
| RF-016 | O sistema DEVE exportar a planilha do mix aberto no Construtor (RN-015) | C-015; sucesso "Planilha do mix exportada." | should |
| RF-017 | O sistema DEVE mostrar quando os custos foram atualizados e avisar quando passar de 2 horas (RN-014, RNT-015) | C-016 | must |
| RF-018 | O sistema DEVE mostrar a foto principal do produto no catálogo, nos itens, na visualização e no PDF (RN-017) | C-019 | should |
| RF-019 | (removido em 2026-10-30: a tela de gravação, teste e status da chave de fotos ficava no Painel do desenvolvedor, que não existe no sistema novo; a chave é mantida pela equipe técnica fora das telas, RN-017) | — | — |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Fotos e opções de custo nunca atrasam a lista nem o Construtor: o texto aparece primeiro, a foto depois; falha de foto = "Sem foto" | Com o sistema de fotos fora do ar, o catálogo abre no mesmo tempo e mostra "Sem foto" |
| RNF-002 | O PDF espera as fotos por no máximo 8 s antes de abrir a impressão | Foto que não responde → impressão abre em ≤ 8 s com espaço em branco |
| RNF-003 | A busca do catálogo espera a pessoa parar de digitar (cerca de 250 ms) antes de consultar | Digitar "whey" rápido gera 1 consulta (RNFT-002) |
| RNF-004 | A tabela de itens cabe em 1.366 px sem o comparativo; no celular cada item vira cartão | Verificação manual |

Transversais aplicáveis: RNFT-001 (lista paginada), RNFT-002, RNFT-003, RNFT-004, RNFT-005, RNFT-006 (chave de fotos nunca chega ao navegador), RNFT-007.

## Entidades do domínio

- **Mix** — proposta de produtos para um cliente: nome, descrição, cliente, criador, data de criação, totais (custo, venda, margem média) e data de envio ao histórico. Pertence a quem criou.
- **Item do mix** — produto, quantidade, tipo de custo (padrão, especial ou sem custo), custo unitário, margem, preço de venda, preço do concorrente e CMV do concorrente. Um produto aparece uma vez por mix.
- **Produto do catálogo** — produto ativo vindo da gestão de custos: código, nome, fornecedor, departamento, seção, foto principal.
- **Custo padrão** — custo único do produto, com data de referência.
- **Política de custo especial** — custo negociado de um produto, com nome, situação, vigência e clientes elegíveis (ou nenhum, quando geral).
- **Atualização de custos** — registro de quando a cópia dos custos foi atualizada pela última vez.

## Regras de negócio

- **RN-001 — Preço pela margem.** Preço = custo ÷ (1 − margem/100), com a margem limitada entre 0 e 95 no campo de margem. Valores com 2 casas.
- **RN-002 — Margem inicial.** Todo produto incluído entra com margem de 30%.
- **RN-003 — Margem pelo preço.** Preço digitado (≥ 0) recalcula a margem = (preço − custo) ÷ preço × 100. Preço 0 → margem 0. A margem pode ficar negativa quando o preço fica abaixo do custo; a linha fica na faixa `Baixa`.
- **RN-004 — Troca de custo.** Trocar o custo de um item mantém a margem e recalcula o preço.
- **RN-005 — Cálculos.** Subtotal = qtd × preço. Custo total e venda total = somas por item. Margem média = (venda total − custo total) ÷ venda total × 100 (0 se venda total = 0). CMV = custo ÷ preço × 100. Mark up = (preço − custo) ÷ custo × 100 (0 se custo = 0). CMV do concorrente = custo ÷ preço do concorrente × 100 (vazio se preço do concorrente = 0). Preço médio da proposta = venda total ÷ unidades.
- **RN-006 — Faixas.** Margem: ≥ 30% `Saudável`, 20% a 29,9% `Atenção`, < 20% `Baixa` (linha destacada). CMV do concorrente: até 70% verde, até 85% âmbar, acima vermelho.
- **RN-007 — Custo padrão.** Só é oferecido quando maior que zero.
- **RN-008 — Custo especial.** Uma política é oferecida para o cliente quando está ativa, a data de hoje está dentro da vigência e: (a) é do próprio cliente, ou (b) o cliente está vinculado a ela, ou (c) é geral (sem cliente e sem nenhum vínculo). O cliente é reconhecido pelo código do ERP ou pelo código interno. Na inclusão com `Custo especial` marcado, usa o menor custo especial vigente; sem nenhum, usa o padrão. Com `Custo padrão` marcado, usa o padrão; sem padrão, o primeiro especial disponível.
- **RN-009 — Sem custo.** Produto sem nenhuma opção entra com custo 0, tipo "sem custo", aviso e etiqueta "Custo zero: verificar fonte" (C-005).
- **RN-010 — Troca de cliente.** Ao trocar o cliente, cada item com custo especial é reavaliado para o novo cliente; se a política não vale para ele, o item passa ao custo padrão mantendo a margem, e a tela diz quantos itens mudaram.
- **RN-011 — Dono e acesso.** O mix pertence a quem o criou (RNT-012). O criador vê, edita, duplica, envia, imprime e exclui. Ninguém mais vê o mix, nem o substituto de férias (RNT-010): ele monta as próprias propostas para os clientes herdados.
- **RN-012 — Cliente na carteira.** Salvar exige cliente na carteira do usuário ou de titular que ele substitui com férias ativas, conferido no servidor no momento de salvar (C-017, C-018).
- **RN-013 — Itens válidos.** Nome obrigatório, pelo menos 1 item, quantidade inteira ≥ 1, produto sem repetição ("Este produto já está no mix."), preço ≥ 0. Os totais gravados são recalculados pelo sistema a partir dos itens (RN-005), nunca aceitos prontos da tela. Cabeçalho e itens são gravados juntos ou nada é gravado.
- **RN-014 — Atualização de custos e catálogo.** Custos são atualizados a cada 30 minutos (minutos 00 e 30); o catálogo de produtos, toda segunda-feira às 8h. Só produtos ativos entram no catálogo. Passadas mais de 2 horas da última atualização, a tela mostra "Custos sincronizados há {N}h" (ou "{N} dia(s)" a partir de 24 h) "Os valores podem estar desatualizados.".
- **RN-015 — O que sai para o cliente.** O PDF mostra logo, nome do mix, cliente, descrição, data (dd/mm/aaaa), nº de produtos, unidades, `Valor Final`, `Preço Médio` e, por item, código, foto, produto, categoria, quantidade, preço e subtotal — **nunca** custo, margem, CMV, mark up ou concorrente. A planilha (uso interno) leva por item #, código, produto, categoria, custo unitário, quantidade, preço, CMV %, mark up %, margem %, preço do concorrente e subtotal, mais a linha TOTAL; separador ";", decimais com vírgula, acentos legíveis no Excel, nome do arquivo = nome do mix em minúsculas com hífens.
- **RN-016 — Histórico.** `Enviar ao Histórico` grava a data e hora do envio; reenviar atualiza a data. Só mixes enviados aparecem no Histórico do cliente (spec 002).
- **RN-017 — Fotos.** A foto é a principal do produto no sistema de fotos da empresa, atualizada uma vez por dia às 9h; só endereços seguros são exibidos. Sem foto: quadro "Sem foto" na tela e espaço em branco no PDF. A chave de acesso ao sistema de fotos é mantida pela equipe técnica fora das telas do sistema; nenhuma tela grava, testa ou mostra a chave, nem força a atualização das fotos (RNFT-006).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Custo 70, margem 30 → preço 100; qtd 10 → subtotal 1.000; salvar grava 1 mix com 1 item e totais 700/1.000/30 | regra de negócio |
| C-002 / RN-003 | Custo 70: margem 20 → 87,50; preço 65 → margem −7,69 → "−7,7%", faixa Baixa | regra de tela |
| C-003 / RN-008 | Política vinculada a 1520: opções para 1520 = {padrão 70, especial 60}; para 1777 = {padrão 70} | regra de negócio |
| C-004 / RN-008 | Política com fim 30/09/2026 consultada em 30/10/2026 → não volta | regra de negócio |
| RN-008 (geral) | Política sem cliente e sem vínculo volta para qualquer cliente; política sem cliente mas com 1 vínculo volta só para o vinculado | regra de negócio |
| RN-008 (escolha) | Especiais 60 e 55 vigentes com `Custo especial` → entra 55; com `Custo padrão` → entra 70 | regra de tela |
| C-005 / RN-009 | Produto sem opções → custo 0, tipo sem custo, aviso exibido | regra de tela |
| C-006 / RN-010 | Mix com especial 60 (1520) trocado para 1777 → 70, margem igual, contador "1 item" | regra de tela |
| C-007 / RN-005 | A(70;100;10) + B(50;20%;4) → venda 1.250, custo 900, margem 28,0%, CMV 72,0%, mark up 38,9% | regra de tela |
| RN-006 | Margem 30 → Saudável; 29,99 → Atenção; 19,99 → Baixa; CMV conc. 70 → verde, 85 → âmbar, 85,1 → vermelho | regra de tela |
| RN-001 | Margem 95 com custo 10 → 200; margem digitada 99 → limitada a 95 | regra de tela |
| RN-002 / RN-004 | Produto novo entra com 30; trocar custo 70 → 60 com margem 30 → preço 85,71 | regra de tela |
| RN-007 | Produto com custo padrão 0 não lista a opção padrão | regra de negócio |
| C-008 | Sem cliente → "Selecione o cliente para salvar"; sem nome → "Informe o nome do mix para salvar"; sem itens → "Adicione ao menos um produto para salvar" | regra de tela |
| C-009 / RN-011 | Ana (23) e Bruno (5): listagem como Ana devolve 20 + total 23 e zero de Bruno | regra de negócio |
| C-010 / RN-011 | Férias 01/11–15/11: em 05/11 o seletor de Bruno traz os clientes de Ana e a listagem de Bruno tem 0 mixes de Ana; ver, editar ou excluir mix de Ana como Bruno = 0 linhas e erro; em 16/11 os clientes de Ana saem do seletor | regra de negócio |
| C-011 | Duplicar e cancelar → total de mixes inalterado; salvar → +1 com nome "... - Cópia" e dono = quem salvou | regra de negócio |
| C-012 / RN-016 | Enviar em 30/10/2026 14:00 → data gravada; reenviar 31/10 → data 31/10; mix não enviado não aparece no histórico | regra de negócio |
| C-013 / RN-015 | PDF do mix de C-007 contém "R$ 1.250,00", "14", "R$ 89,29", "30/10/2026" e não contém "Custo", "Margem", "CMV" | regra de tela |
| C-014 | Abertura de janela bloqueada → mensagem de pop-up e nenhuma chamada de gravação | regra de tela |
| C-015 / RN-015 | CSV de C-007: 1 cabeçalho + 2 itens + TOTAL; separador ";"; "1250,00" na venda total; nome "campanha-verao.csv" | regra de tela |
| C-016 / RN-014 | 190 min → "há 3h"; 1.500 min → "há 1 dia(s)"; 90 min → sem aviso | regra de tela |
| C-017 | Edição de mix cujo cliente saiu da carteira → salvar bloqueado com a mensagem; visualizar e imprimir funcionam | regra de tela |
| C-018 / RN-012 | Gravar mix para cliente fora da carteira → 0 gravados e "Este cliente não está na sua carteira." | regra de negócio |
| RN-013 | Item repetido, quantidade 0 ou 1,5, preço −1 → recusados; totais enviados 999 com itens que somam 1.250 → grava 1.250; falha no 2º item → nada gravado | regra de negócio |
| RN-014 | Catálogo não devolve produto inativo; busca "acai" encontra "AÇAÍ" (RNT-014) | regra de negócio |
| C-019 / RN-017 | Endereço sem "https://" → tratado como sem foto; produto sem foto → "Sem foto" | regra de tela |

Verificação manual:
- [ ] RNF-004 — tabela de itens em 1.366 px e cartões em 360 px; tema escuro sem cor quebrada (RNFT-004)
- [ ] RNF-002 — PDF com logo nítido em A4, cabeçalho repetido em várias páginas
- [ ] RN-017 — nenhuma tela do sistema mostra, grava ou testa a chave do sistema de fotos

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Custo especial de política fora da vigência continua oferecido (só a situação "ativa" é conferida) | Política só vale dentro da vigência (RN-008) | `backend/fix-mix-custos-e-carteira.mjs` (custos disponíveis sem filtro de data) |
| Com vários custos especiais, entra o primeiro em ordem alfabética do nome da política | Entra o menor custo especial vigente (RN-008) | `SimulacaoPage.tsx:431-436`; ordenação em `fix-mix-custos-e-carteira.mjs` |
| Trocar o cliente mantém o custo especial do cliente anterior | Custos reavaliados na troca (RN-010) | manual, seção 7, "Troquei o cliente e os custos ficaram errados" |
| O seletor de cliente traz a carteira do substituto cadastrado em Configurações, sem data, além das férias | Só férias ativas do cadastro único (RNT-010) | `migrations/update-sf-mixcarteiraclientes-1792674224.sql` |
| Substituto vê a carteira da titular por um vínculo sem datas | Só os clientes da titular, com férias ativas; os mixes dela continuam só dela (RN-011) | RNT-010 (spec 000); `backend/fix-mix-builder-vendedor-logado.mjs` |
| Seletor de cliente limitado a 500 clientes, carregados de uma vez | Busca no servidor, sem teto (RF-002) | `SimulacaoPage.tsx:279`; manual, seção 7 |
| Salvar não confere se o cliente está na carteira; consulta de custos especiais aceita qualquer cliente | Servidor confere a carteira ao salvar e ao consultar custos (RN-012) | `backend/add-mix-escrita-sfs.mjs`; `fix-mix-custos-e-carteira.mjs` |
| Totais do mix calculados na tela e gravados como chegam | Recalculados pelo servidor (RN-013) | `SimulacaoPage.tsx:910-918` |
| Duplicar grava a cópia na hora e descobre o id pelo "último mix criado" | Cópia só é gravada ao salvar (RF-012) | `SimulacaoPage.tsx:814-856` |
| A lista não indica se o mix já foi enviado ao histórico | Mostra "Enviado em dd/mm/aaaa" (RF-014) | manual, seção 7, "Meus Mix — ações" |
| Lista mostra "Exibindo 1-20" sem total | Mostra o total (RNFT-001) | `SimulacaoPage.tsx:1292-1305` |
| Data da lista e do PDF no formato técnico (2026-10-30); margem com 2 casas | dd/mm/aaaa e percentual com 1 casa (RNT-011) | `SimulacaoPage.tsx:944`, lista `Meus Mix` |
| Manual diz que o preço não é digitável; a tela aceita preço digitado | Preço digitável, margem recalculada (RN-003); manual alinhado | manual, seção 7, "Fórmulas"; `SimulacaoPage.tsx:527` |
| Hora da última atualização dos custos só aparece quando passa de 2 h | Sempre visível; aviso acima de 2 h (RNT-015) | `SimulacaoPage.tsx:1577-1584` |
| Consulta de custo em tempo real e catálogo lido direto da gestão de custos existem e nenhuma tela usa | Não fazem parte do sistema novo; custos vêm da cópia atualizada a cada 30 min | `frontend/src/hooks/useMitra.ts` (mapa de funções sem chamada) |
| Simulações da fase 1 (modelo antigo de mix e custos) seguem no mapa de funções | Fora do sistema novo; dados antigos ficam intocados | `docs/pendencias.md`, item 10 |
| Busca de produto e de cliente diferencia acentos | Sem diferença de acentos (RNT-014) | `docs/banco-de-dados.md`, Observações de modelagem |
| A chave do sistema de fotos é gravada, testada e consultada num card do Painel do desenvolvedor, que também força a atualização das fotos | Sem tela: a chave fica com a equipe técnica, fora das telas; as fotos se atualizam só pela rotina diária (RN-017). O Painel do desenvolvedor não existe no sistema novo | `SistemaFotosCard.tsx`; SFs 398–401; spec 012 cancelada em 2026-10-30 |

## Fora de escopo

- [ ] Simulações da fase 1 e o modelo antigo de custos: não são lidos nem migrados; os registros ficam como estão.
- [ ] Consulta de custo em tempo real na gestão de custos: aposentada (decidido em 2026-10-30).
- [ ] Visão de equipe no Mix Builder: coordenador não vê nem monta mix da carteira do time; não há filtro de escopo (RNT-003) nesta tela.
- [ ] Envio da proposta por e-mail ou WhatsApp a partir do sistema; o PDF é salvo pela impressão do navegador.
- [ ] Preço de tabela, desconto comercial e aprovação de margem mínima: a margem é livre de 0 a 95% (preço digitado pode dar margem negativa).
- [ ] Transformar o mix em pedido no ERP.
- [ ] Cadastro ou edição de custos e políticas: continuam na gestão de custos.
- [ ] Exibição do mix no Histórico do cliente (spec 002); aqui só o registro do envio.
- [ ] Tela para gravar, testar ou ver o status da chave do sistema de fotos, ou para forçar a atualização das fotos: a chave é mantida pela equipe técnica fora das telas (o Painel do desenvolvedor foi cancelado em 2026-10-30).

## Pendências

- [x] Decidido em 2026-10-30: a consulta de custo em tempo real é aposentada; os custos vêm só da cópia atualizada a cada 30 minutos.
- [x] Decidido em 2026-10-30: com mais de um custo especial vigente para o mesmo produto e cliente, entra o menor custo, sem prioridade de política (RN-008).
- [x] Decidido em 2026-10-30: a chave do sistema de fotos é mantida pela equipe técnica fora das telas do sistema; sai a tela de gravação, teste e status da chave (RF-019 removido).
- [x] Decidido em 2026-10-30: o substituto **não** acessa os mixes do titular (nem ver, nem duplicar); usa só os clientes herdados para montar as próprias propostas.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-004, C-014, C-017, C-018)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

**Rota coberta:** `/simulacao` (menu "Mix Builder"). **Página:** `frontend/src/pages/SimulacaoPage.tsx`; componentes `FotoProduto.tsx`, `SistemaFotosCard.tsx` (Painel Dev, aposentar com a tela); `frontend/src/lib/fotosProduto.ts`.

| RF / RN | Funções do servidor atuais (alias · id) | Tabelas |
|---|---|---|
| RF-002, RN-012 | `mixCarteiraClientes` · 362 | `EQUIPE_CLIENTE`, `CLIENTES`, `BU_VENDEDOR`, `FUNCIONARIOS.ID_SUBSTITUTO`, `FERIAS_VENDEDOR`, `VENDEDOR_RCA` |
| RF-003, RN-014 | `mixCatalogoProdutosCustos` · 91 (também usada pela spec 011, cancelada em 2026-10-30) | `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO` |
| RF-004/005, RN-007/008 | `mixCustosDisponiveis` · 228 | `CUSTO_ESPECIAL_PRODUTO`, `CUSTO_ESPECIAL_CLIENTES` |
| RF-010, RN-011/013 | `mixCriar` · 358, `mixAtualizar` · 359, `mixUltimoCriado` · 361 | `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS` |
| RF-011, RN-011 | `mixListar` · 92, `mixItens` · 93 | `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS`, `PRODUTOS_CUSTOS`, `PRODUTOS` |
| RF-012 | `mixCriar` · 358, `mixUltimoCriado` · 361 | idem |
| RF-013 | `mixExcluir` · 360 | idem |
| RF-014, RN-016 | `mixEnviarHistorico` · 267 | `PRODUCT_MIX.ENVIADO_HISTORICO`, `DT_ENVIO_HISTORICO` |
| RF-017, RN-014 | `mixStatusCustos` · 363 (leitura); `mixAtualizarCustosSeNecessario` · 251 (rotina, `0 0,30 * * * *`); `mixSincronizarProdutosCustosSemanal` · 268 (rotina, `0 0 8 * * MON`, fora do mapa da tela); `ce360AplicarCustoPadrao` · 238 e `ce360AplicarCustosEspeciais` · 239 (recebem custos da gestão de custos) | `MIX_CUSTOS_SYNC`, `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO`, `CUSTO_ESPECIAL_*`; integração `gestao-de-custos` |
| RF-018, RN-017 | `mixFotos` · 397 (leitura); `mixFotosSincronizar` · 398 (rotina `0 0 9 * * *`; o disparo manual pelo Painel Dev sai) | `MIX_PRODUTO_FOTO` |
| RF-019 (removido) | `mixFotosTestar` · 399, `mixFotosConfigStatus` · 400, `mixFotosChaveGravar` · 401 — aposentar; a chave passa a ser configuração do servidor mantida pela equipe técnica, lida só pela rotina de fotos | `MIX_FOTOS_CONFIG` |
| RF-015, RF-016, RN-001..006, RN-009/010 | sem função do servidor (cálculo e geração na tela; logo embutido na página) | — |

Funções do módulo **sem uso** em tela (aposentar): `mixCustoTempoReal` · 226, `mixCatalogoProdutosCustosRemoto` · 227, `listarProdutos` · 8, legado da fase 1 `listarSimulacoes` · 9, `itensSimulacao` · 10, `simulacoesContar` · 55, `simulacoesAtualizarRascunho` · 56, `simulacoesCancelar` · 57, `simulacoesExcluirRascunho` · 58, `simulacoesExcluirRascunhoCabecalho` · 59, `simulacaoItensAdicionar` · 60, `simulacaoItensAtualizar` · 61, `simulacaoItensExcluir` · 62. `mixFotosTestar` · 399, `mixFotosConfigStatus` · 400 e `mixFotosChaveGravar` · 401 (tela da chave de fotos removida). `mixUltimoCriado` · 361 deixa de ser necessária (a criação devolve o id). Tabelas legadas não lidas: `SIMULACOES`, `SIMULACAO_ITENS`, `PRODUTOS`, `CUSTOPRODUTO`, `COST_POLICIES`, `POLICY_ITEMS`.

Fontes: `docs/modulos/mix-builder.md`; manual `docs/base-conhecimento-sales360.md` seções 7, 14 e 15 (Mix Builder); `backend/add-mix-*.mjs`, `fix-mix-*.mjs`, `update-mix-historico-sfs.mjs`, `migrations/*mix*`.
