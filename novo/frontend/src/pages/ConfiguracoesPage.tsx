// Configurações (RF-009..011, RF-015, RN-010..014, C-012, C-013).
// Férias só leitura; salvar = Garantir → Salvar. O resultado aparece como
// Alert junto do botão e não some sozinho (design.md §1.4: sem toast).

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { acao, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, hojeBrasilia } from '@/lib/formato'
import { opcoesPaginaInicial, podeAbrir } from '@/lib/menu'
import { normalizarNome, textoFerias } from '@/lib/perfil'
import { rotuloPapeis } from '@/lib/sessao'
import {
  Actions, Alert, Badge, Button, Field, FormRow, InfoGrid, InfoTile, Input, LabelledField, PageHeader, Panel, PanelBody, PanelHeader,
  SelectMenu, Stack,
} from '@/components/page'
import { useSessao } from '@/components/sessao-contexto'

const MODOS_AGENDA = [
  { value: 'DIA', label: 'Dia' },
  { value: 'SEMANA', label: 'Semana' },
  { value: 'MES', label: 'Mês' },
]
const EXIBICOES = [
  { value: 'LISTA', label: 'Lista' },
  { value: 'KANBAN', label: 'Kanban' },
]
const MSG_SUCESSO = 'Configurações atualizadas com sucesso.'
const MSG_FALHA = 'Falha ao salvar configurações.'

type Ferias = ReturnType<typeof textoFerias>

export function ConfiguracoesPage() {
  const { sessao, recarregar } = useSessao()
  const opcoesPagina = opcoesPaginaInicial(sessao).map(o => ({ value: o.valor, label: o.rotulo }))
  const paginaValida = podeAbrir(sessao.pagina, sessao) && opcoesPagina.some(o => o.value === sessao.pagina)

  const [nome, setNome] = useState(sessao.nome)
  const [modoAgenda, setModoAgenda] = useState<string>(sessao.modoAgenda)
  const [exibicao, setExibicao] = useState<string>(sessao.exibicaoAtividades)
  const [pagina, setPagina] = useState(paginaValida ? sessao.pagina : '/')
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<'ok' | 'falha' | null>(null)
  const [ferias, setFerias] = useState<Ferias | null>(null)
  const [feriasFalhou, setFeriasFalhou] = useState(false)

  useEffect(() => {
    const hoje = hojeBrasilia()
    linhas('feriasMinhasObter', { hoje })
      .then(linhasFerias => setFerias(textoFerias(linhasFerias, hoje)))
      .catch(falha => {
        console.error('s360FeriasMinhasObter', falha)
        setFeriasFalhou(true)
      })
  }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setResultado(null)
    const nomeNormalizado = normalizarNome(nome, sessao.email)
    setErroNome(nomeNormalizado.erro)
    if (nomeNormalizado.erro) return

    setSalvando(true)
    try {
      const agora = agoraBrasilia()
      await acao('configuracoesGarantir', { agora })
      const resposta = await acao('configuracoesSalvar', {
        nome: nomeNormalizado.gravar,
        modoAgenda,
        exibicaoAtividades: exibicao,
        paginaInicial: pagina,
        agora,
      })
      // UPDATE ... JOIN conta as duas tabelas: 1 ou 2 = gravou; 0 = recusou (RNT-013).
      if (linhasAfetadas(resposta) < 1) throw new Error(`s360ConfiguracoesSalvar: ${linhasAfetadas(resposta)} linhas afetadas`)
      setResultado('ok')
      setNome(nomeNormalizado.exibir)
      recarregar()
    } catch (falha) {
      console.error('salvar configurações', falha)
      setResultado('falha')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <PageHeader
        module="Conta"
        title="Configurações"
        actions={ferias && <Badge tone={ferias.status === 'Férias' ? 'attention' : 'accent'}>Status: {ferias.status}</Badge>}
      />
      <Stack>
        <InfoGrid>
          <InfoTile label="Nome">{sessao.nome}</InfoTile>
          <InfoTile label="Papéis">{rotuloPapeis(sessao.papeis)}</InfoTile>
          <InfoTile label="Substituto em Férias">{ferias ? ferias.substituto : feriasFalhou ? 'Indisponível' : 'Carregando…'}</InfoTile>
          <InfoTile label="Suporte">ID do usuário: {sessao.userId}</InfoTile>
        </InfoGrid>

        {ferias?.avisos.map(aviso => (
          <Alert key={aviso} tone="info">
            {aviso}
          </Alert>
        ))}
        {feriasFalhou && <Alert tone="warn">Não foi possível carregar as férias agora.</Alert>}

        <Panel>
          <PanelHeader title="Preferências" hint="Status e substituto vêm do cadastro de férias da coordenação e não são editados aqui." />
          <PanelBody>
            <form onSubmit={salvar} noValidate>
              <Stack>
                <LabelledField
                  label="Nome de exibição"
                  hint={erroNome ?? 'Até 120 caracteres. Em branco, usa o nome da conta.'}
                  hintTone={erroNome ? 'error' : 'muted'}
                >
                  <Input value={nome} aria-invalid={!!erroNome} onChange={e => setNome(e.target.value)} />
                </LabelledField>
                <FormRow>
                  <Field label="Modo padrão da Agenda">
                    <SelectMenu label="Modo padrão da Agenda" value={modoAgenda} options={MODOS_AGENDA} onChange={setModoAgenda} />
                  </Field>
                  <Field label="Exibição padrão de Atividades">
                    <SelectMenu label="Exibição padrão de Atividades" value={exibicao} options={EXIBICOES} onChange={setExibicao} />
                  </Field>
                  <Field label="Página inicial">
                    <SelectMenu label="Página inicial" value={pagina} options={opcoesPagina} onChange={setPagina} />
                  </Field>
                </FormRow>
                {resultado === 'ok' && <Alert tone="success">{MSG_SUCESSO}</Alert>}
                {resultado === 'falha' && <Alert tone="error">{MSG_FALHA}</Alert>}
                <Actions>
                  <Button type="submit" variant="primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : 'Salvar Configurações'}
                  </Button>
                </Actions>
              </Stack>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Google Agenda" hint="Disponível na spec 003." />
        </Panel>
      </Stack>
    </>
  )
}
