// Acesso (RF-001..003, RN-002, RN-003, RN-016, C-003..C-006) — design.md §10.1.
// Um cartão, três passos: entrar → recuperar (pede o código) → nova senha.
// Sem criar conta (B1). O e-mail digitado atravessa os passos. `/login` e
// `/recuperar-senha` abrem o mesmo cartão no passo certo.
// Sem VITE_MITRA_AUTH_URL (MODO_LOCAL) entra no simulador por loginLocally; os
// passos que só a conta real cumpre continuam navegáveis e recusam no envio.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  emailLoginMitra, loginWithGoogleMitra, loginWithMicrosoftMitra, resetPasswordMitra, sendPasswordResetCodeMitra, validatePasswordResetCodeMitra,
} from 'mitra-interactions-sdk'
import { AUTH_URL, MODO_LOCAL, PROJECT_ID, hasSession, loginLocally, saveSession } from '@/lib/mitra-auth'
import {
  CAMINHOS_LOGIN, MSG_BLOQUEADO, MSG_SENHA_REDEFINIDA, limparCredencial, mensagemErroLogin, validarCodigo, validarNovaSenha,
} from '@/lib/login'
import { CHAVE_POS_LOGIN } from '@/lib/sessao'
import { Alert, AuthCard, AuthContext, AuthDivider, AuthHeadline, AuthShell, Button, Input, LabelledField, Stack, TextLink } from '@/components/page'
import { MonogramTile, Wordmark } from '@/components/Logo'

const ROTULO = Object.fromEntries(CAMINHOS_LOGIN.map(c => [c.id, c.rotulo]))
const OPCOES = { authUrl: AUTH_URL, projectId: PROJECT_ID }
const SO_NA_CONTA_REAL = 'Indisponível no ambiente local: entre com um usuário do simulador (novo/README.md).'

type Passo = 'entrar' | 'recuperar' | 'nova-senha'
type Origem = 'google' | 'microsoft' | 'email'

// Marcas alheias: cor cravada no SVG, fora de token e de Logo.tsx (§10.1).
function MarcaGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

function MarcaMicrosoft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  )
}

const TITULO: Record<Passo, { titulo: string; dica: string }> = {
  entrar: { titulo: 'Entrar', dica: 'Use a conta da empresa ou o e-mail cadastrado pela gestão.' },
  recuperar: { titulo: 'Recuperar senha', dica: 'Enviaremos um código de 6 dígitos para o seu e-mail.' },
  'nova-senha': { titulo: 'Nova senha', dica: 'Digite o código recebido e a nova senha.' },
}

export function LoginPage({ passoInicial = 'entrar' }: { passoInicial?: Passo }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const estado = (useLocation().state ?? {}) as { email?: string }
  const [passo, setPasso] = useState<Passo>(passoInicial)
  const [email, setEmail] = useState(estado.email ?? '')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (hasSession()) return <Navigate to="/" replace />

  function irPara(proximo: Passo) {
    setErro(null)
    setErroCodigo(null)
    setErroSenha(null)
    setPasso(proximo)
    // A URL acompanha o passo, para F5 reabrir onde a pessoa estava.
    navigate(proximo === 'entrar' ? '/login' : '/recuperar-senha', { replace: true, state: { email: limparCredencial(email) } })
  }

  async function entrar(origem: Origem, acao: () => Promise<unknown>) {
    setErro(null)
    setAviso(null)
    setOcupado(origem)
    try {
      const resposta = await acao()
      if (resposta && typeof resposta === 'object') saveSession(resposta as Record<string, unknown>)
      try {
        sessionStorage.setItem(CHAVE_POS_LOGIN, '1')
      } catch {
        // sessionStorage bloqueado: entra na página inicial sem o caminho pedido.
      }
      navigate('/', { replace: true })
    } catch (e) {
      console.error(`login ${origem}`, e)
      setErro(mensagemErroLogin(origem))
      setOcupado(null)
    }
  }

  function provedor(origem: 'google' | 'microsoft') {
    if (MODO_LOCAL) {
      setErro(SO_NA_CONTA_REAL)
      return
    }
    void entrar(origem, () => (origem === 'google' ? loginWithGoogleMitra(OPCOES) : loginWithMicrosoftMitra(OPCOES)))
  }

  function enviarEmail(e: FormEvent) {
    e.preventDefault()
    const credenciais = { email: limparCredencial(email), password: limparCredencial(senha) }
    if (!credenciais.email || !credenciais.password) {
      setErro(mensagemErroLogin('email'))
      return
    }
    void entrar('email', () =>
      // loginLocally já grava a sessão; o SDK devolve a sessão para gravarmos aqui.
      MODO_LOCAL ? loginLocally(credenciais.email, credenciais.password).then(() => null) : emailLoginMitra({ ...OPCOES, ...credenciais }),
    )
  }

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!limparCredencial(email)) {
      setErro(mensagemErroLogin('envio'))
      return
    }
    if (MODO_LOCAL) {
      setErro(SO_NA_CONTA_REAL)
      return
    }
    setOcupado('codigo')
    try {
      await sendPasswordResetCodeMitra({ ...OPCOES, email: limparCredencial(email) })
      irPara('nova-senha')
    } catch (falha) {
      console.error('sendPasswordResetCodeMitra', falha)
      setErro(mensagemErroLogin('envio'))
    } finally {
      setOcupado(null)
    }
  }

  async function redefinir(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const erroDoCodigo = validarCodigo(codigo).erro
    const erroDaSenha = validarNovaSenha(novaSenha, confirmacao)
    setErroCodigo(erroDoCodigo)
    setErroSenha(erroDaSenha)
    if (erroDoCodigo || erroDaSenha) return
    if (MODO_LOCAL) {
      setErro(SO_NA_CONTA_REAL)
      return
    }
    setOcupado('redefinir')
    try {
      const dados = { ...OPCOES, email: limparCredencial(email), code: codigo }
      await validatePasswordResetCodeMitra(dados)
      await resetPasswordMitra({ ...dados, newPassword: limparCredencial(novaSenha) })
      setSenha('')
      irPara('entrar')
      setAviso(MSG_SENHA_REDEFINIDA)
    } catch (falha) {
      console.error('resetPassword', falha)
      setErro(mensagemErroLogin('codigo'))
    } finally {
      setOcupado(null)
    }
  }

  const campoEmail = (
    <LabelledField label="E-mail">
      <Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
    </LabelledField>
  )

  return (
    <AuthShell
      aside={
        <>
          <Wordmark className="h-8" />
          <AuthHeadline>A operação comercial externa num só lugar.</AuthHeadline>
          <AuthContext>Carteira, agenda de visitas, atividades e metas do time comercial da Benenutri.</AuthContext>
        </>
      }
    >
      <AuthCard logo={<MonogramTile />} title={TITULO[passo].titulo} hint={TITULO[passo].dica}>
        <Stack>
          {params.get('bloqueado') === '1' && passo === 'entrar' && <Alert tone="error">{MSG_BLOQUEADO}</Alert>}
          {aviso && passo === 'entrar' && <Alert tone="success">{aviso}</Alert>}
          {erro && <Alert tone="error">{erro}</Alert>}
          {MODO_LOCAL && passo === 'entrar' && <Alert tone="info">Ambiente local: entre com um usuário do simulador.</Alert>}

          {passo === 'entrar' && (
            <>
              <Button wide disabled={ocupado !== null} onClick={() => provedor('google')}>
                <MarcaGoogle />
                {ROTULO.google}
              </Button>
              <Button wide disabled={ocupado !== null} onClick={() => provedor('microsoft')}>
                <MarcaMicrosoft />
                {ROTULO.microsoft}
              </Button>
              <AuthDivider>ou com e-mail e senha</AuthDivider>
              <form onSubmit={enviarEmail} noValidate>
                <Stack>
                  {campoEmail}
                  <LabelledField label="Senha">
                    <Input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
                  </LabelledField>
                  <Button type="submit" variant="primary" wide disabled={ocupado !== null}>
                    {ocupado === 'email' ? 'Entrando…' : ROTULO.email}
                  </Button>
                </Stack>
              </form>
              <TextLink onClick={() => irPara('recuperar')}>{ROTULO.recuperar}</TextLink>
            </>
          )}

          {passo === 'recuperar' && (
            <form onSubmit={pedirCodigo} noValidate>
              <Stack>
                {campoEmail}
                <Button type="submit" variant="primary" wide disabled={ocupado !== null}>
                  {ocupado === 'codigo' ? 'Enviando…' : 'Enviar código'}
                </Button>
                <TextLink onClick={() => irPara('entrar')}>Voltar ao login</TextLink>
              </Stack>
            </form>
          )}

          {passo === 'nova-senha' && (
            <form onSubmit={redefinir} noValidate>
              <Stack>
                <Alert tone="info">Enviamos o código para {limparCredencial(email)}.</Alert>
                <LabelledField label="Código" hint={erroCodigo ?? undefined} hintTone="error">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    aria-invalid={!!erroCodigo}
                    // Filtra no onChange, sem maxLength (§10.1); reescreve o campo
                    // quando o filtro devolve o mesmo valor e o React não re-renderiza.
                    onChange={e => {
                      const limpo = validarCodigo(e.target.value).codigo
                      e.target.value = limpo
                      setCodigo(limpo)
                    }}
                  />
                </LabelledField>
                <LabelledField label="Nova senha">
                  <Input type="password" autoComplete="new-password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
                </LabelledField>
                <LabelledField label="Confirmar nova senha" hint={erroSenha ?? undefined} hintTone="error">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmacao}
                    aria-invalid={!!erroSenha}
                    onChange={e => setConfirmacao(e.target.value)}
                  />
                </LabelledField>
                <Button type="submit" variant="primary" wide disabled={ocupado !== null}>
                  {ocupado === 'redefinir' ? 'Redefinindo…' : 'Redefinir senha'}
                </Button>
                <TextLink onClick={() => irPara('entrar')}>Voltar ao login</TextLink>
              </Stack>
            </form>
          )}
        </Stack>
      </AuthCard>
    </AuthShell>
  )
}
