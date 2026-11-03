# Spec: Comercial Externo 360 — visão geral e regras transversais

**ID:** 000-visao-geral · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o sistema que está em produção, já com os
> defeitos conhecidos corrigidos. É o contrato comum a todas as specs de módulo
> (001–012), que citam as regras daqui pelo id (`RNT-00N`, `RNFT-00N`) em vez
> de repeti-las. Proibido citar stack, tabela ou componente fora do anexo
> **Rastreabilidade de origem**.

## Problema

A força de vendas externa da Benenutri (cerca de 26 vendedores, coordenadores
por unidade de negócio e diretoria) usa o Comercial Externo 360 todos os dias
para planejar visitas, cuidar da carteira e acompanhar vendas e metas. O sistema
cresceu por correções sucessivas: a mesma regra (o que conta como venda do
vendedor, qual é a meta, o que é faturamento) está escrita de jeitos diferentes
em telas diferentes, e os números divergem entre painéis. Há acessos liberados
por e-mail fixo, preferências que são gravadas mas não aplicadas e regras de
férias que não funcionam em todas as telas. Cada correção nova custa mais e
quebra outra tela. Os dados de produção são o ativo: reconstruir sem mexer
neles é o caminho.

## Resultado esperado

Toda pessoa da força de vendas vê, em qualquer tela, os mesmos números para a
mesma pergunta, recortados pelo que ela tem direito de ver. Os dados que já
existem continuam valendo sem migração.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor (executiva comercial) | Planejar e registrar visitas, cuidar da própria carteira, montar propostas, acompanhar as próprias vendas e meta | diária, em campo, muitas vezes no celular |
| Coordenador | Acompanhar a equipe da(s) sua(s) unidade(s) de negócio, redistribuir meta, mover carteira, cadastrar férias, ver a agenda da equipe pelo filtro de escopo | diária |
| Diretoria | Visão de todas as unidades e coordenadores, meta por unidade, papéis de usuários, cadastro de coordenadores | semanal |
| Gestão (gestor/admin) | Manter os cadastros que definem quem vê o quê (vínculo com o código de vendedor do ERP, unidades, escopos), forçar sincronização | sob demanda |
| Equipe técnica (TI) | Auditar dados de vendas, conferir faturamento × devolução (papel ADMIN) | sob demanda |

Usuário sem papel definido é tratado como **Vendedor** (RNT-001).

## Glossário

- **RCA** — código do vendedor no ERP. Cada usuário tem no máximo um RCA e cada RCA pertence a no máximo um usuário.
- **Supervisor** — RCA do coordenador do vendedor no ERP.
- **Filial** — filial da empresa no ERP; cada filial pertence a uma UF.
- **Departamento** — departamento do ERP (código numérico). **BU** (unidade de negócio) = filial + departamento.
- **Seção** — subdivisão de um departamento.
- **Escopo do vendedor** — combinação ativa departamento + filial + seção (seção vazia = todas) em que o vendedor atua. Pode ter vários.
- **Carteira** — clientes atribuídos a um vendedor.
- **Faturamento bruto** — soma das vendas faturadas. **Faturamento líquido** — bruto − devoluções.
- **Semana operacional** — sexta a quinta, recortada no mês (RNT-005).
- **BW** — variação percentual de um período contra o mesmo período do mês anterior.
- **Prospect** — empresa que ainda não é cliente no ERP.

## Mapa de módulos (ordem de reconstrução)

| Spec | Módulo | Quem usa |
|---|---|---|
| 001 | Acesso, perfis, menu, configurações do usuário, tema | todos |
| 002 | Carteira de clientes (minha carteira, disponíveis, histórico, temperatura, curva, titulares) | vendedor, coordenador |
| 003 | Agenda e visitas (check-in/out, compromissos internos, Google Agenda, agenda da equipe) | vendedor, coordenador |
| 004 | Atividades (tarefas e follow-ups) | vendedor |
| 005 | Dashboard (tela inicial) | todos |
| 006 | Acompanhamento semanal e conferência de vendas | vendedor, coordenador, gestão, TI |
| 007 | Analytics, comparativo e redistribuição de metas | vendedor, coordenador, diretoria |
| 008 | Alertas inteligentes, direcionamento semanal e prospecção | vendedor, coordenador |
| 009 | Mix Builder (propostas com custo real) | vendedor |
| 010 | Gestão, coordenação e diretoria (Painel de Gestão, governança de cadastros, papéis, coordenadores, carteira, férias, acesso) | coordenador, diretoria, gestão |
| 011 | ~~Solicitações de compras~~ — **cancelada em 2026-10-30** | — |
| 012 | ~~Suporte, ajuda e notas de versão~~ — **cancelada em 2026-10-30** | — |

## Cenários transversais

**C-001 — Vendedor só vê os próprios dados**
- **Dado que** a vendedora Ana tem 40 clientes na carteira e o vendedor Bruno tem 35
- **Quando** Ana abre qualquer tela de carteira, agenda, atividades ou vendas
- **Então** vê apenas os 40 clientes dela e os dados ligados a eles, e não há filtro de escopo na tela

**C-002 — Coordenador vê a equipe das suas BUs**
- **Dado que** o coordenador Carlos tem as BUs Filial 1 · Nutrição e Filial 2 · Nutrição, Ana tem escopo na Filial 1 · Nutrição e Bruno só na Filial 3 · Medicamento
- **Quando** Carlos abre o filtro de escopo em "Time inteiro"
- **Então** Ana aparece e Bruno não

**C-003 — Venda só conta para quem tem cliente e escopo**
- **Dado que** o cliente X está na carteira de Ana, Ana tem escopo Filial 1 · Nutrição e X comprou R$ 1.000 pela Filial 1 · Nutrição e R$ 500 pela Filial 2 · Nutrição
- **Quando** se calcula o faturamento de Ana no mês
- **Então** o bruto de Ana é R$ 1.000; os R$ 500 não são dela

**C-004 — Mesmo número em todas as telas**
- **Dado que** Ana faturou R$ 10.000 brutos no mês e teve R$ 800 de devolução
- **Quando** se olha o faturamento líquido de Ana no Dashboard, no Analytics, no acompanhamento semanal, no acompanhamento do coordenador e no Painel de Gestão, para o mesmo mês e escopo
- **Então** todas mostram R$ 9.200; uma tela que mostre bruto escreve "bruto" no rótulo

**C-005 — Substituto de férias herda a carteira do titular**
- **Dado que** Ana está de férias de 01/11 a 15/11 com Bruno como substituto
- **Quando** em 05/11 Bruno abre a carteira, a agenda e o acompanhamento semanal
- **Então** vê os clientes e a agenda de Ana junto com os dele, identificados como de Ana; em 16/11 deixa de ver

**C-006 — Tela restrita recusa quem não tem papel**
- **Dado que** Ana é vendedora
- **Quando** ela digita o endereço de uma tela de diretoria
- **Então** vê a mensagem de acesso restrito e nenhum dado da tela é carregado

**C-007 — Falha de carga não derruba a tela**
- **Dado que** um dos blocos do Dashboard falha ao carregar
- **Quando** a tela abre
- **Então** os outros blocos aparecem normalmente e o bloco com falha mostra "Não foi possível carregar este bloco agora. Tente atualizar a tela."

**C-008 — Limite de uso do projeto**
- **Dado que** o projeto está perto do limite de consultas por minuto, somando todos os usuários
- **Quando** um usuário aperta "Atualizar" cinco vezes seguidas
- **Então** o sistema faz uma única nova consulta e, se o limite for atingido, avisa para aguardar um minuto, sem mostrar erro técnico

## Regras transversais

- **RNT-001 — Papéis.** Papéis: VENDEDOR, COORDENADOR, DIRETORIA, GESTOR, ADMIN. ADMIN é o papel da equipe técnica (TI): onde uma spec diz "TI" como perfil, leia-se ADMIN. Usuário sem papel = VENDEDOR. DIRETORIA, COORDENADOR e VENDEDOR são atribuídos pela tela de papéis; GESTOR e ADMIN, só por um ADMIN. Uma pessoa pode acumular papéis (ex.: COORDENADOR e GESTOR); atribuir um papel **não remove** os outros.
- **RNT-002 — Acesso por papel, nunca por pessoa.** Toda tela restrita é liberada por papel (ou por cadastro, como "coordenador ativo"), conferido no servidor a cada carga. Não existe liberação por e-mail ou nome fixo.
- **RNT-003 — Escopo de visualização.** Modos: **Meu painel** (só o usuário), **Time inteiro** (todos os vendedores das BUs do coordenador), **Vendedor específico** e **Todos os coordenadores** / "Coordenador: X" (diretoria). O modo padrão é Meu painel para vendedor, Time inteiro para coordenador e Todos os coordenadores para diretoria. Há recortes adicionais por filial, departamento e seção, em cascata: trocar o coordenador limpa vendedor, filial, departamento e seção; trocar a filial limpa departamento e seção. A lista de vendedores sempre respeita o coordenador escolhido. Vendedor com mais de um escopo também vê o filtro (para ver um departamento por vez; sem seleção, vê todos). Quem não tem permissão para um modo nunca recebe dados dele, mesmo que peça. O recorte escolhido é lembrado ao trocar de tela, até a pessoa sair do sistema; ao entrar de novo, volta ao padrão do perfil.
- **RNT-004 — Equipe do coordenador.** O coordenador enxerga os vendedores que têm escopo ativo em alguma das suas BUs e RCA vinculado. A equipe é recortada pela BU: vendedor que responde a dois coordenadores aparece para cada um só com os dados da BU daquele coordenador.
- **RNT-005 — Semana operacional.** Vai de sexta a quinta e é recortada nos limites do mês: a semana 1 começa sempre no dia 1, a última termina no último dia do mês, e uma semana que atravessa a virada do mês é dividida em duas. Um mês tem de 4 a 6 semanas operacionais. É a semana do acompanhamento semanal e dos relatórios de venda.
- **RNT-006 — Semana de visitas.** A meta semanal de visitas usa a semana **calendário** de segunda a sexta. Sábado e domingo nunca contam. É diferente da RNT-005, e as telas dizem qual semana estão usando.
- **RNT-016 — Dias úteis.** Dia útil = segunda a sexta. Feriados **não** são descontados (decisão de 2026-10-30). Vale para projeções de fechamento, metas por dia útil e a meta semanal de visitas.
- **RNT-007 — Atribuição da venda ao vendedor.** Uma linha de venda conta para um vendedor quando, ao mesmo tempo: (a) o cliente está na carteira dele, ou na carteira de um titular de quem ele é substituto com férias ativas na data da venda; e (b) a filial e o departamento da venda casam com um escopo ativo dele, e a seção também casa quando o escopo define seção (comparação de códigos sem zero à esquerda: 2 = 02). O RCA gravado na venda não decide a atribuição. O mesmo cliente pode contar para vendedores diferentes em BUs diferentes.
- **RNT-008 — Faturamento líquido é o padrão.** "Faturamento" e "realizado" sem qualificação são sempre **líquidos** (bruto − devoluções do mesmo período e escopo). Uma tela que mostre bruto ou devolução usa esse nome no rótulo.
- **RNT-009 — Meta de faturamento.** A meta por BU e UF vem do planejamento estratégico, que é outro sistema; uma rotina a traz e ela já aparece para o coordenador redistribuir. Este sistema não lança, não altera e não remove meta da BU. Meta do vendedor = soma do que o coordenador distribuiu para ele no mês; sem distribuição, a meta é zero e a tela diz "Meta não distribuída".
- **RNT-010 — Férias.** Férias têm titular, substituto (diferente do titular), início e fim (início ≤ fim) e estado: FUTURA, ATIVA ou ENCERRADA. Só férias ATIVAS dão ao substituto acesso a carteira, agenda e vendas do titular. Atividades e propostas (mixes) do titular nunca passam ao substituto; ele pode criar as próprias propostas para os clientes herdados. Não pode haver duas férias sobrepostas para o mesmo titular. Quem está de férias não pode ser substituto no mesmo período, e quem está substituindo não pode sair de férias nele. Existe **um único** cadastro de férias; o "status férias" em Configurações mostra esse cadastro e não é uma segunda fonte.
- **RNT-011 — Fuso, datas e moeda.** Toda data e hora é de Brasília (America/São Paulo). Datas aparecem como dd/mm/aaaa, moeda como R$ 1.234,56 e percentual com uma casa (12,3%). Campos de valor aceitam `1.500,50` e `1500.50`.
- **RNT-012 — Identidade vem da sessão.** Quem está agindo é sempre o usuário logado, identificado no servidor. Nenhuma ação aceita "em nome de" outro usuário por um parâmetro vindo da tela. Ações sobre dados de outro (coordenador sobre a equipe, substituto sobre o titular) são autorizadas no servidor pelas regras RNT-003, RNT-004 e RNT-010.
- **RNT-013 — Toda escrita confirma o que fez.** Uma ação de gravar responde quantos registros mudou. Zero registros = mensagem de erro clara ("nada foi alterado: …"), nunca "salvo com sucesso".
- **RNT-014 — Busca de clientes e produtos.** Não diferencia maiúsculas, minúsculas nem acentos, e aceita nome, nome fantasia, CNPJ ou código do ERP.
- **RNT-015 — Dados atualizados por rotinas.** Vendas, devoluções, clientes, metas do planejamento, custos e alertas chegam por rotinas automáticas. Toda tela que depende delas mostra quando foi a última atualização.

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE aplicar o escopo de visualização (RNT-003/004) em Dashboard, Agenda, Clientes, Atividades, Alertas, Analytics e Acompanhamento semanal | As mesmas combinações de escopo devolvem os mesmos vendedores nas 7 telas | must |
| RF-002 | O sistema DEVE calcular o faturamento de vendedor, equipe e BU por uma única regra (RNT-007 + RNT-008) | C-003 e C-004 passam em todas as telas que mostram faturamento | must |
| RF-003 | O sistema DEVE liberar telas e menu só por papel ou cadastro (RNT-001/002) | Nenhuma tela é liberada por e-mail; C-006 passa para todas as telas restritas | must |
| RF-004 | O sistema DEVE aplicar as férias ativas em carteira, agenda e vendas (RNT-010), e só nelas | C-005 passa nas 3 áreas; atividades e mixes do titular não aparecem para o substituto | must |
| RF-005 | O sistema DEVE isolar falhas por bloco de tela | C-007 | must |
| RF-006 | O sistema DEVE mostrar a data da última atualização dos dados vindos do ERP nas telas de vendas | A data aparece no Dashboard, Analytics, acompanhamento semanal e painéis | should |
| RF-007 | O sistema DEVE manter os dados já gravados em produção, sem migração nem perda | Todos os registros existentes aparecem no sistema novo com o mesmo significado | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNFT-001 | Toda listagem é paginada no servidor (padrão de 20 a 50 por página) e mostra o total | Lista com 5.000 clientes abre a primeira página em até 2 s |
| RNFT-002 | Uma tela aberta faz no máximo 10 consultas na carga e não repete consultas iguais em sequência; o projeto inteiro tem um teto de 300 consultas por minuto | Contagem de consultas por tela no simulador; C-008 |
| RNFT-003 | Funciona em celular (largura mínima de 360 px) e em computador | Revisão manual das telas de uso em campo: Agenda, Clientes, Atividades e Dashboard |
| RNFT-004 | Tema claro e escuro em todas as telas, sem nenhuma cor fixa fora da paleta do design system; o tema segue o painel do workspace quando o sistema está embutido nele | Revisão manual em tema escuro; busca por cor literal no código não encontra nada |
| RNFT-005 | A tela nunca lê nem grava dados por fora das funções do servidor que aplicam as regras de acesso | Revisão de código: zero acesso direto a registro |
| RNFT-006 | Credenciais (Google, integrações) nunca chegam ao navegador nem aparecem em resposta de função usada por tela | Revisão das respostas das funções |
| RNFT-007 | Mensagens ao usuário em português, sem termo técnico nem código de erro; o detalhe técnico vai para o log | Revisão das mensagens de erro |
| RNFT-008 | Toda regra de negócio tem teste automatizado antes de publicar | Testes dos dois lados verdes |

## Entidades do domínio

- **Usuário** — pessoa que entra no sistema; tem papéis (RNT-001), no máximo um RCA, preferências e, opcionalmente, férias.
- **Coordenador** — usuário com código de supervisor e uma lista de BUs.
- **BU / Filial / Departamento / Seção** — estrutura comercial vinda do ERP. Filial tem UF; seção pertence a um departamento.
- **Escopo** — vínculo usuário ↔ departamento + filial + seção, ativo ou inativo.
- **Cliente** — empresa compradora vinda do ERP (código do ERP, CNPJ, ramo, UF, cidade). Pessoa física não entra na carteira.
- **Carteira** — vínculo cliente ↔ vendedor por filial e seção, com curva A/B/C/D.
- **Titular do cliente** — responsável principal pelo cliente em um departamento (spec 002).
- **Venda / Devolução** — linhas vindas do ERP: cliente, filial, departamento, seção, produto, quantidade, valor, data de saída.
- **Meta** — valor mensal por BU+UF (diretoria) e por vendedor+BU (coordenador), com rateio por ramo e UF.
- **Visita / Compromisso interno / Visita de prospecção** — itens da agenda (spec 003).
- **Atividade** — tarefa com prazo e prioridade (spec 004).
- **Alerta** — aviso comercial gerado sobre o histórico de um cliente (spec 008).
- **Prospect** — empresa em prospecção, com contatos e visitas (spec 008).
- **Mix** — proposta de produtos com custo, margem e preço para um cliente (spec 009).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Ana (40 clientes) e Bruno (35): consulta de carteira como Ana devolve 40 e nenhum cliente de Bruno; pedir o escopo "Time inteiro" como Ana devolve os mesmos 40 | regra de negócio |
| C-002 / RNT-004 | Carlos com BUs F1·Nutrição e F2·Nutrição: equipe = {Ana}; Bruno (F3·Medicamento) fora | regra de negócio |
| C-003 / RNT-007 | Vendas de X: R$ 1.000 em F1·Nutrição + R$ 500 em F2·Nutrição; escopo de Ana = F1·Nutrição → bruto de Ana = R$ 1.000 | regra de negócio |
| RNT-007 (seção) | Escopo com seção 2 casa venda da seção "02"; escopo sem seção casa qualquer seção; escopo com seção 3 não casa a seção 2 | regra de negócio |
| C-004 / RNT-008 | Bruto R$ 10.000 e devolução R$ 800 → líquido R$ 9.200 em todas as consultas de faturamento do mês | regra de negócio |
| C-005 / RNT-010 | Férias de Ana de 01/11 a 15/11, substituto Bruno: em 05/11 a carteira de Bruno = 35 + 40; em 16/11 = 35; venda de cliente de Ana em 05/11 conta para Bruno | regra de negócio |
| RNT-010 (validação) | Férias com substituto igual ao titular, com início > fim, sobrepostas a outras do mesmo titular, ou com substituto que está de férias no período, são recusadas com mensagem própria | regra de negócio |
| C-006 / RNT-002 | Consulta de tela de diretoria como vendedor devolve "sem permissão" e zero linhas | regra de negócio |
| RNT-001 | Atribuir COORDENADOR a quem é GESTOR mantém GESTOR | regra de negócio |
| RNT-003 (cascata) | Trocar o coordenador zera vendedor, filial, departamento e seção; trocar a filial zera departamento e seção | regra de tela |
| RNT-005 | Out/2026: semanas 01–01 (qui), 02–08, 09–15, 16–22, 23–29, 30–31 → 6 semanas; Fev/2026 (dia 1 é domingo): 01–05, 06–12, 13–19, 20–26, 27–28 → 5 semanas; Mai/2026 (dia 1 é sexta): a semana 1 vai de 01 a 07 e a semana 2 começa em 08 | regra de tela |
| RNT-006 | Semana de 26/10/2026 a 30/10/2026; visita no sábado 31/10 não conta | regra de tela |
| RNT-016 | Out/2026 tem 22 dias úteis (seg–sex); 12/10 (feriado nacional, segunda) conta como dia útil | regra de tela |
| RNT-011 | 1234.5 → "R$ 1.234,50"; "1.500,50" e "1500.50" → 1500.5; 0.1234 → "12,3%"; "2026-10-30T23:30:00" em Brasília → 30/10/2026 | regra de tela |
| RNT-012 | Ação de gravar com id de outro usuário no parâmetro grava para o usuário logado ou é recusada | regra de negócio |
| RNT-013 | Atualizar registro inexistente responde 0 alterados e a tela mostra erro, não sucesso | regra de negócio |
| RNT-014 | Busca "acai" encontra "AÇAÍ LTDA"; busca pelo CNPJ só com números encontra o CNPJ formatado | regra de negócio |
| C-007 | Uma das consultas da tela falha → as outras renderizam e o bloco mostra a mensagem padrão | regra de tela |
| C-008 | Cinco cliques em "Atualizar" em 1 s geram uma consulta | regra de tela |

Verificação manual:
- [ ] RNFT-003 — Agenda, Clientes, Atividades e Dashboard usáveis em 360 px
- [ ] RNFT-004 — todas as telas em tema escuro sem cor quebrada; tema acompanha o painel do workspace
- [ ] RF-007 — amostra de 10 clientes, 10 visitas e 10 mixes de produção aparece igual no sistema novo

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Painel de Gestão e Faturamento mostram bruto sem dizer; Dashboard, Analytics e Diretoria mostram líquido | Líquido é o padrão; bruto só com rótulo (RNT-008) | manual de suporte, "Por que os números diferem entre os painéis" |
| Substituto de férias não herda a carteira no acompanhamento semanal | Herda em todas as áreas (RNT-007/010) | pendências, item 12 |
| Dois cadastros de férias (Configurações do titular e Férias de Vendedores) com efeitos diferentes; férias sobrepostas aceitas | Cadastro único, sem sobreposição (RNT-010) | manual de suporte, seção 13 |
| Duas telas técnicas liberadas pelo e-mail de uma pessoa | Painel de Validação liberado por papel ADMIN (TI); Acomp. Semanal Admin cancelada em 2026-11-03 (RNT-002) | pendências, item 5 |
| Salvar papel de quem é GESTOR/ADMIN apaga esse papel | Papéis acumulam (RNT-001) | manual de suporte, seção 13 |
| Diretoria não vê no menu telas que tem permissão de abrir | Menu = permissões (spec 001) | manual de suporte, seção 1 |
| Lista "Vendedor específico" ignora o coordenador escolhido | Lista sempre recortada pelo coordenador (RNT-003) | manual de suporte, seção 1 |
| Ações que não gravam nada respondem "sucesso" | Respondem quantos registros mudaram (RNT-013) | `tasks.md` da raiz; manual de suporte, Gestão de Carteira |
| Tela de Clientes lê um registro direto da tabela (403 para vendedor) | Só por função do servidor (RNFT-005) | pendências, item 6; `tasks.md` da raiz |
| ~3,3 mil cores fixas nas páginas; o tema escuro não funciona | Tema 100% por tokens (RNFT-004) | pendências, item 8 |
| Busca e sino da barra superior sem função | Removidos da barra superior (spec 001) | manual de suporte, seção 1 |
| Meta do vendedor sem distribuição cai num cadastro antigo que ninguém alimenta | Sem distribuição = zero e "Meta não distribuída" (RNT-009) | banco de dados, Metas |

## Acréscimos de estrutura previstos

Algumas correções não cabem nos dados que existem hoje. Cada uma entra só como
**acréscimo** (dado novo ao lado do existente, nada alterado ou removido) e
precisa de aprovação antes do plano do módulo:

| Acréscimo | Para quê | Spec | Situação |
|---|---|---|---|
| Papéis por usuário (vários por pessoa) | RNT-001: hoje cabe um papel por pessoa | 001, 010 | aprovado |
| Meta semanal de visitas por perfil, com vigência | Hoje os valores 16 e 8 estão fixos no código | 005 | aprovado; a diretoria configura |
| Histórico das alterações da meta da BU | Diretoria ver quem mudou o quê | 010 | sem efeito: a meta da BU não é lançada neste sistema (2026-11-03) |

## Fora de escopo

- [ ] Mudar a estrutura de dados de produção. Qualquer coluna ou tabela nova exige spec própria e entra como acréscimo, nunca como alteração ou remoção (ver `modelo-de-dados.md`).
- [ ] Migrar ou limpar dados históricos, inclusive os cadastros legados que o sistema novo deixa de ler.
- [ ] Trocar o ERP, o planejamento estratégico, a gestão de custos ou o sistema de compras: as integrações continuam com o mesmo comportamento externo.
- [ ] Aplicativo nativo para celular (o sistema continua no navegador).
- [ ] Funcionamento offline.
- [ ] Ajuda (manual do vendedor), Suporte, Painel do desenvolvedor, Notas de versão e Solicitações de compras: canceladas em 2026-10-30 (specs 011 e 012). As funções do servidor dessas telas entram na lista de aposentadoria.
- [ ] Agenda dos Vendedores, Análise Diretoria, Faturamento e Gestão de Metas: canceladas em 2026-11-03 (specs 003 e 010). A agenda da equipe fica na Agenda, pelo filtro de escopo; as funções do servidor dessas telas entram na lista de aposentadoria.
- [ ] Lançar, alterar ou remover meta da BU: a meta vem do planejamento estratégico (RNT-009). Os lançamentos manuais antigos ficam no banco e não são lidos.
- [ ] Autocadastro de conta: só se entra com Google, Microsoft ou conta criada pela gestão (spec 001).
- [ ] Comissões calculadas automaticamente (hoje só existe cadastro manual — spec 010).
- [ ] Troca módulo a módulo: o sistema novo roda em outro endereço, ao lado do antigo e sobre os mesmos dados, e a troca é feita de uma vez quando o novo cobrir os módulos.

## Pendências

- [x] Decidido em 2026-10-30: o filtro de escopo é **lembrado entre telas** até a pessoa sair do sistema; ao entrar de novo, volta ao padrão do perfil (RNT-003).
- [x] Decidido em 2026-10-30: papéis acumulam, com o cadastro novo de papéis por usuário aprovado. **ADMIN e TI são o mesmo papel**: não existe papel ADMIN (TI) separado, e onde as specs dizem "TI" como perfil leia-se ADMIN. DIRETORIA, COORDENADOR e VENDEDOR são atribuídos pela tela; GESTOR e ADMIN só pelo ADMIN.
- [x] Decidido em 2026-10-30: meta semanal de visitas configurável aprovada: a diretoria define um valor por perfil, que vale a partir da semana seguinte. Meta da BU: não é lançada neste sistema (decisão de 2026-11-03, RNT-009).
- [x] Decidido em 2026-10-30: trocar o componente de planilha por tabelas do design system (ordenar, filtrar, exportar para Excel). A licença não será comprada.
- [x] Decidido em 2026-10-30: a busca e o sino saem da barra superior. A busca de cliente fica na tela Clientes e os alertas no menu `Alertas`.
- [x] Decidido em 2026-10-30: lado a lado: o sistema novo roda em outro endereço sobre os mesmos dados; os usuários seguem no antigo até o novo cobrir os módulos, e a troca é feita de uma vez.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-006, C-007, C-008)
- [x] Seção "Testes" preenchida: todo C-00N e toda RNT com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

Fontes do comportamento atual usadas nesta spec:

| Regra | Onde está hoje |
|---|---|
| RNT-003 | `frontend/src/components/CoordinatorScopeFilter.tsx` (`useCoordinatorScope`); `docs/regras-de-negocio.md#escopo-de-visualização` |
| RNT-004 | tabelas `COORDENADORES`, `COORDENADORES_BU`, `BU_VENDEDOR`, `VENDEDOR_RCA` |
| RNT-005 | `frontend/src/lib/operational-week.ts` |
| RNT-006 | `DashboardPage.tsx` e `AgendaPage.tsx` (meta semanal de visitas) |
| RNT-007 | SF 104 `calcularBwSemanal` (CTEs `CARTEIRA`, `VENDEDOR_ESCOPO`), `backend/sf-versions/20260821151600/sf-104-calcular-bw-semanal.sql` |
| RNT-009 | view `VW_META_VENDEDOR_MES`; SFs 195–197, 295–296 |
| RNT-010 | `FERIAS_VENDEDOR`, `FUNCIONARIOS.ID_SUBSTITUTO`; SFs 164–166 e 64–67 |
| RNT-011 | `frontend/src/hooks/useMitra.ts` (`formatCurrency`, `getBrasiliaDate`), `frontend/src/pages/metas.utils.ts` |
| RNT-014 | `frontend/src/lib/smartSearch.ts`; SFs de carteira com busca case-insensitive |
| RNFT-002 | limite de 300 SF/min por projeto (`docs/modulos/analytics.md`, Aba Metas) |
| RNFT-004 | `frontend/src/index.css`, `frontend/src/lib/theme.ts` (protocolo `mitra-tema` com o Meu painel, projeto 61812) |
| Papéis e gates | `USUARIO_CARGO`; SFs de permissão 29, 153, 167, 172, 204, 236, 269; `Layout.tsx:58` (gate por e-mail) |
