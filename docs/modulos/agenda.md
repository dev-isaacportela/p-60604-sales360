# Módulo: Agenda e Visitas

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md)

## Objetivo

Planejamento e execução das visitas do vendedor (dia/semana/mês), compromissos internos com participantes e sincronização com o Google Agenda.

## Rotas e páginas

| Rota | Página | Observação |
|---|---|---|
| `/agenda` | [AgendaPage.tsx](../../frontend/src/pages/AgendaPage.tsx) | Página principal (~3.100 linhas) |
| `/agenda-coordenador` | [AgendaCoordenadorPage.tsx](../../frontend/src/pages/AgendaCoordenadorPage.tsx) | Wrapper: valida `painelCoordenadorPermissao` e renderiza a AgendaPage em modo somente-leitura para ver a agenda dos vendedores |

## Funcionalidades

- Visões dia/semana/mês; criar, editar, reagendar e cancelar visita; excluir com segurança.
- **Check-in/check-out** na visita e relato em rich text ([RichTextEditor](../../frontend/src/components/ui/RichTextEditor.tsx), com upload de imagem via SDK).
- Detecção de **conflito de horário** antes de agendar (`agendaVerificarConflitoVisita`).
- **Compromissos internos** (`AGENDA_INTERNA`) com convite de participantes.
- Visitas a **prospects** integradas na agenda (ver [alertas-prospeccao.md](alertas-prospeccao.md)).
- Sync com **Google Agenda** por usuário — conexão em 1 clique via OAuth em [Configurações](../../frontend/src/pages/ConfiguracoesUsuarioPage.tsx) (ver fluxo abaixo).

## Server Functions

- Visitas: `listarVisitasPeriodo` (5), `agendaListarVisitasPaginado` (42), `agendaContarVisitasPaginado` (43), `agendaCriarVisita` (44), `agendaAtualizarVisita` (45), `agendaCancelarVisitaSeguro` (46), `agendaExcluirVisita` (47), `checkinVisita` (13), `checkoutVisita` (14), `cancelarVisita` (21), `agendaVerificarConflitoVisita` (139).
- Compromissos internos: `agendaCriarCompromissoInterno` (231), `agendaAdicionarParticipanteInterno` (232), `agendaListarVendedoresConvite` (233), `agendaAtualizarCompromissoInterno` (285), `agendaCancelarCompromissoInterno` (286).
- Google Agenda: `googleAgendaStatus` (209), `googleAgendaSalvarConfig` (210, legado — entrada manual de credencial), `googleAgendaDesconectar` (211), `googleAgendaSincronizarItem` (212).
- Google OAuth (conexão em 1 clique): `googleOAuthAppConfig` (364), `googleAgendaTrocarCodigo` (365), `googleAgendaConfirmarConexao` (366), `googleOAuthDescartarPendente` (367), `googleAgendaAtualizarCalendario` (368, substituída pela 371), `googleAgendaAbrirTicket` (369), `googleAgendaListarCalendarios` (370), `googleAgendaTrocarCalendario` (371).

## Fluxo OAuth do Google Agenda

Uma credencial OAuth da empresa (`GOOGLE_OAUTH_APP`, gravada só pelo backend) + uma autorização por usuário. O Client Secret nunca chega ao navegador.

1. **Configurações** carrega `googleOAuthAppConfig` (só Client ID e redirect URI — o secret não é selecionado) e monta a URL de consentimento com `access_type=offline`, `prompt=consent` e um `state` aleatório de 64 caracteres guardado no `sessionStorage`.
2. O Google redireciona de volta para `/configuracoes?code=...&state=...`.
3. `googleAgendaTrocarCodigo` (JS) troca o código pelo refresh token via a integração `google-oauth-token` e grava em `GOOGLE_OAUTH_PENDENTE`, indexado pelo `state`.
4. `googleAgendaConfirmarConexao` (SQL) move a pendência para `GOOGLE_AGENDA_CONFIG` usando `:VAR_USER` — **é aqui que o vínculo com o usuário acontece**, pela sessão, nunca por parâmetro do frontend. SFs JAVASCRIPT não têm acesso a `:VAR_USER`, daí a divisão em duas etapas.
5. `googleOAuthDescartarPendente` limpa o `state` usado e as pendências com mais de 10 minutos (janela também validada no WHERE do passo 4).

A partir daí `googleAgendaSincronizarItem` (212) segue igual: cria a integração por usuário na primeira sincronização e renova o access token sozinho.

### Cobertura por tipo de agenda

| Tipo | Entidade na SF 212 | Tabela | Quem recebe o evento |
|---|---|---|---|
| Visita a cliente | `VISITA` | `VISITAS` | `VENDEDOR_ID` |
| Atividade com prazo | `TAREFA` | `TAREFAS` | `VENDEDOR_ID` |
| Prospecção | `PROSPECCAO` | `PROSPECT_VISITAS` | `EXECUTIVO_ID` |
| Reunião interna e Deslocamento | `INTERNA` | `AGENDA_INTERNA` (`TIPO='Deslocamento'` diferencia) | criador **e** cada participante |

Quais dessas origens somam na meta semanal (e por que deslocamento nunca aparece como realizado): [Meta semanal de visitas](../regras-de-negocio.md#meta-semanal-de-visitas).

Na agenda, prospecção entra na lista unificada com **ID negativo** (o real fica em `PROSPECT_VISITA_ID`); por isso o disparo passa por `syncGoogleAgendaVisita`, que resolve entidade e ID a partir de `ORIGEM`. Compromisso interno só sincroniza **depois** de inserir os participantes — senão os convidados não recebem o evento. Quem é removido da lista de participantes tem o evento apagado da própria agenda (`removerDesvinculados`).

Disparos (sempre pelo dono do item): criar/editar/cancelar visita, prospecção e compromisso interno em [AgendaPage.tsx](../../frontend/src/pages/AgendaPage.tsx), e criar/editar atividade em [TarefasPage.tsx](../../frontend/src/pages/TarefasPage.tsx). O vínculo item ↔ evento fica em `GOOGLE_AGENDA_EVENTOS`, então reeditar faz `PATCH` no mesmo evento em vez de duplicar.

### Seleção da agenda de destino

O usuário escolhe em qual das suas agendas do Google os eventos são criados. A lista vem de `GET /users/me/calendarList`, que exige o escopo `calendar.calendarlist.readonly` além de `calendar.events` — quem conectou antes dessa mudança precisa reconectar (a tela cai para campo manual e avisa).

> **SF JS consumida por tela devolve `rows`.** A camada de dados do frontend ([useMitra.ts](../../frontend/src/hooks/useMitra.ts), `extractRowsFromOutput`) só reconhece `rows`, `result` ou `body.result.rows`. Uma SF JAVASCRIPT que devolva a lista em outra chave chega na tela como array vazio, **sem erro** — o sintoma é a tela dizer "não consegui listar" enquanto a SF responde certo no servidor.

> **`primary` é apelido, não id.** O Google lista a agenda principal com o id real (o e-mail da conta), mas aceita `primary` como alias, e é assim que ela fica gravada em `CALENDAR_ID`. O seletor mapeia a principal para o valor `primary`; sem isso a opção não casaria com o valor salvo e "Salvar agenda" seria interpretado como troca de agenda, apagando e recriando todos os eventos sem necessidade.

Trocar de agenda **não é só um UPDATE**: os eventos já criados vivem na agenda anterior e um `PATCH` no destino novo com aquele ID devolve 404. Por isso `googleAgendaTrocarCalendario` (371) remove os eventos da agenda antiga (limite de 200 por execução), zera `GOOGLE_AGENDA_EVENTOS` do usuário e só então troca o `CALENDAR_ID`.

### Ticket de identidade

SFs JAVASCRIPT não enxergam `:VAR_USER`, e receber o ID do usuário por parâmetro deixaria qualquer um operar a conta de outro. Onde uma SF JS precisa saber quem é o usuário (listar calendários, trocar de agenda), o frontend abre antes um **ticket de uso único** por `googleAgendaAbrirTicket` (SQL, resolve `:VAR_USER` no servidor) e passa só o ticket — válido por 5 minutos, destruído ao ser resgatado (`GOOGLE_AGENDA_TICKET`).

> **Formato de data:** `CRIADO_EM` é `VARCHAR(19)` e o projeto grava em dois formatos — `YYYY-MM-DD HH:MM:SS` pelo SQL e `YYYY-MM-DDTHH:MM:SS` pelo JS. Na comparação textual o espaço vem antes do `T`, então toda janela de expiração normaliza com `REPLACE(CRIADO_EM, 'T', ' ')`. Sem isso o ticket nasce vencido.

## Tabelas

`VISITAS` (com `PLANEJAMENTO`, `RELATO`, `CHECKIN/CHECKOUT_HORA`), `AGENDA_INTERNA` + `AGENDA_INTERNA_PARTICIPANTES`, `PROSPECT_VISITAS`, `GOOGLE_AGENDA_CONFIG`/`_EVENTOS`/`_LOGS`, `GOOGLE_OAUTH_APP`, `GOOGLE_OAUTH_PENDENTE`, `GOOGLE_AGENDA_TICKET`, `CLIENTES`.

## Regras

- Escopo de visualização do coordenador: [regras-de-negocio.md](../regras-de-negocio.md#escopo-de-visualização).
- Secrets do Google OAuth em texto puro na config — ver [pendências](../pendencias.md).
