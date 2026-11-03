# Módulo: Gestão, Coordenação e Diretoria

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md) · [Regras](../regras-de-negocio.md#papéis-e-permissões)

## Objetivo

Camadas acima do vendedor: painéis de acompanhamento (coordenador e diretoria), definição de metas, faturamento consolidado, e a governança de cadastros que sustenta o escopo (RCA, BU, filial/seção, coordenadores, papéis, férias, carteira).

## Rotas e páginas

### Painéis

| Rota | Página | O que faz |
|---|---|---|
| `/painel-gestao` | [PainelGestaoPage.tsx](../../frontend/src/pages/PainelGestaoPage.tsx) | Realizado vs. meta, gap, clientes ativos, pendências e fila operacional por vendedor; dispara popular/processar [alertas](alertas-prospeccao.md) |
| `/analise-diretoria` | [AnaliseDiretoriaPage.tsx](../../frontend/src/pages/AnaliseDiretoriaPage.tsx) | Executivo: meta vs. líquido vs. devolução por BU e coordenador, tendência, riscos, drill por BU |
| `/faturamento` | [FaturamentoDiretoriaPage.tsx](../../frontend/src/pages/FaturamentoDiretoriaPage.tsx) | Faturamento consolidado com filtros e quebras por coordenador/vendedor/produto/cliente/filial + detalhe |
| `/painel-validacao` | [PainelValidacaoPage.tsx](../../frontend/src/pages/PainelValidacaoPage.tsx) | Conferência faturamento vs. devoluções (grids Handsontable, detalhe por nota, export). Carregada com `lazy()`. Restrita por e-mail hardcoded ([pendências](../pendencias.md)) |

### Metas e cadastros

| Rota | Página | O que faz |
|---|---|---|
| `/gestao-metas` | [GestaoMetasDiretoriaPage.tsx](../../frontend/src/pages/GestaoMetasDiretoriaPage.tsx) | Diretoria define meta mensal por BU (filial+depto), compara com realizado líquido, histórico de alterações |
| `/gestao-cadastros` | [GestaoCadastrosPage.tsx](../../frontend/src/pages/GestaoCadastrosPage.tsx) | CRUD de Metas e Comissões por vendedor/mês/ano |
| `/gestao-bus-vendedores` | [GestaoBuVendedoresPage.tsx](../../frontend/src/pages/GestaoBuVendedoresPage.tsx) | CRUD de BUs, vínculo BU↔vendedor (filial/seção) e RCA↔departamento |
| `/configuracao-escopo-usuarios` | [ConfiguracaoEscopoUsuariosPage.tsx](../../frontend/src/pages/ConfiguracaoEscopoUsuariosPage.tsx) | Recorte enxuto: escopo (BU+filial+seção) por usuário |

### Governança de pessoas

| Rota | Página | O que faz |
|---|---|---|
| `/governanca-rca` | [GovernancaRcaPage.tsx](../../frontend/src/pages/GovernancaRcaPage.tsx) | Vincula usuário ↔ COD_RCA/supervisor do TOTVS, com auditoria das mudanças |
| `/gestao-coordenadores` | [GestaoCoordenadoresPage.tsx](../../frontend/src/pages/GestaoCoordenadoresPage.tsx) | CRUD de coordenadores e vínculo coordenador↔BUs |
| `/gestao-cargos-usuarios` | [GestaoCargosUsuariosPage.tsx](../../frontend/src/pages/GestaoCargosUsuariosPage.tsx) | Atribui papéis DIRETORIA/COORDENADOR/VENDEDOR; resumo por papel |
| `/gestao-carteira` | [GestaoCarteiraCoordenadorPage.tsx](../../frontend/src/pages/GestaoCarteiraCoordenadorPage.tsx) | Coordenador transfere clientes entre vendedores (individual ou carteira inteira) e adiciona disponíveis |
| `/ferias-vendedor` | [FeriasVendedorPage.tsx](../../frontend/src/pages/FeriasVendedorPage.tsx) | Cadastra/encerra férias de RCA com substituto |

## Server Functions (principais grupos)

- Painel gestão: `painelGestaoPermissao` (29), `painelGestaoVendedores` (30), `painelGestaoResumo` (31), `painelGestaoOperacional` (32).
- Painel coordenador: `painelCoordenador*` (153–156, 189–197, 213) — KPIs, performance, anomalias, riscos, gaps, concentração, metas BU recebidas/por vendedor, `painelCoordenadorSalvarMetaVendedorRamoUf` (296).
- Diretoria: `analiseDiretoria*` (198–203), `faturamentoDiretoria*` (240–247), `gestaoMetasDiretoria*` (167–171).
- Governança: `*VendedorRca*` (33–37, 63), `adminBu*`/`adminVincular*` (94–102), `vincularRcaDepartamento` (112–114), `gestaoCoordenadores*` (172–180), `gestaoCargosUsuarios*` (204–207), `ferias*` (164–166), `gestaoCarteiraCoordenador*` (158–163, 248–250), `adminListarVendedores` (145).
- Cadastros admin: `adminListar/Criar/Atualizar/Excluir*` produtos/metas/comissões (68–83).
- Validação: `validacao*` (147–151).
- Integração billing: `syncIntegrationBillingTargets` (288), `list/getIntegrationBilling*` (289–292), `sincronizarClientesUfRamoTotvs` (294).

## Tabelas

`METAS_BU`, `METAS_BU_VENDEDOR`, `METAS_BU_VENDEDOR_RAMO_UF`, `METAS`, `COMISSOES`, `BU`, `BU_VENDEDOR`, `FILIAL`, `SECAO`, `COORDENADORES`(+`_BU`), `USUARIO_CARGO`, `RCA_TOTVS`, `RCA_DEPARTAMENTO`, `VENDEDOR_RCA`(+`_AUDITORIA`), `FERIAS_VENDEDOR`, `EQUIPE_CLIENTE`, `PEDIDOS_SEMANAIS_SYNC`, `INTG_*`, `FUNCIONARIOS`.

## Regras

- Permissões por SF e papéis: [regras-de-negocio.md](../regras-de-negocio.md#papéis-e-permissões) e [server-functions.md](../server-functions.md#sfs-de-permissão-gate-de-telas). Matriz de origem: [matriz-crud-permissoes.md](../legado/matriz-crud-permissoes.md).
- 5 destas páginas chamam o SDK direto, fora dos wrappers — [pendências](../pendencias.md).
