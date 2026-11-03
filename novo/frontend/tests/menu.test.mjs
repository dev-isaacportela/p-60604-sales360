// Spec 001 — menu e permissão de tela (T-093).
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarMenu, podeAbrir, perfisPermitidos, opcoesPaginaInicial, RODAPE_MENU } from '../src/lib/menu.ts';
import { destinoAposLogin } from '../src/lib/sessao.ts';

const rotulos = secao => secao.itens.map(i => i.rotulo);
const porId = (menu, id) => menu.find(s => s.id === id);
const CANCELADAS = /ajuda|suporte|painel dev|desenvolvedor|notas de vers|solicita|agenda dos vendedores|análise diretoria|faturamento|gestão de metas|acomp\. semanal|painel de gestão|gestão cadastros|painel de validação/i;

const gil = { papeis: ['DIRETORIA', 'COORDENADOR'], coordenadorAtivo: true, pagina: '/' };
const ana = { papeis: ['VENDEDOR'], coordenadorAtivo: false, pagina: '/agenda' };

test('C-007 / RN-005: Diretoria + coordenador ativo veem as duas seções, Titulares uma vez só', () => {
  const menu = montarMenu(gil);
  // Executivas de Venda é de coordenador ativo e Diretoria (RN-005), então Gestão aparece com 1 item.
  assert.deepEqual(menu.map(s => s.id), ['principal', 'coordenador', 'diretoria', 'gestao', 'final']);
  assert.deepEqual(rotulos(porId(menu, 'gestao')), ['Executivas de Venda']);
  assert.equal(rotulos(porId(menu, 'principal')).at(-1), 'Direcionamento Semanal');
  assert.deepEqual(rotulos(porId(menu, 'coordenador')),
    ['Gestão de Carteira', 'Titulares de Clientes', 'Férias de Vendedores']);
  assert.deepEqual(rotulos(porId(menu, 'diretoria')),
    ['Papéis de Usuários', 'Gestão Coordenadores']);
  assert.equal(menu.flatMap(rotulos).filter(r => r === 'Titulares de Clientes').length, 1);

  const menuAna = montarMenu(ana);
  assert.deepEqual(menuAna.map(s => s.id), ['principal', 'final']);
  assert.deepEqual(rotulos(porId(menuAna, 'principal')),
    ['Dashboard', 'Agenda', 'Clientes', 'Atividades', 'Mix Builder', 'Analytics', 'Comparativo', 'Alertas']);
});

test('RN-005 (permissões): Gestão por papel, telas canceladas nunca aparecem', () => {
  const gestao = porId(montarMenu({ papeis: ['GESTOR'] }), 'gestao');
  assert.deepEqual(rotulos(gestao),
    ['Governança RCA', 'BUs e Vendedores', 'Escopo Usuários']);

  const ti = montarMenu({ papeis: ['ADMIN'] });
  const gestaoTi = rotulos(porId(ti, 'gestao'));
  assert.deepEqual(gestaoTi, ['Executivas de Venda', 'Governança RCA', 'BUs e Vendedores', 'Escopo Usuários']);
  assert.deepEqual(rotulos(porId(ti, 'diretoria')), ['Papéis de Usuários', 'Gestão Coordenadores', 'Titulares de Clientes']);

  for (const papeis of [['VENDEDOR'], ['COORDENADOR'], ['DIRETORIA'], ['GESTOR'], ['ADMIN']]) {
    const menu = montarMenu({ papeis, coordenadorAtivo: true });
    assert.equal(menu.flatMap(rotulos).filter(r => CANCELADAS.test(r)).length, 0, papeis.join());
    assert.deepEqual(rotulos(porId(menu, 'final')), ['Configurações']);
  }
  assert.deepEqual(RODAPE_MENU, ['Sair']);
});

test('C-008 / RN-015: vendedora não abre Papéis de Usuários, restrito a Diretoria e TI', () => {
  assert.equal(podeAbrir('/gestao-cargos-usuarios', ana), false);
  assert.equal(podeAbrir('/gestao-cargos-usuarios', { papeis: ['ADMIN'] }), true);
  assert.equal(perfisPermitidos('/gestao-cargos-usuarios'), 'Diretoria e TI');
  assert.equal(perfisPermitidos('/gestao-titulares'), 'Coordenador, Diretoria e TI');
});

test('C-011 / RN-011: página inicial cancelada (Painel de Gestão) cai no Dashboard e some das opções', () => {
  const carla = { papeis: ['VENDEDOR'], pagina: '/painel-gestao' };
  assert.equal(destinoAposLogin(null, carla), '/');
  assert.deepEqual(opcoesPaginaInicial(carla).map(o => o.rotulo),
    ['Dashboard', 'Agenda', 'Clientes', 'Atividades', 'Mix Builder', 'Analytics']);
  assert.equal(opcoesPaginaInicial({ papeis: ['GESTOR'] }).length, 6);
  assert.equal(destinoAposLogin('/painel-validacao', { papeis: ['ADMIN'], pagina: '/' }), '/');
});

test('RN-011 (telas canceladas): Ajuda ou Solicitações gravadas como página inicial levam ao Dashboard', () => {
  assert.equal(destinoAposLogin(null, { papeis: ['VENDEDOR'], pagina: '/ajuda' }), '/');
  assert.equal(destinoAposLogin(null, { papeis: ['ADMIN'], pagina: '/solicitacoes-compras' }), '/');
  assert.equal(destinoAposLogin('/analise-diretoria', { papeis: ['DIRETORIA'], pagina: '/' }), '/');
  assert.equal(destinoAposLogin('/admin-acomp-semanal', { papeis: ['ADMIN'], pagina: '/' }), '/');
  assert.equal(destinoAposLogin('/agenda-coordenador', { papeis: ['COORDENADOR'], coordenadorAtivo: true, pagina: '/' }), '/');
  const opcoes = opcoesPaginaInicial({ papeis: ['ADMIN', 'GESTOR', 'DIRETORIA'], coordenadorAtivo: true });
  assert.equal(opcoes.filter(o => CANCELADAS.test(o.rotulo) || CANCELADAS.test(o.valor)).length, 0);
  assert.equal(opcoes.length, 6);
});
