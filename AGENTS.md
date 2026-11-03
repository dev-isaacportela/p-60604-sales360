# Project: w-18721 > p-45654

**Working directory**: `/home/user/w-18721/p-45654/`

## Project Structure

- **Frontend (React)**: `/home/user/w-18721/p-45654/frontend/` — source code, build, Vite config
- **Backend (mitra-sdk)**: `/home/user/w-18721/p-45654/backend/` — setup-backend.mjs, .env, mitra-sdk
- **Documentação viva**: `docs/` — arquitetura, banco, server functions, regras de negócio e specs por módulo (índice em `docs/README.md`). Documentos históricos de concepção em `docs/legado/`. Ao alterar rotas, SFs, tabelas ou regras, atualize o doc correspondente em `docs/`.

## CRITICAL — Directory Scope

You are working EXCLUSIVELY in `/home/user/w-18721/p-45654/`.
Do NOT read, modify, or reference files outside this directory.
Do NOT navigate to parent or sibling directories.
Do NOT use `cd ..` or access any path that is not under your working directory.

If you see references to other projects or directories, IGNORE them — they belong to separate tasks.

## CRITICAL — Build

Always run `npm run build` from `/home/user/w-18721/p-45654/frontend/`, never from the project root.
Example: `cd /home/user/w-18721/p-45654/frontend && npm run build`

## CRITICAL — AskUserQuestion (regra de pausa)

Quando você usar a tool `AskUserQuestion`, ela DEVE ser a ÚLTIMA ação da sua resposta. PARE imediatamente após emiti-la.

- **NÃO** emita texto, código, ou outras tools (Bash, Edit, Write, git, etc.) no mesmo turno após `AskUserQuestion`. Termine sua resposta no exato momento em que a chama.
- O sistema NÃO bloqueia tools posteriores — qualquer ação que você fizer DEPOIS de `AskUserQuestion` será EXECUTADA no sandbox antes da resposta do usuário, gerando trabalho não autorizado e estado divergente.
- A resposta do usuário virá como uma nova mensagem no próximo turno. Continue a partir dali, com base no que ele decidiu.
- Use `AskUserQuestion` SOMENTE quando precisar de uma decisão antes de continuar — não para "checagens", avisos, ou enquanto já está executando algo.

## CRITICAL — Migrations (dev↔prod)

Mudanças de schema/recursos deste projeto viram **migrations** (`backend/migrations/` + `backend/migrations.yaml`):

- A história de migrations é **append-only**: NUNCA edite, renumere ou funda migration já aplicada. Correção é SEMPRE migration nova.
- Todo DDL/SF/recurso executado via SDK vira migration automaticamente — o sistema materializa e commita esses arquivos SOZINHO, DEPOIS que seu turno terminar (você não vai vê-los durante a sua sessão, isso é esperado).
- **Você NUNCA cria, edita nem faz `git add`/commit em `backend/migrations/` ou `backend/migrations.yaml` — esses paths são gerenciados EXCLUSIVAMENTE pelo sistema, fora do seu turno.**
- `mergeBaseline` ("Reconciliar Baseline") é PROIBIDO sem ordem explícita do usuário.
- Após 3 tentativas sem sucesso na mesma correção, PARE e escale com o dossiê (erro estruturado + o que tentou).

## CRITICAL — Sincronização com a Equipe (SYNC / SHARE)

> **⚠️ AMBIENTE MULTI-USUÁRIO — SYNC e SHARE são INEGOCIÁVEIS:** Você compartilha este projeto com outros agentes/colaboradores via git. EXECUTE `git fetch origin && git merge origin/main` ANTES de qualquer coisa em todo turno — mesmo se o pedido for `"oi"`, `"qual a cor X?"` ou `"explica Y"`. SYNC não é só `git pull` — **depois do merge, LEIA o diff e avalie**: outro usuário pode ter feito (parte d)o pedido, alterado contexto relevante, ou tornado sua abordagem inicial obsoleta. EXECUTE `git add + commit + push` UMA vez no FIM do turno se houve qualquer mudança — mudou 1 byte ou 10 arquivos = 1 SHARE só, NÃO 1 commit por arquivo. Pular SYNC = mentir sobre o estado real. Pular SHARE = trabalho órfão que some no idle de 20min.

Este projeto está vinculado ao repositório privado: `https://github.com/mitra-agent-projects/p-45654`

Sua branch de trabalho é: `user/20500`

A `main` é a baseline compartilhada entre todos os colaboradores.

> Se qualquer comando git falhar (ex: remote não configurado, branch inexistente), **ignore silenciosamente e continue o trabalho normalmente**. O sistema cuida do git como fallback — o importante é você entregar o código.

### Fluxo do turno (obrigatório)

```
1. SYNC     →  git fetch origin && git merge origin/main --no-edit   (puxar trabalho dos outros)
2. BACKEND  →  cd backend && (alterações se necessárias)
3. FRONTEND →  cd frontend && (desenvolvimento em src/)
4. BUILD    →  cd frontend && npm run build
5. SHARE    →  git add + commit + checkout main + merge user-branch + push origin main   (publicar pra equipe)
```

- **NUNCA pule SYNC. Vale para QUALQUER pedido — incluindo triviais como `"oi"`, `"qual a cor X?"`, `"explica Y"`.** SYNC é a primeira operação literal de todo turno: antes de ler arquivo, antes de pensar na resposta. **Após o merge, LEIA o diff** — outro usuário pode ter feito parte do pedido ou alterado contexto que muda sua abordagem. SYNC sem avaliar o que veio = SYNC pela metade.
- **NUNCA pule SHARE. Ao FIM do turno, 1 commit + 1 push pra TODAS as mudanças.** Mudou 1 byte ou 10 arquivos, é 1 SHARE só no fim — NÃO 1 commit por arquivo durante o trabalho. Sem push, sua mudança vive só nesse sandbox e some quando ele for descartado (idle de 20min).
- **Conflito de merge → SEMPRE `AskUserQuestion`** em linguagem de negócio (ex: "outro usuário deixou o fundo azul, você pediu verde — qual prefere?"). NUNCA resolva sozinho.

### [SYNC] Antes de começar qualquer alteração

```
git fetch origin 2>/dev/null && git merge origin/main --no-edit 2>/dev/null || true
```

Se houver conflito no merge, **SEMPRE use a tool `AskUserQuestion`** para perguntar ao usuário como quer proceder. Entenda o que cada lado do conflito fez e pergunte em **linguagem de negócio** (ex: "outro usuário mudou o fundo para azul, mas você pediu verde — qual prefere?"). NUNCA resolva conflitos de merge sozinho — o usuário decide, você executa.

### Durante o trabalho

- Commite a cada unidade lógica completada (não acumule tudo no final)
- Use mensagens descritivas em português: `feat: adiciona página de login com Google OAuth`
- Formato: `tipo: descrição` onde tipo é `feat`, `fix`, `refactor`, `style`, `chore`

### [SHARE] Depois de terminar TODAS as alterações do turno (sequência COMPLETA — todos os passos)

```
git add -A -- . ':(exclude)backend/migrations' ':(exclude)backend/migrations.yaml'
git commit -m "tipo: descrição clara do que foi feito"
git checkout main
git pull --no-rebase origin main
git merge user/20500 --no-edit
# ↑ SE conflito aqui: pare, AskUserQuestion (instruções abaixo), DEPOIS continue:
git push origin main                # ← ESTE comando é o que publica de verdade. Sem ele, SHARE NÃO aconteceu — mudança fica só no sandbox e some no idle
git checkout user/20500
git merge main --no-edit
```

**Tratamento de conflito** (se o `git merge user/20500` acima falhar):
1. Liste os arquivos com conflito: `git diff --name-only --diff-filter=U`
2. **SEMPRE use `AskUserQuestion`** — entenda o que cada lado fez e pergunte ao usuário em linguagem de negócio como quer proceder
3. Após a decisão do usuário: resolva conforme indicado, `git add .` e `git commit -m "merge: resolve conflitos do turno"`
4. Continue a sequência acima a partir de `git push origin main` — o SHARE só termina quando o push é executado.

### Checklist do turno

- [ ] **[SYNC] executado como PRIMEIRA operação do turno** (`git fetch && git merge origin/main`) — antes de ler arquivo, antes de qualquer resposta, mesmo para pedidos triviais
- [ ] Mudanças commitadas em unidades lógicas com mensagens descritivas
- [ ] **[SHARE] executado UMA vez ao fim do turno se houve qualquer mudança** (`git push origin main` retornou sucesso) — 1 commit + 1 push pra todas as mudanças, NÃO 1 por arquivo

### Regras importantes

- NUNCA use `git push --force`
- NUNCA delete branches remotas
- Se o `git push` falhar (non-fast-forward), faça `git pull --no-rebase origin main` e tente novamente
- NUNCA use `--rebase` — sempre merge, nunca rebase
- SEMPRE pergunte ao usuário via `AskUserQuestion` quando houver conflito de merge — nunca resolva sozinho
- O git é transparente para o usuário — ele não precisa saber dos detalhes. Apenas mencione se houver conflito que precise de decisão
