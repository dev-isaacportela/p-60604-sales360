// Spec 001 — regra de tela da sessão (T-091). Título de cada teste = id da spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarSessao, rotuloPapeis, destinoAposLogin, destinoSemSessao, mostrarAvisoNaoConfigurado,
} from '../src/lib/sessao.ts';

const linhaAna = {
  USER_ID: 11, EMAIL: 'ana@benenutri.local', NOME_EXIBICAO: 'Ana Souza', PAPEIS: 'VENDEDOR',
  COORDENADOR_ATIVO: 0, BLOQUEADO: 0, CONFIGURADO: 1,
  MODO_AGENDA: 'SEMANA', EXIBICAO_TAREFAS: 'LISTA', PAGINA_INICIAL: '/agenda',
};

test('C-001 / RN-004: página inicial Agenda sem endereço pedido abre a Agenda no modo Semana', () => {
  assert.equal(destinoAposLogin(null, { pagina: '/agenda', papeis: ['VENDEDOR'] }), '/agenda');
  const ana = normalizarSessao(linhaAna);
  assert.equal(destinoAposLogin(null, ana), '/agenda');
  assert.equal(ana.modoAgenda, 'SEMANA');
});

test('C-002: endereço pedido antes do login é o destino depois dele', () => {
  assert.deepEqual(destinoSemSessao('/clientes/1234'), { destino: '/login', guardar: '/clientes/1234' });
  assert.equal(destinoAposLogin('/clientes/1234', normalizarSessao(linhaAna)), '/clientes/1234');
});

test('C-010: preferência Kanban abre Atividades em Kanban; trocar na tela não altera a sessão', () => {
  const bruno = normalizarSessao({ ...linhaAna, USER_ID: 12, NOME_EXIBICAO: 'Bruno Lima', EXIBICAO_TAREFAS: 'KANBAN' });
  assert.equal(bruno.exibicaoAtividades, 'KANBAN');
  assert.throws(() => { bruno.exibicaoAtividades = 'LISTA'; }, TypeError);
  assert.equal(bruno.exibicaoAtividades, 'KANBAN');
});

test('RN-013: card Papéis mostra os papéis reais', () => {
  assert.equal(rotuloPapeis(['COORDENADOR', 'GESTOR']), 'Coordenador, Gestor');
  assert.equal(rotuloPapeis([]), 'Vendedor');
  assert.deepEqual(normalizarSessao({ ...linhaAna, PAPEIS: 'GESTOR,COORDENADOR' }).papeis, ['GESTOR', 'COORDENADOR']);
});

test('C-015 / RN-017: só o vendedor sem RCA nem escopo recebe o aviso', () => {
  const fernando = normalizarSessao({ ...linhaAna, USER_ID: 20, PAPEIS: 'VENDEDOR', CONFIGURADO: 0 });
  assert.equal(mostrarAvisoNaoConfigurado(fernando), true);
  const gil = normalizarSessao({ ...linhaAna, USER_ID: 21, PAPEIS: 'DIRETORIA,COORDENADOR', COORDENADOR_ATIVO: 1, CONFIGURADO: 0 });
  assert.equal(mostrarAvisoNaoConfigurado(gil), false);
  assert.equal(mostrarAvisoNaoConfigurado(normalizarSessao(linhaAna)), false);
});

test('RN-001: sem sessão, abrir a Agenda leva ao login', () => {
  assert.equal(destinoSemSessao('/agenda').destino, '/login');
  assert.equal(destinoSemSessao('/login').guardar, null);
});
