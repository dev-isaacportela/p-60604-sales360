// Dados da spec 010 (gestão, coordenação e diretoria), conforme a tabela
// "Seed" de docs/specs/010-gestao-diretoria/plan.md. Ids escolhidos e RCAs na
// faixa 10001+; usuários novos por ctx.usuario (o smoke acha pelo e-mail).
//
// Painel: filial 6 (Palmas) · departamento 9, que nenhuma outra spec usa.
// Coordenador, férias e executivas: filial 1 · Nutrição.

const EM = '2026-10-01 08:00:00';

export function semear({ inserir, usuario }) {
  const u = (nome) => usuario(nome, `${nome.split(' ').map((p) => p.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).join('.')}@benenutri.local`);
  const HELENA = u('Helena Duarte');
  const IGOR = u('Igor Matos');
  const JULIA = u('Júlia Freitas');
  const NINA = u('Nina Alves');
  const OLGA = u('Olga Pires');
  const PEDRO = u('Pedro Sales');
  u('Quésia Lemos');
  const CARLOS = u('Carlos Viana');
  u('Davi Moura');
  const RUI = u('Rui Barros');
  u('Sara Nunes'); // COORDENADOR só no legado: o smoke grava (o da 001 conta o legado do seed)
  const TEREZA = u('Tereza Lima');
  const ULISSES = u('Ulisses Reis');
  const VITOR = u('Vítor Gomes');
  const XAVIER = u('Xavier Melo');
  const YARA = u('Yara Dias');
  const JOANA = u('Joana Prates');
  const RENATA = u('Renata Costa');

  // BU 12 já existe (C-011); BU 13 recebe escopo e é inativada no smoke (RN-012).
  inserir('BU', ['CODIGO', 'NOME', 'ATIVO'], [['12', 'Odontologia', 1], ['13', 'Veterinária', 1]]);
  inserir('SECAO', ['ID', 'NOME_SECAO', 'ID_BU', 'ATIVO'], [
    [10001, 'Seção 1', 1, 1], [10002, 'Seção 2', 1, 1], [10003, 'Seção 3', 1, 1],
  ]);

  const vendedores = [HELENA, IGOR, JULIA, NINA, OLGA, PEDRO, TEREZA, ULISSES, VITOR, XAVIER, YARA, JOANA, RENATA];
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...vendedores.map((id) => [id, 'VENDEDOR', EM]),
    [RUI, 'GESTOR', EM],
    [CARLOS, 'COORDENADOR', EM],
  ]);

  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [
    [HELENA, 10001, 10045], [IGOR, 10002, 10045], [JULIA, 10003, 10045],
    [OLGA, 10936, 10012], [PEDRO, 10940, 10012],
    [TEREZA, 10021, 10045], [ULISSES, 10022, 10045], [VITOR, 10023, 10045], [XAVIER, 10024, 10045],
    [JOANA, 10025, 10045], [RENATA, 10026, 10045],
  ]);
  inserir('RCA_TOTVS', ['COD_RCA', 'RCA_NOME', 'SUPERVISOR_NOME', 'COD_SUPERVISOR', 'ATIVO'], [
    [10936, 'OLGA PIRES', 'SUPERVISOR DOZE', 10012, 1],
    [10937, 'RCA NOVO 937', 'SUPERVISOR DOZE', 10012, 1],
    [10940, 'PEDRO SALES', 'SUPERVISOR DOZE', 10012, 1],
    [10941, 'RCA NOVO 941', 'SUPERVISOR DOZE', 10012, 1],
    [10012, 'SUPERVISOR DOZE', null, null, 1],
  ]);

  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ...[HELENA, IGOR, JULIA].map((id) => ['9', id, 1, '6', null, EM]),
    ['1', NINA, 1, '1', 10002, EM],
    ['13', NINA, 1, '1', null, EM],
    ...[TEREZA, ULISSES, VITOR, XAVIER, YARA, JOANA].map((id) => ['1', id, 1, '1', null, EM]),
    ['8', RENATA, 1, '3', null, EM],
  ]);

  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [10045, 'Carlos Viana', 'carlos.viana@benenutri.local', CARLOS, 1],
  ]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[10045, 1, 1]]);

  // Carteira do Painel. 10011 e 10012 não estão em carteira nenhuma (RN-003).
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'UF', 'CIDADE', 'STATUS', 'WINTHOR_CODCLI'], [
    [10001, 'HOSPITAL NORTE LTDA', 'TO', 'Palmas', 'ATIVO', 10001],
    [10002, 'CLINICA SOL', 'TO', 'Palmas', 'ATIVO', 10002],
    [10003, 'FARMACIA CENTRAL', 'TO', 'Palmas', 'ATIVO', 10003],
    [10004, 'ESTETICA BELA', 'TO', 'Palmas', 'ATIVO', 10004],
    [10005, 'NUTRI BRASILIA', 'DF', 'Brasília', 'ATIVO', 10005],
    [10011, 'CLIENTE SEM CARTEIRA A', 'TO', 'Palmas', 'ATIVO', 10011],
    [10012, 'CLIENTE SEM CARTEIRA B', 'TO', 'Palmas', 'ATIVO', 10012],
  ]);
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    [10001, HELENA, '6', null, EM], [10002, HELENA, '6', null, EM], [10005, HELENA, '1', null, EM],
    [10003, IGOR, '6', null, EM], [10004, JULIA, '6', null, EM],
  ]);

  // Outubro/2026, F6·9: bruto 25.000 (Helena) + 20.000 (Igor) + 5.000 (Júlia) = 50.000.
  // 10003 é de Helena em 06/10, durante as férias dela com Igor de substituto.
  const venda = (id, cliente, total, data, { filial = '6', depto = '9', ativo = 1 } = {}) =>
    [id, `S010-${id}`, filial, depto, cliente, total, data, ativo, 'ATIVO', '2026-10-30T06:00:00'];
  inserir('PEDIDOS_SEMANAIS_SYNC_RAW',
    ['ID', 'CHAVE_NATURAL', 'CODFILIAL', 'CODEPTO', 'CLIENTE_ID', 'TOTAL', 'DATA_SAIDA', 'ATIVO', 'STATUS_INGESTAO', 'ATUALIZADO_EM'], [
      venda(10001, 10001, 12000, '2026-10-02'),
      venda(10002, 10002, 10000, '2026-10-15'),
      venda(10003, 10001, 3000, '2026-10-06'),
      venda(10004, 10003, 20000, '2026-10-10'),
      venda(10005, 10004, 5000, '2026-10-12'),
      venda(10006, 10011, 1000, '2026-10-14'),
      venda(10007, 10012, 2500, '2026-10-16'),
      venda(10008, 10005, 2000, '2026-10-08', { filial: '1', depto: '1' }), // fora do escopo de Helena
      venda(10009, 10001, 9999, '2026-09-20'), // outro mês
      venda(10010, 10002, 7777, '2026-10-21', { ativo: 0 }), // linha inativa
    ]);
  inserir('IMP_DEVOLUCOES_TOTVS', ['AUTO_ID', 'NOTA_DEVOLUCAO', 'CODFILIAL', 'CODEPTO', 'CODCLI', 'DATA_DEVOLUCAO', 'VALOR_DEVOLVIDO'], [
    [10001, 'D10001', '6', '9', 10001, '2026-10-12', 200],
    [10002, 'D10002', '6', '9', 10002, '2026-10-20', 600],
    [10003, 'D10003', '6', '9', 10003, '2026-10-18', 1200],
    [10004, 'D10004', '6', '9', 10012, '2026-10-22', 500],
  ]);
  inserir('METAS_BU_VENDEDOR', ['AUTO_ID', 'CODFILIAL', 'CODEPTO', 'VENDEDOR_ID', 'MES', 'ANO', 'META_VALOR'], [
    [10001, 6, 9, HELENA, 10, 2026, 20000],
    [10002, 6, 9, IGOR, 10, 2026, 25000],
    [10003, 6, 9, JULIA, 10, 2026, 15000],
  ]);

  // Fila operacional (C-003, RN-007), hoje = 30/10/2026.
  inserir('TAREFAS', ['ID', 'VENDEDOR_ID', 'TITULO', 'STATUS', 'DATA_LIMITE', 'CLIENTE_ID', 'CRIADO_EM'], [
    [10001, HELENA, 'Cobrar retorno do Hospital Norte', 'PENDENTE', '2026-10-28', 10001, EM],
    [10002, IGOR, 'Negociar contrato da Farmácia Central', 'EM_ANDAMENTO', '2026-11-10', 10003, EM],
    [10003, JULIA, 'Apresentar linha nova', 'PENDENTE', '2026-11-12', 10004, EM],
    [10004, HELENA, 'Tarefa concluída', 'CONCLUIDA', '2026-10-20', 10001, EM],
  ]);
  inserir('VISITAS', ['ID', 'CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'STATUS', 'CRIADO_EM'], [
    [10001, 10001, HELENA, '2026-10-29', 'AGENDADA', EM],
    [10002, 10002, HELENA, '2026-11-03', 'AGENDADA', EM],
    [10003, 10001, HELENA, '2026-10-20', 'REALIZADA', EM],
  ]);

  // Férias: Helena com Igor (atribuição); Tereza (C-021, C-022); Vítor ativo (C-022, RN-020).
  inserir('FERIAS_VENDEDOR', ['AUTO_ID', 'COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [10001, 10001, 'HELENA DUARTE', '2026-10-05', '2026-10-09', 10002, 'IGOR MATOS', 1],
    [10002, 10021, 'TEREZA LIMA', '2026-11-01', '2026-11-15', 10022, 'ULISSES REIS', 1],
    [10003, 10021, 'TEREZA LIMA', '2026-12-01', '2026-12-15', 10022, 'ULISSES REIS', 1],
    [10004, 10023, 'VÍTOR GOMES', '2026-10-20', '2026-11-10', 10024, 'XAVIER MELO', 1],
  ]);
}
