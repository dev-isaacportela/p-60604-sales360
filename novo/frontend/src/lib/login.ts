// Login e recuperação de senha (RF-001..003, RN-002, RN-003, RN-016, C-005).
// Regra pura: sem React, sem SDK. É o que tests/login.test.mjs importa.
//
// Mensagens fixas: o texto devolvido pelo provedor nunca chega à tela
// (RNFT-007); o detalhe vai para o console.

/** Caminhos de entrada da tela de login. Não há criação de conta (RF-002). */
export const CAMINHOS_LOGIN = [
  { id: 'google', rotulo: 'Continue com Google' },
  { id: 'microsoft', rotulo: 'Continue com Microsoft' },
  { id: 'email', rotulo: 'Entrar' },
  { id: 'recuperar', rotulo: 'Esqueci minha senha' },
];

export const MSG_BLOQUEADO = 'Seu acesso ao sistema foi desativado. Procure seu gestor.';
export const MSG_SENHA_REDEFINIDA = 'Senha redefinida. Entre com a nova senha.';
export const MSG_CODIGO_CURTO = 'Digite o código de 6 dígitos';
export const MSG_SENHAS_DIFERENTES = 'As senhas não conferem';

const ERROS: Record<string, string> = {
  google: 'Falha no login. Tente novamente.',
  microsoft: 'Falha no login. Tente novamente.',
  email: 'Erro na autenticação',
  codigo: 'Código inválido ou expirado',
  envio: 'Não foi possível enviar o código. Confira o email e tente novamente.',
};

/** Mensagem da RN-002 para a origem da falha; o erro do provedor é ignorado de propósito. */
export function mensagemErroLogin(origem: string): string {
  return ERROS[origem] ?? ERROS.email;
}

/** Espaços no início e no fim do e-mail e da senha não contam (RF-001). */
export function limparCredencial(texto: string | null | undefined): string {
  return String(texto ?? '').trim();
}

/** Código de recuperação (RN-003): só dígitos, no máximo 6; menos que 6 é erro sem consultar o servidor. */
export function validarCodigo(texto: string | null | undefined): { codigo: string; erro: string | null } {
  const codigo = String(texto ?? '').replace(/\D/g, '').slice(0, 6);
  return { codigo, erro: codigo.length === 6 ? null : MSG_CODIGO_CURTO };
}

/** Nova senha e confirmação (C-005). */
export function validarNovaSenha(senha: string, confirmacao: string): string | null {
  const a = limparCredencial(senha);
  if (!a) return 'Informe a nova senha';
  return a === limparCredencial(confirmacao) ? null : MSG_SENHAS_DIFERENTES;
}

/** Depois de redefinir: volta ao login com o aviso e o e-mail preenchido (C-005). */
export function destinoAposRedefinir(email: string): { caminho: string; estado: { email: string; aviso: string } } {
  return { caminho: '/login', estado: { email: limparCredencial(email), aviso: MSG_SENHA_REDEFINIDA } };
}
