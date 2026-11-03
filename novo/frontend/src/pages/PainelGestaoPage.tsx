// Painel de Gestão (spec 010: RF-006..RF-008, RN-003..RN-007, C-001..C-003).
// Três blocos independentes: vendedores do filtro, cards e fila (RF-005).
// RF-009 (Gerar novos alertas) espera as SFs da spec 008.

import { useState } from 'react'
import { linha, linhas } from '@/lib/mitra-api'
import { fmtData, fmtDataHora, hojeBrasilia, moeda } from '@/lib/formato'
import { textoAtingimento, textoGap, textoMeta } from '@/lib/gestao'
import { BlocoFalhou } from '@/components/Confirmacao'
import { useBloco } from '@/components/use-bloco'
import {
  Dash, EmptyState, Field, InfoGrid, InfoTile, PageHeader, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SelectMenu, Stack, Status,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

const TODA_EQUIPE = '0'

export default function PainelGestaoPage() {
  const hoje = hojeBrasilia()
  const [vendedorId, setVendedorId] = useState(TODA_EQUIPE)
  const vendedores = useBloco(() => linhas('painelVendedores'), [])
  const resumo = useBloco(() => linha('painelResumo', { hoje, vendedorId: Number(vendedorId) }), [vendedorId])
  const fila = useBloco(() => linhas('painelFila', { hoje, vendedorId: Number(vendedorId) }), [vendedorId])

  const opcoes = [
    { value: TODA_EQUIPE, label: 'Toda a equipe' },
    ...(vendedores.dados ?? []).map(v => ({ value: String(v.ID), label: v.NOME, hint: `RCA ${v.COD_RCA}` })),
  ]
  const r = resumo.dados
  const liquido = Number(r?.LIQUIDO ?? 0)
  const meta = Number(r?.META ?? 0)
  const gap = textoGap(meta, liquido)

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Painel de Gestão"
        description={`Mês de ${fmtData(hoje).slice(3)}. Faturamento líquido atribuído pela carteira e pelo escopo de cada vendedor.`}
        meta={r?.ATUALIZADO_EM ? `Vendas atualizadas em ${fmtDataHora(String(r.ATUALIZADO_EM).replace(' ', 'T'))}` : undefined}
      />
      <Stack>
        <Panel>
          <Toolbar>
            <Field label="Vendedor" className="w-72">
              <SelectMenu label="Vendedor" value={vendedorId} options={opcoes} onChange={setVendedorId} disabled={vendedores.erro} />
            </Field>
          </Toolbar>
          {resumo.erro ? (
            <BlocoFalhou />
          ) : (
            <PanelBody>
              <InfoGrid>
                <InfoTile label="Faturamento líquido no mês">
                  {r ? moeda(liquido) : '…'}
                  {r && <RowMeta>Bruto {moeda(r.BRUTO)} · Devolução {moeda(r.DEVOLUCAO)}</RowMeta>}
                </InfoTile>
                <InfoTile label="Meta do mês">{r ? textoMeta(meta) : '…'}</InfoTile>
                <InfoTile label="Atingimento">
                  {r ? textoAtingimento(liquido, meta) : '…'}
                  {r && <RowMeta>Clientes ativos: {Number(r.CLIENTES_ATIVOS)}</RowMeta>}
                </InfoTile>
                <InfoTile label="Gap da meta">
                  {r ? gap || <Dash /> : '…'}
                  {r && <RowMeta>Visitas pendentes: {Number(r.VISITAS_PENDENTES)}</RowMeta>}
                </InfoTile>
                <InfoTile label="Vendas sem carteira">
                  {r ? moeda(r.SEM_CARTEIRA_LIQUIDO) : '…'}
                  {r && <RowMeta>{Number(r.SEM_CARTEIRA_CLIENTES)} cliente(s); fora do faturamento e do atingimento</RowMeta>}
                </InfoTile>
              </InfoGrid>
            </PanelBody>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Fila Operacional da Equipe" hint="Atrasados primeiro, depois tarefas pendentes. Até 60 itens." />
          {fila.erro ? (
            <BlocoFalhou />
          ) : fila.dados && fila.dados.length === 0 ? (
            <EmptyState title="Nenhum item operacional pendente para o filtro selecionado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Responsável</Th>
                  <Th>Data</Th>
                  <Th>Ação sugerida</Th>
                </tr>
              </thead>
              <tbody>
                {(fila.dados ?? []).map(i => (
                  <Tr key={`${i.TIPO}-${i.ID}`}>
                    <Td>
                      <RowTitle>{i.TITULO}</RowTitle>
                      <RowMeta>{[i.TIPO === 'TAREFA' ? 'Tarefa' : 'Visita', i.CLIENTE].filter(Boolean).join(' · ')}</RowMeta>
                    </Td>
                    <Td>{i.RESPONSAVEL}</Td>
                    <Td>{i.DATA ? fmtData(i.DATA) : <Dash />}</Td>
                    <Td>
                      <Status tone={Number(i.ATRASADO) ? 'alert' : 'live'}>{i.ACAO}</Status>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Stack>
    </>
  )
}

PainelGestaoPage.rota = '/painel-gestao'
