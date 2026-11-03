// Grade da Agenda (RF-001/002): Dia em linha do tempo (com a linha de agora
// no dia de hoje), Semana em sete colunas (no celular, um dia por vez) e Mês em
// calendário. Cada compromisso mostra a cor do status; quem não opera vê
// `Somente visualização` (RN-012).

import { useState } from 'react'
import { Building2, Car, Eye, MoreHorizontal, Tag, Target, User, Users } from 'lucide-react'
import {
  DIAS_SEMANA, acaoPrincipal, corStatus, ddmm, duracao, ehDeslocamento, mesEmSemanas, posicaoAgora, rotuloDia, rotuloOrigem, rotuloStatus,
  semanaDe, somarDias, somenteVisualizacao, turno,
} from '@/lib/agenda'
import { agoraBrasilia } from '@/lib/formato'
import type { Acao, Modo } from '@/lib/agenda'
import { Button, EmptyState, IconButton } from '@/components/page'
import { SoCelular, SoDesktop } from '../clientes/layout'
import {
  AbaDia, AbasDias, Bloco, CelulaMes, ColunaDia, Detalhe, EntradaMes, GradeMes, GradeSemana, ItemDia, LinhaAgora, NomeLink, Ponto,
} from './layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export interface Eventos {
  detalhe: (item: Linha) => void
  agir: (acao: Acao, item: Linha) => void
  historico: (clienteId: number) => void
}

const hora = (item: Linha) => `${item.HORA_INICIO ?? ''}–${item.HORA_FIM ?? ''}`

const iconeOrigem = (item: Linha) =>
  item.ORIGEM === 'VISITA' ? Building2 : item.ORIGEM === 'PROSPECCAO' ? Target : ehDeslocamento(item) ? Car : Users

function Item({ item, ev }: { item: Linha; ev: Eventos }) {
  const principal = acaoPrincipal(item)
  const inicio = item.HORA_INICIO ?? ''
  const tempo = duracao(inicio, item.HORA_FIM ?? '')
  return (
    <ItemDia
      turno={turno(inicio)}
      inicio={inicio}
      duracao={tempo}
      cancelado={item.STATUS === 'CANCELADA'}
      titulo={
        <NomeLink onClick={item.ORIGEM === 'VISITA' && item.CLIENTE_ID ? () => ev.historico(Number(item.CLIENTE_ID)) : undefined}>
          {item.TITULO}
        </NomeLink>
      }
      detalhes={
        <>
          <Detalhe icone={iconeOrigem(item)}>{rotuloOrigem(item)} · {inicio}–{item.HORA_FIM ?? ''}</Detalhe>
          {item.ORIGEM !== 'INTERNA' && item.TIPO ? <Detalhe icone={Tag}>{item.TIPO}</Detalhe> : null}
          {Number(item.EH_DONO) !== 1 ? <Detalhe icone={User}>{item.DONO}</Detalhe> : null}
        </>
      }
      status={<span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink"><Ponto cor={corStatus(item.STATUS)} />{rotuloStatus(item.STATUS)}</span>}
      acoes={
        <>
          {somenteVisualizacao(item) ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-ink-secondary"><Eye aria-hidden className="size-3" />Somente visualização</span>
          ) : null}
          {principal ? <Button size="sm" onClick={() => ev.agir(principal.acao, item)}>{principal.rotulo}</Button> : null}
          <IconButton label="Detalhes e ações" onClick={() => ev.detalhe(item)}><MoreHorizontal aria-hidden /></IconButton>
        </>
      }
    />
  )
}

function ListaDia({ itens, ev, ehHoje }: { itens: Linha[]; ev: Eventos; ehHoje: boolean }) {
  if (!itens.length) return <EmptyState title="Nenhum compromisso neste dia." hint="Use + Nova agenda para planejar." />
  const agora = agoraBrasilia().slice(11, 16)
  const pos = ehHoje ? posicaoAgora(itens, agora) : null
  const linhas = itens.map(i => <Item key={`${i.ORIGEM}-${i.ID}`} item={i} ev={ev} />)
  if (pos !== null) linhas.splice(pos === -1 ? linhas.length : pos, 0, <LinhaAgora key="agora" hora={agora} />)
  // Mesma altura fixa da Semana, com rolagem interna.
  return <div className="h-[560px] overflow-y-auto">{linhas}</div>
}

const doDia = (itens: Linha[], dia: string) => itens.filter(i => i.DATA === dia)

function Semana({ itens, data, hoje, ev }: { itens: Linha[]; data: string; hoje: string; ev: Eventos }) {
  // Sábado e domingo só aparecem quando têm algo marcado.
  const dias = Array.from({ length: 7 }, (_, n) => somarDias(semanaDe(data).segunda, n))
    .filter((dia, n) => n < 5 || doDia(itens, dia).length > 0)
  const [aberto, setAberto] = useState(dias.includes(hoje) ? hoje : dias.includes(data) ? data : dias[0])
  const diaCelular = dias.includes(aberto) ? aberto : dias[0]
  return (
    <>
      <SoDesktop>
        <GradeSemana colunas={dias.length}>
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
        <ListaDia itens={doDia(itens, diaCelular)} ev={ev} ehHoje={diaCelular === hoje} />
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
  if (modo === 'DIA') return <ListaDia itens={doDia(itens, data)} ev={ev} ehHoje={data === hoje} />
  if (modo === 'SEMANA') return <Semana key={semanaDe(data).segunda} itens={itens} data={data} hoje={hoje} ev={ev} />
  return <Mes itens={itens} data={data} hoje={hoje} abrirDia={abrirDia} />
}
