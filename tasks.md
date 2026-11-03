# Tasks — Crescimento da tabela ACOMP_SEMANAL_SYNC_ERRO

Decisao do usuario: opcoes A + B + C (estado atual, um registro por erro com contador, retencao).

| # | Task | Status | Output |
|---|------|--------|--------|
| 0 | Diagnostico (volume, frequencia, quem le a tabela) | concluida | ~38 mil erros regravados a cada execucao horaria; nenhuma tela/SF le |
| 1 | Snapshot da SF 107 | concluida | backend/sf-versions/20261005120000 |
| 2 | Tabela ACOMP_SEMANAL_SYNC_ERRO_ATUAL (UNIQUE CHAVE_NATURAL+TIPO_ERRO) | concluida | backend/add-acomp-semanal-sync-erro-atual.mjs (migration runddl-1791222719.sql) |
| 3 | SF 107: upsert com contador, resolve ausentes, apaga resolvidos > 7 dias | concluida | backend/acompanhamento-semanal-sincronizar-manual-escopo.sf.js |
| 4 | Teste no DEV (2 execucoes + teste de resolucao/retencao) | concluida | 38.689 linhas fixas, contador 2, tabela antiga sem gravacao |
| 5 | Documentacao | concluida | docs/banco-de-dados.md |
| 7 | SF 107: fechar execucoes presas em RUNNING (> 30 min) como FAILED | concluida | 44 execucoes antigas fechadas no DEV |
| 8 | SF 107: gravar a mensagem real da falha (antes "[object Object]") | concluida | helper errorMessage; snapshot backend/sf-versions/20261005130000 |
| 6 | Esvaziar (TRUNCATE) a tabela antiga ACOMP_SEMANAL_SYNC_ERRO (DEV e PROD) | bloqueada | aprovado pelo usuario em 2026-10-05; a plataforma exige confirmDestructive:true e o runDdlMitra do mitra-sdk (1.0.64 e 1.0.65) nao repassa o parametro. Retomar quando a SDK suportar |

## Pendente (nao aprovado nesta rodada)

- SF 197/296 sao INSERT..SELECT: se a permissao barrar, gravam zero linhas sem erro.
  Hoje inofensivo (a tela so libera edicao para coordenador e so lista as BUs dele),
  mas uma chamada forjada recebe "sucesso" sem gravar.
- `ClientesPage.tsx:4` importa `getRecordMitra` (CRUD REST), que retorna 403 para
  usuario business. Fora do escopo desta correcao.
