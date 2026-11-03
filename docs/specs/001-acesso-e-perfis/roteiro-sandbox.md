# Roteiro do sandbox — spec 001

**Data:** 2026-11-03 · Cobre as tasks que só rodam no sandbox do Mitra:
T-001, T-002, T-003, T-004 e T-105.

## Antes de abrir o sandbox

O sandbox trabalha sobre o repositório `mitra-agent-projects/p-60604` (branch
`main`). A pasta local **não é um repositório git**, então `novo/` e
`docs/specs/` só chegam ao sandbox se estiverem na `main`. Confirme isso antes
de colar o prompt. Sem esses arquivos lá, o agente não tem o que publicar.

## Onde você entra

| Etapa | Quem | Por quê |
|---|---|---|
| 1. Leituras (T-001, T-003, T-004) | agente, sozinho | só consulta; não muda nada |
| 2. Onde hospedar o frontend novo (T-002) | **você decide** | o agente investiga e pergunta |
| 3. Publicar (add-001, add-000, mapa de ids, build) | agente, depois do seu sim | muda o projeto em produção |
| 4. Salvar Configurações como vendedor (T-105) | **você**, no navegador | o agente entra como desenvolvedor, e o risco é justamente o usuário comum |

## Prompt para colar no sandbox

```text
Spec 001 do sistema novo (Sales 360). Leia antes: novo/CLAUDE.md, novo/README.md,
docs/specs/001-acesso-e-perfis/plan.md e tasks.md. Siga o CLAUDE.md da raiz
(SYNC no início, SHARE no fim; nunca tocar em backend/migrations/ nem em
migrations.yaml).

Regras desta tarefa:
- O sistema antigo (frontend/ e backend/ da raiz) NÃO é tocado. Em especial,
  não rode `npm run build` em frontend/ nem grave nada em frontend/dist.
- novo/backend precisa de .env: copie o .env do backend/ antigo
  (`cp backend/.env novo/backend/.env`). Nunca commite .env.
- Faça as etapas na ordem e PARE onde está marcado.

ETAPA 1 — só leitura (T-001, T-003, T-004). Use runQueryMitra; nada de DDL/DML.
a) T-003: listServerFunctionsMitra e confirme que nenhuma SF começa com "s360".
   Se existir alguma, pare e me mostre.
b) T-001: leia as colunas reais (information_schema.COLUMNS, TABLE_SCHEMA = DATABASE())
   de USUARIO_PREFERENCIAS, USUARIO_BLOQUEIO, USUARIO_CARGO e INT_USER.
   Compare com novo/backend/schema-producao.mjs e com o que as SFs de
   novo/backend/add-001-acesso.mjs usam:
   - USUARIO_PREFERENCIAS: ID, USER_ID, MODO_AGENDA, EXIBICAO_TAREFAS, PAGINA_INICIAL, ATUALIZADO_EM
   - USUARIO_BLOQUEIO: USER_ID, BLOQUEADO
   - USUARIO_CARGO: USER_ID, CARGO (diga também se existe a coluna ID — lacuna L-04)
   - INT_USER: ID, DESCR, NOME
   Diga também se existe a tabela USUARIO_PAPEL (não deveria).
   Se alguma coluna usada faltar ou tiver outro nome, corrija schema-producao.mjs
   e as SFs, rode `cd novo/backend && npm install && npm test` (tem que passar)
   e registre a estrutura real em plan.md, seção Modelo de dados.
c) T-004: liste quem ainda tem marcação de férias no cadastro antigo:
   SELECT F.ID, F.NOME, F.STATUS, F.ID_SUBSTITUTO, S.NOME AS SUBSTITUTO, F.ATUALIZADO_EM
   FROM FUNCIONARIOS F LEFT JOIN FUNCIONARIOS S ON S.ID = F.ID_SUBSTITUTO
   WHERE UPPER(COALESCE(F.STATUS, 'ATIVO')) <> 'ATIVO' OR F.ID_SUBSTITUTO IS NOT NULL
   ORDER BY F.NOME
   Grave o resultado em docs/specs/001-acesso-e-perfis/ferias-a-recadastrar.md
   (tabela: pessoa, status, substituto, última atualização), com uma frase dizendo
   que a coordenação deve recadastrar esses períodos em Férias de Vendedores
   (decisão A10). Sem e-mail e sem dado além desses.

ETAPA 2 — T-002, só investigar. Descubra como o frontend deste projeto é
publicado hoje (o que a plataforma serve e de qual pasta) e se dá para servir
um SEGUNDO build (novo/frontend/dist) sem substituir o atual. As saídas
previstas no plan.md (Riscos, linha 1) são: segundo app no mesmo projeto, ou
um projeto Mitra só de hospedagem chamando as SFs do 60604 pelo projectId.
PARE AQUI e me pergunte, em linguagem simples, qual saída usar. Mostre também
o resumo das etapas 1a, 1b e 1c.

ETAPA 3 — só depois do meu sim. Publicar:
  cd novo/backend && npm install
  node add-001-acesso.mjs            # cria USUARIO_PAPEL, copia os papéis, publica as 5 SFs s360*
  node add-000-perfil-acesso.mjs     # põe as s360* e USUARIO_PAPEL no perfil "Operacao Comercial"
  npm run sync:function-map          # leva os ids reais a novo/frontend/src/lib/server-functions.ts
  cd ../frontend && npm install && npm test && npm run build
Confira na saída do add-000 que nenhuma lista do perfil diminuiu (ele avisa
"ATENCAO: diminuiu"). Se diminuir, pare e me mostre. Publique o build no
destino escolhido na etapa 2, com VITE_MITRA_PROJECT_ID do 60604.
Depois confira, rodando como você mesmo, que s360SessaoObter({hoje}) devolve
uma linha com PAPEIS preenchido.

ETAPA 4 — me entregue o endereço do frontend novo e PARE: eu testo salvar
Configurações com um vendedor (T-105).

No fim: marque T-001..T-004 (e T-105 se eu confirmar) em tasks.md, anote em
plan.md o que mudou, e faça o SHARE.
```

## Etapa 4 — teste que é seu (T-105)

Entre no endereço novo **com um vendedor**, não com a conta de desenvolvedor:

1. Abra Configurações, mude "Exibição padrão de Atividades" e clique em
   **Salvar Configurações**.
2. Esperado: "Configurações atualizadas com sucesso."
3. Saia, entre de novo e confira que a escolha ficou.
4. No sistema antigo, a mesma pessoa deve ver a mesma preferência (as duas
   gerações leem a mesma linha).

Se aparecer "Falha ao salvar configurações.", é o risco anotado no plan: a
plataforma pode recusar para usuário comum a gravação em duas tabelas de uma
vez. Volte ao agente com essa mensagem. A correção prevista é separar em duas
gravações, e ela passa pela spec antes.

Também vale conferir:
- com um usuário bloqueado em Executivas de Venda, o login volta com
  "Seu acesso ao sistema foi desativado. Procure seu gestor.";
- no celular, o ☰ abre e fecha o menu;
- aberto pelo Meu painel no escuro, o sistema já abre escuro.
