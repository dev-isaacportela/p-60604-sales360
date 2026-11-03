// Dashboard (spec 005): a primeira tela de todo usuário. Os blocos de agenda,
// meta semanal e atividades usam as SFs da 003 e da 004 (D-501), então os
// números são os mesmos das outras telas; o mês e o gráfico usam as SFs do
// Analytics (007) e a data da carga a da 006 (D-509). Cada bloco carrega e
// falha sozinho (RF-011); a carga faz 9 consultas e trocar a barra não consulta.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { linha, linhas } from '@/lib/mitra-api'
import { agoraBrasilia, hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { semanaDe } from '@/lib/agenda'
import { FILTROS_VAZIOS } from '@/lib/atividades'
import { compromissosDeHoje, diasDaEvolucao, entradaDiarias, entradaMes, fraseCompromissos, mesDe, saudacao } from '@/lib/dashboard'
import { AVISO_NAO_CONFIGURADO, mostrarAvisoNaoConfigurado } from '@/lib/sessao'
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, PageHeader, Stack, TextLink,
} from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { useSessao } from '@/components/sessao-contexto'
import { useBloco } from '@/components/use-bloco'
import { Alertas, ListaCompromissos, MetaMensal, MetaSemanal, ResumoSemana, UltimasAtividades, VendasDiarias } from './dashboard/blocos'

export default function DashboardPage() {
  const { sessao } = useSessao()
  const navegar = useNavigate()
  const hoje = hojeBrasilia()
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hoje), [filtro.escopo, hoje])
  const chave = JSON.stringify(escopo)
  const semana = semanaDe(hoje)
  const { inicio, fim } = mesDe(hoje)
  const [janela, setJanela] = useState(false)

  const agenda = useBloco(() => linhas('agendaListar', { ...escopo, de: semana.segunda, ate: semana.domingo }), [chave])
  const metaSemana = useBloco(() => Promise.all([
    linha('agendaResumo', { ...escopo, ...semana }),
    linha('metaVisitasObter', { segunda: semana.segunda }),
  ]), [chave])
  // A data da carga (RF-010) é só um texto: se falhar, o card aparece sem ela.
  const mes = useBloco(() => Promise.all([
    linha('analyticsResumo', entradaMes(escopo, hoje)),
    linha('semanalAtualizacao').catch(() => null),
  ]).then(([resumo, carga]) => ({ ...resumo, ATUALIZADO_EM: carga?.FIM_EM ?? null })), [chave])
  const diarias = useBloco(() => linhas('analyticsEvolucao', entradaDiarias(escopo, hoje)).then(diasDaEvolucao), [chave])
  const alertas = useBloco(() => linhas('dashboardAlertas', escopo), [chave])
  const atividades = useBloco(() => linhas('atividadesAbertas', { ...escopo, ...FILTROS_VAZIOS }), [chave])

  const deHoje = agenda.dados ? compromissosDeHoje(agenda.dados, hoje) : null
  const nomeVendedor = String((filtro.opcoes ?? []).find(o => String(o.VENDEDOR_ID) === escopo.vendedor)?.VENDEDOR ?? '').split(' ')[0]

  return (
    <Stack>
      <PageHeader
        module="Sales 360"
        title={saudacao(agoraBrasilia().slice(11, 16), sessao.nome, sessao.email)}
        description={agenda.erro ? (
          <span className="text-destructive">Não foi possível carregar os compromissos de hoje.</span>
        ) : deHoje ? (
          <TextLink onClick={() => setJanela(true)} className="text-[14px]">{fraseCompromissos(deHoje.length, escopo.modo, nomeVendedor)}</TextLink>
        ) : 'Carregando compromissos…'}
        actions={<FiltroEscopo {...filtro} />}
      />
      {mostrarAvisoNaoConfigurado(sessao) ? <Alert tone="warn">{AVISO_NAO_CONFIGURADO}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaSemanal estado={metaSemana} modo={escopo.modo} segunda={semana.segunda} sexta={semana.sexta} hoje={hoje} />
        <MetaMensal estado={mes} inicio={inicio} fim={fim} hoje={hoje} />
      </div>
      <VendasDiarias estado={diarias} mes={mes.dados} hoje={hoje} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Alertas estado={alertas} />
        <UltimasAtividades estado={atividades} hoje={hoje} />
      </div>
      <ResumoSemana estado={agenda} hoje={hoje} />

      <Dialog open={janela} onOpenChange={setJanela}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Compromissos de hoje</DialogTitle></DialogHeader>
          <DialogBody><ListaCompromissos itens={deHoje ?? []} /></DialogBody>
          <DialogFooter>
            <Button variant="primary" onClick={() => navegar(`/agenda?modo=DIA&data=${hoje}`)}>Abrir agenda completa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}

DashboardPage.rota = '/'
