# Comercial Externo 360 — Frontend

SPA React do CRM de força de vendas da Benenutri, sobre a plataforma Mitra.

**Documentação completa do projeto: [`../docs/`](../docs/README.md)** — arquitetura, banco de dados, server functions, regras de negócio e specs por módulo.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # tsc -b && vite build — sempre rodar daqui, nunca da raiz
npm run test     # Vitest
npm run lint
```

Env: `VITE_MITRA_AUTH_URL` e `VITE_MITRA_PROJECT_ID` (auto-populadas pelo servidor — ver [.env.example](.env.example)).

## Mapa rápido

- Rotas: [src/App.tsx](src/App.tsx) · Páginas: `src/pages/` (32 componentes, 30 com rota)
- Camada de dados (mapa `SF` + wrappers): [src/hooks/useMitra.ts](src/hooks/useMitra.ts)
- Autenticação/sessão: [src/lib/mitra-auth.ts](src/lib/mitra-auth.ts)
- Tokens de tema: [src/index.css](src/index.css) (camada única em `:root`)

Detalhes em [docs/arquitetura.md](../docs/arquitetura.md).
