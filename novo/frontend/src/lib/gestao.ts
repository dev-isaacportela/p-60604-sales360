// Regras de tela da spec 010 (gestão, coordenação e diretoria).
// Regra pura: sem React, sem SDK. É o que tests/gestao.test.mjs importa.

import { perfisPermitidos, podeAbrir } from './menu.ts';
import { rotuloPapeis } from './sessao.ts';

/** RF-005 / C-026: bloco que falhou mostra isto e o resto da tela segue. */
export const MSG_BLOCO = 'Não foi possível carregar este bloco agora. Tente atualizar a tela.';

const NUMERICO = /^[1-9]\d*$/;

/** RN-015 / C-016. */
export function validarSupervisor(codigo: string): string | null {
  return NUMERICO.test(String(codigo ?? '').trim()) ? null : 'Informe um código de supervisor numérico.';
}

/** RN-022. */
export function validarMotivo(motivo: string): string | null {
  return String(motivo ?? '').trim().length > 500 ? 'O motivo pode ter até 500 caracteres.' : null;
}

/** C-012: "2 escopos vinculados. 1 já existia." */
export function resumoEscopos(pedidos: number, vinculados: number): string {
  const existiam = Math.max(0, pedidos - vinculados);
  const partes = [
    vinculados === 0 ? 'Nenhum escopo novo.' : vinculados === 1 ? '1 escopo vinculado.' : `${vinculados} escopos vinculados.`,
  ];
  if (existiam) partes.push(existiam === 1 ? '1 já existia.' : `${existiam} já existiam.`);
  return partes.join(' ');
}

type Acao =
  | 'desvincularEscopo' | 'removerRca' | 'inativarCoordenador' | 'ativarCoordenador'
  | 'removerBuCoordenador' | 'encerrarFerias' | 'desativarAcesso' | 'reativarAcesso';

const CONFIRMACOES: Record<Acao, { titulo: string; texto: (alvo: string) => string; botao: string; perigo: boolean }> = {
  desvincularEscopo: { titulo: 'Desvincular escopo', texto: a => `Desvincular o escopo ${a}? A pessoa deixa de atuar nele.`, botao: 'Desvincular', perigo: true },
  removerRca: { titulo: 'Remover vínculo', texto: a => `Remover o RCA de ${a}? A pessoa sai da equipe do coordenador e não pode ter férias.`, botao: 'Remover vínculo', perigo: true },
  inativarCoordenador: { titulo: 'Inativar coordenador', texto: a => `Inativar o coordenador ${a}? Ele deixa de ver a equipe.`, botao: 'Inativar coordenador', perigo: true },
  ativarCoordenador: { titulo: 'Ativar coordenador', texto: a => `Ativar o coordenador ${a}?`, botao: 'Ativar coordenador', perigo: false },
  removerBuCoordenador: { titulo: 'Remover BU do coordenador', texto: a => `Remover ${a} do coordenador? Os vendedores que só atuam nela saem da equipe dele.`, botao: 'Remover e salvar', perigo: true },
  encerrarFerias: { titulo: 'Encerrar férias', texto: a => `Encerrar as férias de ${a}? Férias em andamento terminam hoje; férias futuras são canceladas.`, botao: 'Encerrar', perigo: true },
  desativarAcesso: { titulo: 'Desativar acesso', texto: a => `Desativar o acesso de ${a}? Ela é desconectada na próxima ação e não consegue entrar. Carteira e histórico continuam.`, botao: 'Desativar acesso', perigo: true },
  reativarAcesso: { titulo: 'Reativar acesso', texto: a => `Reativar o acesso de ${a}? Ela pode entrar de novo na hora.`, botao: 'Reativar acesso', perigo: false },
};

export const ACOES_CONFIRMADAS = Object.keys(CONFIRMACOES) as Acao[];

/** RN-025: texto do diálogo, nomeando o alvo. A tela só chama o servidor no botão dele. */
export function confirmacao(acao: Acao, alvo: string) {
  const c = CONFIRMACOES[acao];
  return { titulo: c.titulo, texto: c.texto(alvo), botao: c.botao, perigo: c.perigo };
}

interface SessaoAcesso {
  papeis: string[];
  coordenadorAtivo?: boolean;
}

/** RN-001 / RN-002: mensagem de tela restrita, sem nome de cadastro interno. */
export function mensagemBloqueio(caminho: string, sessao: SessaoAcesso): string[] {
  const coordenadorSemCadastro = sessao.papeis.includes('COORDENADOR') && !sessao.coordenadorAtivo
    && podeAbrir(caminho, { ...sessao, coordenadorAtivo: true });
  if (coordenadorSemCadastro) return ['Seu cadastro de coordenador não está ativo. Procure a diretoria.'];
  return [`Esta tela está disponível apenas para ${perfisPermitidos(caminho)}.`, `Seu perfil: ${rotuloPapeis(sessao.papeis)}`];
}
