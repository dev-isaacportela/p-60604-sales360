// Direcionamento Estratégico Semanal (spec 008, RF-018…020): três abas sobre
// a mesma semana (segunda a sexta) e o mesmo escopo; cada aba carrega só
// quando aberta. Rota só para coordenação e diretoria (menu.ts); o servidor
// confere de novo (RN-025).

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { navegarSemana, rotuloSemana, segundaDe } from '@/lib/direcionamento'
import { Actions, Button, IconButton, PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { ControleAgenda, ClientesCriticos, SemVisitacao } from './direcionamento/abas'

const ABAS = [
  { id: 'agenda', rotulo: 'Controle de Agenda e Visitas' },
  { id: 'criticos', rotulo: 'Clientes Críticos sem Compra' },
  { id: 'semvisita', rotulo: 'Carteira sem Visitação' },
]

export default function DirecionamentoPage() {
  const hoje = hojeBrasilia()
  const atual = segundaDe(hoje)
  const [semana, setSemana] = useState(atual)
  const [aba, setAba] = useState('agenda')
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hoje), [filtro.escopo, hoje])

  return (
    <Stack>
      <PageHeader
        module="Direcionamento"
        title="Direcionamento Estratégico Semanal"
        description="Execução da agenda, clientes importantes sem compra e carteira sem visita, por executivo."
        actions={<Actions><FiltroEscopo {...filtro} /></Actions>}
      />
      {aba !== 'semvisita' ? (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Semana anterior" onClick={() => setSemana(s => navegarSemana(s, -1))}><ChevronLeft aria-hidden /></IconButton>
          <span className="min-w-40 text-center font-title text-[15px] font-bold text-ink">Semana {rotuloSemana(semana)}</span>
          <IconButton label="Próxima semana" onClick={() => setSemana(s => navegarSemana(s, 1))}><ChevronRight aria-hidden /></IconButton>
          {semana !== atual ? <Button size="sm" onClick={() => setSemana(atual)}>Semana atual</Button> : null}
        </div>
      ) : null}
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {ABAS.map(a => <TabsTrigger key={a.id} value={a.id} className="flex-none">{a.rotulo}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="agenda">{aba === 'agenda' ? <ControleAgenda escopo={escopo} semana={semana} /> : null}</TabsContent>
        <TabsContent value="criticos">{aba === 'criticos' ? <ClientesCriticos escopo={escopo} semana={semana} /> : null}</TabsContent>
        <TabsContent value="semvisita">{aba === 'semvisita' ? <SemVisitacao escopo={escopo} /> : null}</TabsContent>
      </Tabs>
    </Stack>
  )
}

DirecionamentoPage.rota = '/direcionamento-semanal'
