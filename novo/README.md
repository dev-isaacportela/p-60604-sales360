# Comercial Externo 360 — sistema novo

Reconstrução do zero do Sales 360 (`frontend/` e `backend/` na raiz são o
sistema antigo, que continua no ar e **não é tocado**). Os dois convivem lado a
lado sobre o **mesmo banco** do projeto Mitra p-60604 até a troca (decisão A4).

- Contrato: `docs/specs/` (000 = visão geral e modelo de dados; uma spec por módulo).
- `novo/backend/` — SFs `s360*` em `add-NNN-*.mjs`, simulador SQLite em `simulator/`.
- `novo/frontend/` — React 19 + Vite + Tailwind 4, design system Benenutri.

## Rodar local (sem Mitra)

```
cd novo/backend && npm install && npm run sim:seed && npm run sim     # simulador :3105
cd novo/frontend && npm install && npm run dev                          # app :5175
```

Login no simulador: qualquer e-mail de `simulator/seed.mjs`, senha `mitra123`.

## Testes

```
cd novo/backend && npm test        # check (SQL roda?) + smoke (cenários da spec)
cd novo/frontend && npm test && npm run build
```

## Publicar (só no sandbox do Mitra)

Nada do `mitra-sdk` roda desta máquina. No sandbox, por spec:

```
cd novo/backend && node add-001-acesso.mjs && node add-000-perfil-acesso.mjs && npm run sync:function-map
```

`schema-producao.mjs` **não** é publicado: descreve as tabelas que já existem,
para o simulador.
