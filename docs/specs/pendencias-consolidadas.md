# Pendências consolidadas das specs de reconstrução

**Data:** 2026-10-30 · Todas as decisões foram fechadas com o usuário em
2026-10-30 e aplicadas nas specs: as 16 transversais (grupo A) e as 46 por
módulo (grupo B). "Mantido" = o padrão sugerido foi aceito; "**mudou**" = a
spec foi reescrita naquele ponto.

## A. Decisões transversais — fechadas em 2026-10-30

| # | Decisão | Specs alteradas |
|---|---|---|
| A1 | Papéis acumulam, com o cadastro novo de papéis por usuário aprovado. **ADMIN = TI** (não existe papel TI separado). DIRETORIA, COORDENADOR e VENDEDOR são atribuídos pela tela; GESTOR e ADMIN, só por um ADMIN | 000 (RNT-001), 001, 006, 010, 012 |
| A2/A3 | Meta semanal de visitas configurável (acréscimo aprovado): a diretoria define um valor por perfil, que vale a partir da semana seguinte | 000, 005 |
| A4 | Convivência lado a lado: o sistema novo roda em outro endereço sobre os mesmos dados, e a troca é feita de uma vez no fim | 000 |
| A5 | Líquido negativo aparece negativo em todas as telas | 006, 007 |
| A6 | Quem está bloqueado em Executivas de Venda fica fora da titularidade e dos rankings | 002, 007 |
| A7 | O substituto **não** vê nem trata as atividades do titular | 004 |
| A8 | O substituto **não** acessa os mixes do titular; usa só os clientes herdados para montar as próprias propostas | 000 (RNT-010), 009 |
| A9 | Só o coordenador (e a diretoria) cadastra férias | 001 |
| A10 | As marcações atuais de férias em Configurações viram uma lista para a coordenação recadastrar | 001 |
| A11 | Quem está de férias não pode ser substituto no mesmo período, e vice-versa | 000 (RNT-010), 010 |
| A12 | A sincronização manual de vendas é só de GESTOR e ADMIN; o `Atualizar` da Prospecção só recarrega a lista | 006, 008 |
| A13 | O filtro de escopo é lembrado entre telas até a pessoa sair do sistema | 000 (RNT-003) |
| A14 | A planilha com licença não comercial é trocada por tabelas do design system com exportação para Excel | 000 |
| A15 | Busca e sino saem da barra superior | 000, 001 |
| A16 | Só conta a visita concluída pelo dono da carteira (dias sem visita, temperatura, Carteira sem Visitação) | 002, 008 |

## B. Decisões por módulo — fechadas em 2026-10-30

| # | Decisão | Spec |
|---|---|---|
| B1 | **mudou** — ninguém cria conta: entra-se só com Google, Microsoft ou conta criada pela gestão | 001 |
| B2 | **mudou** — ficha do cliente só leitura; tudo vem do ERP | 002 |
| B3 | **mudou** — todos os compromissos bloqueiam sobreposição de horário da mesma pessoa | 003 |
| B4 | mantido — visita para outro vendedor: basta o cliente estar na carteira (ou equipe) de quem cria | 003 |
| B5 | **mudou** — concluir deslocamento exige relato, só a partir da data | 003 |
| B6 | mantido — check-in em data futura permitido | 003 |
| B7 | **mudou** — o evento no Google mostra o status no título, com o relato na descrição | 003 |
| B8 | **mudou** — selo da meta mensal pela projeção em dias úteis | 005 |
| B9 | **mudou** — cards "Visitas no mês" e "Clientes na carteira" descartados | 005 |
| B10 | mantido — "Últimas Atividades" = 3 pendentes por prazo | 005 |
| B11 | **mudou** — status só pela faixa de B/W (< 15% / 15–25% / > 25%) nas duas visões | 006 |
| B12 | **mudou** — em mês encerrado, o status olha o mês inteiro | 006 |
| B13 | definido — linhas repetidas do ERP (produto, pedido, filial) são somadas | 006 |
| B14 | definido — devoluções chegam de hora em hora | 006 |
| B15 | **mudou** — dias úteis = seg–sex, sem descontar feriados (RNT-016) | 000, 005, 007 |
| B16 | mantido — rateio por ramo/UF só nas UFs das filiais do vendedor | 007 |
| B17 | mantido — a sobra dos ramos personalizados vai para os automáticos | 007 |
| B18 | **mudou** — meta manual zero é ignorada (vale o planejamento). *Sem efeito desde D2* | 007 |
| B19 | mantido — departamento ↔ unidade do planejamento continua fixa | 007 |
| B20 | **mudou** — comparativo contra o mês anterior inteiro | 007 |
| B21 | mantido — clique filtra só os rankings de clientes e de produtos | 007 |
| B22 | mantido — reativar Não Explorado e Pedido Incompleto | 008 |
| B23 | mantido — só o dono marca o alerta como lido | 008 |
| B24 | **mudou** — Dica Pro e queda de volume descartadas (selo `Queda` da carteira com limite fixo de 30%) | 002, 005, 008 |
| B25 | sem efeito — a queda de volume foi descartada | 008 |
| B26 | **mudou** — relatório semanal dos coordenadores na semana operacional | 008 |
| B27 | mantido — prospect visível ao dono, à equipe e à diretoria; sem BU | 008 |
| B28 | **mudou** — lista de prospects na aba "Prospects" da tela Clientes | 002, 008 |
| B29 | **mudou** — prospect convertido não entra automaticamente na carteira | 008 |
| B30 | mantido — consulta de custo em tempo real aposentada | 009 |
| B31 | mantido — com mais de um custo especial, vale o menor | 009 |
| B32 | mantido — card "Vendas sem carteira" | 010 |
| B33 | mantido — sai a aba Metas de Gestão Cadastros | 010 |
| B34 | mantido — funções do "Painel do coordenador" aposentadas | 010 |
| B35 | mantido — vínculo vendedor ↔ departamento: conferir uso antes de retirar | 010 |
| B36 | mantido — escopo só em Escopo Usuários | 010 |
| B37 | mantido — botão para voltar à meta do planejamento. *Sem efeito desde D2* | 010 |
| B38 | **mudou** — Solicitações de Compras **cancelada** (spec 011) | 011 |
| B39–B41 | sem efeito — spec 011 cancelada | 011 |
| B42–B45 | sem efeito — Ajuda, Suporte, Painel Dev e Notas de versão **cancelados** (spec 012) | 012 |
| B46 | **mudou** — sem histórico da meta da BU; guarda só o último valor. *Sem efeito desde D2* | 000, 010 |

Efeito colateral do cancelamento da 012: sem Painel do desenvolvedor, a chave
do sistema de fotos do Mix fica com a equipe técnica, fora das telas (spec 009).

## D. Decisões de 2026-11-03

| # | Decisão | Specs alteradas |
|---|---|---|
| D1 | **Canceladas** as telas Agenda dos Vendedores, Análise Diretoria, Faturamento e Gestão de Metas. O coordenador vê a agenda da equipe na própria Agenda, pelo filtro de escopo | 000, 001, 003, 010 |
| D2 | A meta da BU vem do planejamento estratégico, que é outro sistema, e já chega para o coordenador redistribuir. Este sistema não lança meta; os lançamentos manuais antigos (`METAS_BU`) não são lidos | 000 (RNT-009, modelo de dados), 007, 010 |
| D3 | **Cancelada** a tela Acomp. Semanal Admin (conferência de atribuição da TI por vendedor e mês). A TI fica com o Painel de Validação; a sincronização manual continua na visão de gestão | 000, 001, 006 |

## C. Para conferir no Mitra (não são decisões)

Vêm de `000-visao-geral/modelo-de-dados.md`, seção Lacunas:
- Estrutura das tabelas sem DDL no repositório (L-01), entre elas as duas fontes de faturamento e devolução do ERP.
- Coluna de vendedor nas tabelas de vendas sem DDL (L-02).
- Qual dos dois DDLs do cadastro de papéis prevaleceu (L-04).
- Collation das tabelas buscadas além de clientes (L-06).
- Migrations: o `migrations.yaml` começa com `migrations: []` e não serve de baseline para um banco vazio (L-07 a L-09). Reportar ao sistema de migrations; **não editar**.
- SQL das funções do Painel de Validação, que não está no repositório (spec 006).
