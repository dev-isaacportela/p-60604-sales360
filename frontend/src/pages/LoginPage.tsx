import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loginWithGoogleMitra,
  loginWithMicrosoftMitra,
  emailLoginMitra,
  emailSignupMitra,
  emailVerifyCodeMitra,
  emailResendCodeMitra,
  sendPasswordResetCodeMitra,
  validatePasswordResetCodeMitra,
  resetPasswordMitra,
} from 'mitra-interactions-sdk';
import type { LoginResponse } from 'mitra-interactions-sdk';
import { saveSession } from '../lib/mitra-auth';
import { Card, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const AUTH_URL = import.meta.env.VITE_MITRA_AUTH_URL;
const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const loginOpts = { authUrl: AUTH_URL, projectId: PROJECT_ID, create: true };

type View = 'main' | 'verify' | 'forgot' | 'reset';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();

  // State
  const [view, setView] = useState<View>('main');
  const [isCreate, setIsCreate] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState(() => (
    new URLSearchParams(window.location.search).get('bloqueado') === '1'
      ? 'Seu acesso ao sistema foi desativado. Procure seu gestor.'
      : ''
  ));
  const [success, setSuccess] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handleSuccess(response: LoginResponse) {
    saveSession(response);
    onLogin();
    navigate('/', { replace: true });
  }

  // ── SSO (popup) ──

  async function handleSso(provider: 'google' | 'microsoft') {
    setLoading(provider);
    setError('');
    try {
      const fn = provider === 'google' ? loginWithGoogleMitra : loginWithMicrosoftMitra;
      const response = await fn(loginOpts);
      handleSuccess(response);
    } catch (err: any) {
      setError(err?.message || 'Falha no login. Tente novamente.');
    } finally {
      setLoading(null);
    }
  }

  // ── Email login (silent iframe) ──

  async function handleEmailSubmit() {
    if (isCreate && !name.trim()) { setError('Preencha o nome'); return; }
    if (!email.trim()) { setError('Preencha o email'); return; }
    if (!password.trim()) { setError('Preencha a senha'); return; }

    setLoading('email');
    setError('');

    try {
      if (isCreate) {
        await emailSignupMitra({ ...loginOpts, name: name.trim(), email: email.trim(), password: password.trim() });
        // Signup ok → precisa verificar código
        setView('verify');
      } else {
        const response = await emailLoginMitra({ ...loginOpts, email: email.trim(), password: password.trim() });
        handleSuccess(response);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro na autenticação');
    } finally {
      setLoading(null);
    }
  }

  // ── Verificação de código ──

  async function handleVerifyCode() {
    if (!code.trim() || code.trim().length < 6) { setError('Digite o código de 6 dígitos'); return; }

    setLoading('verify');
    setError('');

    try {
      const response = await emailVerifyCodeMitra({
        ...loginOpts,
        email: email.trim(),
        code: code.trim(),
        password: password.trim(),
      });
      handleSuccess(response);
    } catch (err: any) {
      setError(err?.message || 'Código inválido ou expirado');
    } finally {
      setLoading(null);
    }
  }

  async function handleResendCode() {
    setLoading('resend');
    setError('');
    try {
      await emailResendCodeMitra({ ...loginOpts, email: email.trim() });
      setError(''); // limpa erro anterior
    } catch {
      // silencioso
    } finally {
      setLoading(null);
    }
  }

  // ── Recuperação de senha ──

  function irPara(destino: View) {
    setView(destino);
    setError('');
    setSuccess('');
  }

  function voltarParaLogin() {
    irPara('main');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
  }

  // Passo 1: dispara o código de recuperação para o email informado
  async function handleSendResetCode(reenvio = false) {
    if (!email.trim()) { setError('Preencha o email'); return; }

    setLoading(reenvio ? 'resetResend' : 'forgot');
    setError('');
    setSuccess('');

    try {
      await sendPasswordResetCodeMitra({ email: email.trim(), projectId: PROJECT_ID, authUrl: AUTH_URL });
      setView('reset');
      setSuccess(`Enviamos um código para ${email.trim()}`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar o código. Confira o email e tente novamente.');
    } finally {
      setLoading(null);
    }
  }

  // Passo 2: valida o código e grava a nova senha
  async function handleResetPassword() {
    if (!code.trim() || code.trim().length < 6) { setError('Digite o código de 6 dígitos'); return; }
    if (!newPassword.trim()) { setError('Preencha a nova senha'); return; }
    if (newPassword !== confirmPassword) { setError('As senhas não conferem'); return; }

    setLoading('reset');
    setError('');
    setSuccess('');

    try {
      const opts = { email: email.trim(), code: code.trim(), projectId: PROJECT_ID, authUrl: AUTH_URL };
      await validatePasswordResetCodeMitra(opts);
      await resetPasswordMitra({ ...opts, newPassword: newPassword.trim() });

      // Senha trocada: volta para o login com o email preenchido
      setView('main');
      setIsCreate(false);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
      setSuccess('Senha redefinida. Entre com a nova senha.');
    } catch (err: any) {
      setError(err?.message || 'Código inválido ou expirado');
    } finally {
      setLoading(null);
    }
  }

  // ── Render ──

  const titulo =
    view === 'verify' ? 'Verifique seu email'
      : view === 'forgot' ? 'Recuperar senha'
        : view === 'reset' ? 'Criar nova senha'
          : isCreate ? 'Criar conta' : 'Entrar';

  const subtitulo =
    view === 'verify' ? `Enviamos um código para ${email}`
      : view === 'forgot' ? 'Informe seu email e enviaremos um código de verificação'
        : view === 'reset' ? `Digite o código enviado para ${email} e escolha a nova senha`
          : isCreate ? 'Preencha os dados para criar sua conta' : 'Escolha como deseja acessar';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Card className="w-full max-w-sm animate-scaleIn">
        <CardContent className="pt-8 pb-6 px-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {titulo}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitulo}
            </p>
          </div>

          {view === 'verify' ? (
            /* ── Tela de verificação de código ── */
            <div className="flex flex-col gap-4">
              <Input
                label="Código de verificação"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                className="text-center text-2xl tracking-[0.5em] font-bold"
                autoFocus
              />

              <Button size="lg" className="w-full" onClick={handleVerifyCode} disabled={loading !== null}>
                {loading === 'verify' ? 'Verificando...' : 'Verificar'}
              </Button>

              <button
                onClick={handleResendCode}
                disabled={loading !== null}
                className="text-sm font-medium cursor-pointer border-0 bg-transparent disabled:opacity-50"
                style={{ color: 'var(--color-primary)' }}
              >
                {loading === 'resend' ? 'Enviando...' : 'Reenviar código'}
              </button>
            </div>
          ) : view === 'forgot' ? (
            /* ── Recuperar senha: pedir o email ── */
            <div className="flex flex-col gap-4">
              <Input
                label="Email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendResetCode()}
                disabled={loading !== null}
                autoFocus
              />

              <Button size="lg" className="w-full" onClick={() => handleSendResetCode()} disabled={loading !== null}>
                {loading === 'forgot' ? 'Enviando...' : 'Enviar código'}
              </Button>

              <button
                onClick={voltarParaLogin}
                disabled={loading !== null}
                className="text-sm cursor-pointer border-0 bg-transparent disabled:opacity-50"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Voltar para o login
              </button>
            </div>
          ) : view === 'reset' ? (
            /* ── Recuperar senha: código + nova senha ── */
            <div className="flex flex-col gap-4">
              <Input
                label="Código de verificação"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center text-2xl tracking-[0.5em] font-bold"
                disabled={loading !== null}
                autoFocus
              />

              <Input
                label="Nova senha"
                type="password"
                placeholder="Sua nova senha"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading !== null}
              />

              <Input
                label="Confirmar nova senha"
                type="password"
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                disabled={loading !== null}
              />

              <Button size="lg" className="w-full" onClick={handleResetPassword} disabled={loading !== null}>
                {loading === 'reset' ? 'Redefinindo...' : 'Redefinir senha'}
              </Button>

              <button
                onClick={() => handleSendResetCode(true)}
                disabled={loading !== null}
                className="text-sm font-medium cursor-pointer border-0 bg-transparent disabled:opacity-50"
                style={{ color: 'var(--color-primary)' }}
              >
                {loading === 'resetResend' ? 'Enviando...' : 'Reenviar código'}
              </button>

              <button
                onClick={voltarParaLogin}
                disabled={loading !== null}
                className="text-sm cursor-pointer border-0 bg-transparent disabled:opacity-50"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            /* ── Tela principal: SSO + Email ── */
            <div className="flex flex-col gap-3">
              {/* SSO buttons */}
              <Button variant="secondary" size="lg" className="w-full" onClick={() => handleSso('google')} disabled={loading !== null}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {loading === 'google' ? 'Aguarde...' : 'Continue com Google'}
              </Button>

              <Button variant="secondary" size="lg" className="w-full" onClick={() => handleSso('microsoft')} disabled={loading !== null}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                  <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                  <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                  <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                </svg>
                {loading === 'microsoft' ? 'Aguarde...' : 'Continue com Microsoft'}
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                  {isCreate ? 'Ou crie com e-mail' : 'Ou entre com e-mail'}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
              </div>

              {/* Email form */}
              {isCreate && (
                <Input
                  label="Nome"
                  placeholder="Seu nome completo"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading !== null}
                />
              )}

              <Input
                label="Email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading !== null}
              />

              <Input
                label="Senha"
                type="password"
                placeholder="Sua senha"
                autoComplete={isCreate ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                disabled={loading !== null}
              />

              <Button size="lg" className="w-full" onClick={handleEmailSubmit} disabled={loading !== null}>
                {loading === 'email'
                  ? (isCreate ? 'Cadastrando...' : 'Entrando...')
                  : (isCreate ? 'Cadastrar' : 'Entrar')}
              </Button>

              {/* Esqueci minha senha — só faz sentido no modo login */}
              {!isCreate && (
                <button
                  onClick={() => irPara('forgot')}
                  disabled={loading !== null}
                  className="text-sm font-medium cursor-pointer border-0 bg-transparent disabled:opacity-50"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Esqueci minha senha
                </button>
              )}

              {/* Toggle login/create */}
              <button
                onClick={() => { setIsCreate(!isCreate); setError(''); setSuccess(''); }}
                className="text-sm cursor-pointer border-0 bg-transparent mt-1"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {isCreate
                  ? <>Já tem conta? <span className="font-medium underline" style={{ color: 'var(--color-primary)' }}>Entre aqui</span></>
                  : <>Não tem conta? <span className="font-medium underline" style={{ color: 'var(--color-primary)' }}>Crie a sua aqui</span></>}
              </button>
            </div>
          )}

          {/* Feedback */}
          {error && (
            <p className="text-sm text-red-600 text-center mt-4 animate-fadeIn">{error}</p>
          )}
          {!error && success && (
            <p className="text-sm text-center mt-4 animate-fadeIn" style={{ color: 'var(--color-primary)' }}>{success}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
