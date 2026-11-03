// Placeholder das rotas do menu que ainda não têm spec construída. Mostra o
// que a 001 já decide para elas: aviso de usuário sem configuração no
// Dashboard (RN-017), modo inicial da Agenda (C-001) e exibição inicial de
// Atividades, trocável na tela sem mudar a preferência (C-010).

import { useState } from 'react'
import { tituloDaRota } from '@/lib/menu'
import { AVISO_NAO_CONFIGURADO, mostrarAvisoNaoConfigurado } from '@/lib/sessao'
import { Actions, Alert, Button, EmptyState, PageHeader, Panel, PanelBody, Stack } from '@/components/page'
import { useSessao } from '@/components/sessao-contexto'

const MODO_AGENDA = { DIA: 'Dia', SEMANA: 'Semana', MES: 'Mês' }
const EM_CONSTRUCAO = 'Esta tela está em construção e chega numa próxima etapa do sistema novo.'

function ExibicaoAtividades({ inicial }: { inicial: 'LISTA' | 'KANBAN' }) {
  const [exibicao, setExibicao] = useState(inicial)
  return (
    <Actions>
      <Button variant={exibicao === 'LISTA' ? 'primary' : 'secondary'} onClick={() => setExibicao('LISTA')} aria-pressed={exibicao === 'LISTA'}>
        Lista
      </Button>
      <Button variant={exibicao === 'KANBAN' ? 'primary' : 'secondary'} onClick={() => setExibicao('KANBAN')} aria-pressed={exibicao === 'KANBAN'}>
        Kanban
      </Button>
    </Actions>
  )
}

export function EmConstrucao({ caminho }: { caminho: string }) {
  const { sessao } = useSessao()
  const naoConfigurado = caminho === '/' && mostrarAvisoNaoConfigurado(sessao)

  return (
    <>
      <PageHeader module="Sales 360" title={tituloDaRota(caminho)} description={caminho === '/' ? `Olá, ${sessao.nome}` : undefined} />
      <Stack>
        {naoConfigurado && <Alert tone="warn">{AVISO_NAO_CONFIGURADO}</Alert>}
        <Panel>
          {caminho === '/agenda' || caminho === '/tarefas' ? (
            <PanelBody>
              <p>{EM_CONSTRUCAO}</p>
              {caminho === '/agenda' && <p>Abre no modo: {MODO_AGENDA[sessao.modoAgenda]}</p>}
              {caminho === '/tarefas' && <ExibicaoAtividades inicial={sessao.exibicaoAtividades} />}
            </PanelBody>
          ) : (
            <EmptyState title="Em construção" hint={EM_CONSTRUCAO} />
          )}
        </Panel>
      </Stack>
    </>
  )
}
