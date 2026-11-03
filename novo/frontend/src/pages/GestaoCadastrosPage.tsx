// Gestão Cadastros — comissões (spec 010: RF-020, RN-011, C-010).
// A comissão é calculada (vendas × % ÷ 100) e não digitada; o servidor grava
// o mesmo cálculo. Excluir pede confirmação (RN-025).

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { hojeBrasilia, moeda } from '@/lib/formato'
import { calcularComissao, confirmacao, lerValor } from '@/lib/gestao'
import { BlocoFalhou, Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Dash, EmptyState, Field, FormRow, IconButton, Input, LabelledField, PageHeader, Pagination, Panel,
  PanelBody, PanelHeader, RowTitle, SearchInput, SelectMenu, Stack, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 10
const MESES = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1).padStart(2, '0') }))
const doisDigitos = (m: unknown) => String(m).padStart(2, '0')

interface Formulario {
  id: number
  vendedorId: string
  mes: string
  ano: string
  vendas: string
  percentual: string
}

const vazio = (): Formulario => {
  const [ano, mes] = hojeBrasilia().split('-')
  return { id: 0, vendedorId: '', mes: String(Number(mes)), ano, vendas: '', percentual: '' }
}

export default function GestaoCadastrosPage() {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [form, setForm] = useState<Formulario>(vazio)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  const vendedores = useBloco(() => linhas('painelVendedores'), [])
  const lista = useBloco(
    () => linhas('comissaoListar', { busca: busca.trim(), limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    [busca, pagina],
  )
  const total = Number(lista.dados?.[0]?.TOTAL ?? 0)
  const vendas = lerValor(form.vendas)
  const perc = lerValor(form.percentual)
  const comissao = calcularComissao(vendas, perc)
  const nomeVendedor = (id: string) => vendedores.dados?.find(v => String(v.ID) === id)?.NOME ?? 'esta vendedora'
  const muda = (campo: keyof Formulario) => (valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const ano = Number(form.ano)
    if (!form.vendedorId || !(ano >= 2000 && ano <= 2100) || !(vendas >= 0) || !(perc >= 0 && perc <= 100)) {
      setAviso({ tom: 'error', texto: 'Informe vendedor, mês, ano, vendas e percentual (de 0 a 100) válidos.' })
      return
    }
    setSalvando(true)
    try {
      const input = { vendedorId: Number(form.vendedorId), mes: Number(form.mes), ano, vendas, percentual: perc }
      const n = await gravar(form.id ? 'comissaoAtualizar' : 'comissaoCriar', form.id ? { ...input, id: form.id } : input)
      if (n < 1) {
        setAviso({ tom: 'error', texto: `Nada foi alterado: ${nomeVendedor(form.vendedorId)} já tem comissão em ${doisDigitos(form.mes)}/${ano}.` })
        return
      }
      setAviso({ tom: 'success', texto: `Comissão de ${moeda(comissao)} salva.` })
      setForm(vazio())
      lista.recarregar()
    } catch (falha) {
      console.error('salvar comissão', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar a comissão agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function excluir(c: Record<string, unknown>) {
    setPedido({
      ...confirmacao('excluirComissao', `${c.VENDEDOR} de ${doisDigitos(c.MES)}/${c.ANO}`),
      executar: async () => {
        const n = await gravar('comissaoExcluir', { id: Number(c.ID) }).catch(() => 0)
        setAviso(n ? { tom: 'success', texto: 'Comissão excluída.' } : { tom: 'error', texto: 'Nada foi alterado: a comissão não foi excluída.' })
        lista.recarregar()
      },
    })
  }

  return (
    <>
      <PageHeader module="Gestão" title="Gestão Cadastros" description="Comissões por vendedor e mês. O valor da comissão é calculado." />
      <Stack>
        <Panel>
          <PanelHeader title={form.id ? 'Editar comissão' : 'Nova comissão'} />
          <PanelBody>
            <form onSubmit={salvar} noValidate>
              <Stack>
                <FormRow>
                  <Field label="Vendedor" obrigatorio>
                    <SelectMenu
                      label="Vendedor"
                      value={form.vendedorId}
                      options={(vendedores.dados ?? []).map(v => ({ value: String(v.ID), label: v.NOME }))}
                      onChange={muda('vendedorId')}
                    />
                  </Field>
                  <Field label="Mês" obrigatorio>
                    <SelectMenu label="Mês" value={form.mes} options={MESES} onChange={muda('mes')} />
                  </Field>
                  <LabelledField label="Ano" obrigatorio>
                    <Input inputMode="numeric" value={form.ano} onChange={e => muda('ano')(e.target.value)} />
                  </LabelledField>
                </FormRow>
                <FormRow>
                  <LabelledField label="Vendas (R$)" hint="Aceita 1.500,50 ou 1500.50" obrigatorio>
                    <Input inputMode="decimal" value={form.vendas} onChange={e => muda('vendas')(e.target.value)} />
                  </LabelledField>
                  <LabelledField label="Percentual (%)" obrigatorio>
                    <Input inputMode="decimal" value={form.percentual} onChange={e => muda('percentual')(e.target.value)} />
                  </LabelledField>
                  <LabelledField label="Comissão (calculada)">
                    <Input readOnly value={Number.isFinite(comissao) ? moeda(comissao) : ''} />
                  </LabelledField>
                </FormRow>
                {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
                <Actions>
                  <Button type="submit" variant="primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : 'Salvar comissão'}
                  </Button>
                  {form.id ? <Button onClick={() => setForm(vazio())}>Cancelar edição</Button> : null}
                </Actions>
              </Stack>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Comissões" />
          <Toolbar>
            <SearchInput
              placeholder="Buscar vendedor"
              aria-label="Buscar vendedor"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
          </Toolbar>
          {lista.erro ? (
            <BlocoFalhou />
          ) : lista.dados && lista.dados.length === 0 ? (
            <EmptyState title="Nenhuma comissão cadastrada" hint="Use o formulário acima para lançar a primeira." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Vendedor</Th>
                    <Th>Mês/Ano</Th>
                    <Th numeric>Vendas</Th>
                    <Th numeric>%</Th>
                    <Th numeric>Comissão</Th>
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(lista.dados ?? []).map(c => (
                    <Tr key={c.ID}>
                      <Td>
                        <RowTitle>{c.VENDEDOR}</RowTitle>
                      </Td>
                      <Td>{doisDigitos(c.MES)}/{c.ANO}</Td>
                      <Td numeric>{c.VALOR_VENDAS == null ? <Dash /> : moeda(c.VALOR_VENDAS)}</Td>
                      <Td numeric>{c.PERC_COMISSAO == null ? <Dash /> : `${Number(c.PERC_COMISSAO).toLocaleString('pt-BR')}%`}</Td>
                      <Td numeric>{c.VALOR_COMISSAO == null ? <Dash /> : moeda(c.VALOR_COMISSAO)}</Td>
                      <Td numeric>
                        <IconButton
                          label="Editar"
                          onClick={() =>
                            setForm({
                              id: Number(c.ID), vendedorId: String(c.VENDEDOR_ID), mes: String(c.MES), ano: String(c.ANO),
                              vendas: String(c.VALOR_VENDAS ?? ''), percentual: String(c.PERC_COMISSAO ?? ''),
                            })
                          }
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton label="Excluir" tone="danger" onClick={() => excluir(c)}>
                          <Trash2 />
                        </IconButton>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={pagina}
                lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
                total={total}
                unit="comissões"
                onPrevious={() => setPagina(p => p - 1)}
                onNext={() => setPagina(p => p + 1)}
              />
            </>
          )}
        </Panel>
      </Stack>
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  )
}

GestaoCadastrosPage.rota = '/gestao-cadastros'
