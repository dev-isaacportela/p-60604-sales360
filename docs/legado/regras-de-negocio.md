# Regras de Negocio — Comercial Externo 360 (Benenutri)

## 1. Finalidade deste documento
Este arquivo centraliza as regras de negocio do sistema e deve ser a fonte oficial para qualquer implementacao de feature, ajuste de fluxo ou alteracao de dados.

**Regra obrigatoria de desenvolvimento:** antes de iniciar qualquer feature, consultar este arquivo e validar aderencia das regras.

---

## 2. Perfis e escopo de acesso

### 2.1 Vendedor Externo / RCA
- Acessa apenas sua carteira de clientes.
- Agenda visitas, faz check-in/check-out e registra relatos.
- Cria simulacoes de mix e acompanha suas tarefas.
- Visualiza seus indicadores de meta, vendas e comissao.

### 2.2 Supervisor / Gestor
- Visualiza dados consolidados da equipe.
- Acompanha agenda e desempenho dos subordinados.
- Analisa dashboards e indicadores gerenciais.

### 2.3 Administrador
- Gerencia parametros do sistema.
- Gerencia permissao de telas por perfil.
- Controla configuracoes de integracao.

---

## 3. Regras por modulo

## 3.1 App Wrapper e Navegacao
- O sistema deve manter navegacao por menu lateral responsivo.
- O menu deve ser organizado por categoria funcional.
- Deve exibir identidade do usuario logado e permitir logout.
- Em mobile, navegacao deve priorizar ergonomia (barra flutuante inferior).

## 3.2 Carteira de Clientes
- Cliente deve possuir status (`ATIVO` ou `INATIVO`).
- Cliente inativo nao deve entrar em novas visitas ou novas simulacoes sem reativacao.
- Listagens devem ser paginadas para performance.
- Busca deve considerar razao social, nome fantasia e CNPJ.

## 3.3 Agenda de Visitas
- Toda visita nasce com status `AGENDADA`.
- `CHECK-IN` muda status para `EM_ANDAMENTO`.
- `CHECK-OUT` muda status para `CONCLUIDA` e exige relato.
- Cancelamento muda status para `CANCELADA`.
- Uma visita concluida nao pode voltar para agendada.
- Campos minimos da visita: cliente, data, hora inicio, hora fim, tipo.

## 3.4 Tarefas
- Toda tarefa nasce com status `PENDENTE`.
- Fluxo padrao: `PENDENTE` -> `EM_ANDAMENTO` -> `CONCLUIDA`.
- Prioridades validas: `ALTA`, `MEDIA`, `BAIXA`.
- Tarefa concluida nao deve voltar automaticamente para status anterior sem acao explicita.

## 3.5 Simulacao de Mix
- Simulacao deve estar vinculada a um cliente.
- Simulacao deve conter ao menos 1 item.
- Status validos: `RASCUNHO`, `FINALIZADA`.
- Item deve conter: produto, quantidade, preco unitario e desconto.
- Desconto deve ser percentual e nao pode gerar subtotal negativo.

### Formula de subtotal por item
`subtotal = quantidade * preco_unitario * (1 - desconto_perc / 100)`

### Formula de margem do item
`margem_item = ((subtotal - custo_total_item) / subtotal) * 100`

### Formula de rentabilidade geral
`rentabilidade = ((valor_total - custo_total) / valor_total) * 100`

## 3.6 Analytics e Indicadores
- Indicadores devem refletir dados reais das tabelas operacionais.
- Dashboards devem manter consistencia de periodo na comparacao de metricas.
- Visualizacao deve priorizar leitura executiva (KPI + tendencia + distribuicao).

## 3.7 Regra de Departamento (TOTVS e Vendedor LCA)
- No TOTVS, os produtos possuem classificacao por sessao, departamento e filial.
- As BUs do sistema correspondem aos departamentos vindos do TOTVS (nao criar BU manual fora dessa origem).
- Cada RCA pode ser vinculado a um ou mais departamentos.
- Ao vincular vendedor/RCA a um departamento, a filial TOTVS de atuacao nesse departamento e obrigatoria.
- Qualquer calculo de faturamento e qualquer acompanhamento semanal do vendedor LCA deve considerar somente produtos do(s) departamento(s) vinculado(s) ao vendedor/RCA e, quando aplicavel, a filial vinculada.
- As vendas do departamento 9 (`ESTETICA E INJETAVEIS`) nas filiais 1, 2 e 6 devem ficar sob responsabilidade do usuario `comunicacao@benenutri.com` (ID 8), vinculado ao RCA 868. Esta regra e por escopo de venda/departamento, para contemplar tambem clientes pessoa fisica ou sem cadastro completo na tabela local de clientes.
- O usuario `comunicacao@benenutri.com` (ID 8) tambem deve atuar como gestor coordenador ativo do supervisor 868, com cargo operacional `COORDENADOR` e vinculo em `COORDENADORES_BU` para o departamento 9 nas filiais 1, 2 e 6.

### 3.8 Faturamento Liquido (deducao de devolucoes)
- Todo valor de faturamento exibido no acompanhamento semanal e **liquido**: vendas (`PEDIDOS_SEMANAIS_SYNC_RAW`) menos devolucoes (`IMP_DEVOLUCOES_TOTVS`).
- A devolucao entra como movimento negativo na semana operacional da `DATA_DEVOLUCAO` (sexta-quinta recortada ao mes), no mesmo escopo de cliente, filial, departamento e secao da venda.
- Devolucao de cliente fora da carteira, ou em filial/departamento fora do escopo do vendedor, nao e deduzida daquele vendedor — mesmo criterio ja aplicado as vendas.
- Cliente que teve apenas devolucao no mes aparece no acompanhamento com valor negativo.
- O perfil de compra do cliente (frequencia, semana padrao, ticket medio, alerta de ausencia de pedido) continua baseado **somente em pedidos**: uma devolucao isolada nao conta como semana de compra.
- SFs que aplicam a regra: 104 (grade), 109 (semanas do cliente), 110 (itens da semana), 111 (pedidos da semana) e 146 (listagem admin). Toda alteracao nessas SFs deve preservar o bloco marcado com `DEDUCAO_DEVOLUCOES_ACOMPANHAMENTO_SEMANAL`.

### 3.9 Saneamento de Clientes Pessoa Fisica
- Clientes pessoa fisica ou sem documento completo podem aparecer nas vendas integradas antes de existir na tabela local `CLIENTES`.
- A atribuicao de vendas por departamento nao deve depender exclusivamente da carteira local quando houver cliente ausente; nesses casos, o escopo de venda por `CODEPTO`, `CODFILIAL` e RCA prevalece para visibilidade comercial.

---

## 4. Padroes de dados e validacoes
- Datas devem seguir padrao `YYYY-MM-DD`.
- Timestamps devem seguir `YYYY-MM-DDTHH:mm:ss` quando aplicavel.
- Campos de status devem respeitar dominio fechado por modulo.
- Nao criar valores livres para status sem aprovacao funcional.

---

## 5. Regras de UX funcional
- Interfaces devem manter linguagem clara, objetiva e consistente.
- Acoes criticas devem ser explicitas (check-out, cancelar visita, concluir tarefa).
- Formularios devem destacar campos obrigatorios.
- Sempre priorizar legibilidade e baixa carga cognitiva para uso em campo.

---

## 6. Regras para novas features (obrigatorio)
Antes de implementar qualquer nova feature:

1. Ler este arquivo (`regras-de-negocio.md`).
2. Mapear quais regras existentes sao impactadas.
3. Garantir que os novos fluxos nao quebrem os estados validos.
4. Se a feature exigir nova regra, atualizar este arquivo no mesmo ciclo de entrega.
5. Validar build e comportamento funcional apos alteracao.

---

## 7. Governanca de alteracao
- Toda mudanca de regra de negocio deve atualizar este documento.
- Em caso de conflito entre implementacao e regra, prevalece este arquivo ate revisao funcional.
- Este arquivo deve permanecer versionado com o codigo do projeto.
