// Grade da Agenda (RF-001/002): Dia em lista, Semana em sete colunas (no
// celular, um dia por vez) e Mês em calendário. Cada compromisso mostra a cor
// do status; quem não opera vê `Somente visualização` (RN-012).

import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  DIAS_SEMANA, acaoPrincipal, corStatus, ddmm, mesEmSemanas, rotuloDia, rotuloOrigem, rotuloStatus, semanaDe, somarDias,
  somenteVisualizacao,
} from '@/lib/agenda'
import type { Acao, Modo } from '@/lib/agenda'
import { Button, EmptyState, IconButton } from '@/components/page'
import { SoCelular, SoDesktop } from '../clientes/layout'
import {
  AbaDia, AbasDias, Bloco, CelulaMes, ColunaDia, ColunaHora, Discreto, EntradaMes, FaixaStatus, GradeMes, GradeSemana,
  LinhaItem, Miolo, NomeLink, UmaLinha,
} from './layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export interface Eventos {
  detalhe: (item: Linha) => void
  agir: (acao: Acao, item: Linha) => void
  historico: (clienteId: number) => void
}

const hora = (item: Linha) => `${item.HORA_INICIO ?? ''}–${item.HORA_FIM ?? ''}`

function legenda(item: Linha) {
  const partes = [rotuloStatus(item.STATUS), rotuloOrigem(item)]
  if (item.ORIGEM !== 'INTERNA' && item.TIPO) partes.push(item.TIPO)
  if (Number(item.EH_DONO) !== 1) partes.push(item.DONO)
  if (somenteVisualizacao(item)) partes.push('Somente visualização')
  return partes.join(' · ')
}

function Item({ item, ev }: { item: Linha; ev: Eventos }) {
  const principal = acaoPrincipal(item)
  return (
    <LinhaItem>
      <FaixaStatus cor={corStatus(item.STATUS)} />
      <ColunaHora>{hora(item)}</ColunaHora>
      <Miolo>
        <UmaLinha>
          <NomeLink onClick={item.ORIGEM === 'VISITA' && item.CLIENTE_ID ? () => ev.historico(Number(item.CLIENTE_ID)) : undefined}>
            {item.TITULO}
          </NomeLink>
        </UmaLinha>
        <Discreto>{legenda(item)}</Discreto>
      </Miolo>
      {principal ? <Button size="sm" onClick={() => ev.agir(principal.acao, item)}>{principal.rotulo}</Button> : null}
      <IconButton label="Detalhes e ações" onClick={() => ev.detalhe(item)}><MoreHorizontal aria-hidden /></IconButton>
    </LinhaItem>
  )
}

function ListaDia({ itens, ev }: { itens: Linha[]; ev: Eventos }) {
  if (!itens.length) return <EmptyState title="Nenhum compromisso neste dia." hint="Use + Nova agenda para planejar." />
  return <div>{itens.map(i => <Item key={`${i.ORIGEM}-${i.ID}`} item={i} ev={ev} />)}</div>
}

const doDia = (itens: Linha[], dia: string) => itens.filter(i => i.DATA === dia)

function Semana({ itens, data, hoje, ev }: { itens: Linha[]; data: string; hoje: string; ev: Eventos }) {
  const dias = Array.from({ length: 7 }, (_, n) => somarDias(semanaDe(data).segunda, n))
  const [aberto, setAberto] = useState(dias.includes(hoje) ? hoje : dias.includes(data) ? data : dias[0])
  const diaCelular = dias.includes(aberto) ? aberto : dias[0]
  return (
    <>
      <SoDesktop>
        <GradeSemana>
          {dias.map(dia => (
            <ColunaDia key={dia} titulo={rotuloDia(dia)} hoje={dia === hoje}>
              {doDia(itens, dia).map(i => (
                <Bloco
                  key={`${i.ORIGEM}-${i.ID}`}
                  cor={corStatus(i.STATUS)}
                  hora={i.HORA_INICIO}
                  titulo={i.TITULO}
                  extra={Number(i.EH_DONO) !== 1 ? i.DONO : undefined}
                  onClick={() => ev.detalhe(i)}
                  rotulo={`${hora(i)} ${i.TITULO}, ${rotuloStatus(i.STATUS)}`}
                />
              ))}
            </ColunaDia>
          ))}
        </GradeSemana>
      </SoDesktop>
      <SoCelular>
        <AbasDias>
          {dias.map(dia => (
            <AbaDia key={dia} ativo={dia === diaCelular} onClick={() => setAberto(dia)}>
              {rotuloDia(dia)}{doDia(itens, dia).length ? ` (${doDia(itens, dia).length})` : ''}
            </AbaDia>
          ))}
        </AbasDias>
        <ListaDia itens={doDia(itens, diaCelular)} ev={ev} />
      </SoCelular>
    </>
  )
}

const MAX_NO_DIA = 3

function Mes({ itens, data, hoje, abrirDia }: { itens: Linha[]; data: string; hoje: string; abrirDia: (dia: string) => void }) {
  const mes = data.slice(0, 7)
  return (
    <GradeMes cabecalho={DIAS_SEMANA}>
      {mesEmSemanas(data).flat().map(dia => {
        const lista = doDia(itens, dia)
        return (
          <CelulaMes key={dia} dia={dia.slice(8, 10)} foraDoMes={dia.slice(0, 7) !== mes} hoje={dia === hoje} onClick={() => abrirDia(dia)}>
            {lista.slice(0, MAX_NO_DIA).map(i => (
              <EntradaMes key={`${i.ORIGEM}-${i.ID}`} cor={corStatus(i.STATUS)}>{i.HORA_INICIO} {i.TITULO}</EntradaMes>
            ))}
            {lista.length > MAX_NO_DIA ? <EntradaMes cor="bg-transparent">+{lista.length - MAX_NO_DIA} em {ddmm(dia)}</EntradaMes> : null}
          </CelulaMes>
        )
      })}
    </GradeMes>
  )
}

export function Grade({ modo, itens, data, hoje, ev, abrirDia }: {
  modo: Modo
  itens: Linha[]
  data: string
  hoje: string
  ev: Eventos
  abrirDia: (dia: string) => void
}) {
  if (modo === 'DIA') return <ListaDia itens={doDia(itens, data)} ev={ev} />
  if (modo === 'SEMANA') return <Semana key={semanaDe(data).segunda} itens={itens} data={data} hoje={hoje} ev={ev} />
  return <Mes itens={itens} data={data} hoje={hoje} abrirDia={abrirDia} />
}
