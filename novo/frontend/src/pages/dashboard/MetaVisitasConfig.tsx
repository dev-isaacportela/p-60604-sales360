// Meta semanal de visitas por perfil (spec 005, RF-004; D-508: fica em
// Configurações, só para a diretoria e a TI). A mudança vale a partir da
// próxima segunda; o servidor confere papel, valor e data (RNT-013).

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { acao, linha, linhasAfetadas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia } from '@/lib/formato'
import { ehDiretoria } from '@/lib/escopo'
import { semanaDe } from '@/lib/agenda'
import { proximaSegunda } from '@/lib/dashboard'
import { Actions, Alert, Button, FormRow, Input, LabelledField, Panel, PanelBody, PanelHeader, Stack } from '@/components/page'
import { useSessao } from '@/components/sessao-contexto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
const PERFIS = [{ perfil: 'VENDEDOR', rotulo: 'Vendedor' }, { perfil: 'COORDENADOR', rotulo: 'Coordenador' }] as const
const valido = (v: string) => /^[1-9]\d?$/.test(v.trim())

export function MetaVisitasConfig() {
  const { sessao } = useSessao()
  const hoje = hojeBrasilia()
  const vigencia = proximaSegunda(hoje)
  const [atual, setAtual] = useState<Linha | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [versao, setVersao] = useState(0)
  const diretoria = ehDiretoria(sessao)

  useEffect(() => {
    if (!diretoria) return
    linha('metaVisitasObter', { segunda: semanaDe(hoje).segunda })
      .then(l => {
        setAtual(l)
        setValores({ VENDEDOR: String(l?.PROX_VENDEDOR ?? ''), COORDENADOR: String(l?.PROX_COORDENADOR ?? '') })
      })
      .catch(falha => {
        console.error('s360MetaVisitasObter', falha)
        setResultado({ tom: 'error', texto: 'Não foi possível carregar a meta semanal agora.' })
      })
  }, [diretoria, hoje, versao])

  if (!diretoria || Number(atual?.PODE_EDITAR ?? 1) !== 1) return null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setResultado(null)
    if (!PERFIS.every(p => valido(valores[p.perfil] ?? ''))) {
      setResultado({ tom: 'error', texto: 'Informe metas inteiras de 1 a 99.' })
      return
    }
    const mudou = PERFIS.filter(p => Number(valores[p.perfil]) !== Number(atual?.[`PROX_${p.perfil}`]))
    if (mudou.length === 0) {
      setResultado({ tom: 'error', texto: 'Nada foi alterado: os valores são os mesmos já marcados.' })
      return
    }
    setSalvando(true)
    try {
      let afetadas = 0
      for (const p of mudou) afetadas += linhasAfetadas(await acao('metaVisitasSalvar', { perfil: p.perfil, valor: valores[p.perfil].trim(), vigencia }))
      setResultado(afetadas >= mudou.length
        ? { tom: 'success', texto: `Meta salva: vale a partir de ${fmtData(vigencia)}.` }
        : { tom: 'error', texto: 'Nada foi alterado: a meta não foi salva. Confira os valores e tente de novo.' })
      setVersao(v => v + 1)
    } catch (falha) {
      console.error('s360MetaVisitasSalvar', falha)
      setResultado({ tom: 'error', texto: 'Não foi possível salvar a meta agora. Tente de novo.' })
    } finally {
      setSalvando(false)
    }
  }

  const agendada = atual?.PROX_VIGENCIA
    ? `A partir de ${fmtData(atual.PROX_VIGENCIA)}: vendedor ${atual.PROX_VENDEDOR}/semana e coordenador ${atual.PROX_COORDENADOR}/semana.`
    : null

  return (
    <Panel>
      <PanelHeader
        title="Meta semanal de visitas"
        hint={atual ? `Nesta semana: vendedor ${atual.VENDEDOR}/semana e coordenador ${atual.COORDENADOR}/semana (segunda a sexta).` : 'Carregando…'}
      />
      <PanelBody>
        <form onSubmit={salvar} noValidate>
          <Stack>
            {agendada ? <Alert tone="info">{agendada}</Alert> : null}
            <FormRow>
              {PERFIS.map(p => (
                <LabelledField key={p.perfil} label={`${p.rotulo} (visitas por semana)`}>
                  <Input inputMode="numeric" value={valores[p.perfil] ?? ''} onChange={e => setValores(v => ({ ...v, [p.perfil]: e.target.value }))} />
                </LabelledField>
              ))}
            </FormRow>
            <p className="text-[12px] text-ink-secondary">A mudança vale a partir da próxima segunda, {fmtData(vigencia)}. Semanas anteriores mantêm a meta antiga.</p>
            {resultado ? <Alert tone={resultado.tom}>{resultado.texto}</Alert> : null}
            <Actions>
              <Button type="submit" variant="primary" disabled={salvando || !atual}>{salvando ? 'Salvando…' : 'Salvar meta semanal'}</Button>
            </Actions>
          </Stack>
        </form>
      </PanelBody>
    </Panel>
  )
}
