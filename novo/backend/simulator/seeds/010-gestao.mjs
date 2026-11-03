// Dados da spec 010 (gestão, coordenação e diretoria), conforme a tabela
// "Seed" de docs/specs/010-gestao-diretoria/plan.md. Ids escolhidos e RCAs na
// faixa 10001+; usuários novos por ctx.usuario (o smoke acha pelo e-mail).
//
// Coordenador, férias e executivas: filial 1 · Nutrição. Painel de Gestão e
// Gestão Cadastros foram cancelados (D4, 2026-11-03): sem vendas, metas nem comissões.

const EM = '2026-10-01 08:00:00';

export function semear({ inserir, usuario }) {
  const u = (nome) => usuario(nome, `${nome.split(' ').map((p) => p.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).join('.')}@benenutri.local`);
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

  // BU 13 recebe escopo e é inativada no smoke, como faria a carga do ERP (RN-012).
  inserir('BU', ['CODIGO', 'NOME', 'ATIVO'], [['12', 'Odontologia', 1], ['13', 'Veterinária', 1]]);
  inserir('SECAO', ['ID', 'NOME_SECAO', 'ID_BU', 'ATIVO'], [
    [10001, 'Seção 1', 1, 1], [10002, 'Seção 2', 1, 1], [10003, 'Seção 3', 1, 1],
  ]);

  const vendedores = [NINA, OLGA, PEDRO, TEREZA, ULISSES, VITOR, XAVIER, YARA, JOANA, RENATA];
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...vendedores.map((id) => [id, 'VENDEDOR', EM]),
    [RUI, 'GESTOR', EM],
    [CARLOS, 'COORDENADOR', EM],
  ]);

  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [
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
    ['1', NINA, 1, '1', 10002, EM],
    ['13', NINA, 1, '1', null, EM],
    ...[TEREZA, ULISSES, VITOR, XAVIER, YARA, JOANA].map((id) => ['1', id, 1, '1', null, EM]),
    ['8', RENATA, 1, '3', null, EM],
  ]);

  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [10045, 'Carlos Viana', 'carlos.viana@benenutri.local', CARLOS, 1],
  ]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[10045, 1, 1]]);

  // Férias: Tereza (C-021, C-022); Vítor ativo (C-022, RN-020).
  inserir('FERIAS_VENDEDOR', ['AUTO_ID', 'COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [10002, 10021, 'TEREZA LIMA', '2026-11-01', '2026-11-15', 10022, 'ULISSES REIS', 1],
    [10003, 10021, 'TEREZA LIMA', '2026-12-01', '2026-12-15', 10022, 'ULISSES REIS', 1],
    [10004, 10023, 'VÍTOR GOMES', '2026-10-20', '2026-11-10', 10024, 'XAVIER MELO', 1],
  ]);

  // Gestão de Carteira (etapa 2): BU 15 Ortopedia só desta spec. Célia
  // coordena F1·15 e F2·15; Wagner atua em F3·15, fora dela (RN-017).
  const CELIA = u('Célia Rocha');
  const LARA = u('Lara Pinto');
  const MAURO = u('Mauro Teles');
  const OTTO = u('Otto Brito');
  const ZILDA = u('Zilda Faria');
  const WAGNER = u('Wagner Lopes');
  const equipe = [LARA, MAURO, OTTO, ZILDA, WAGNER];

  inserir('BU', ['ID', 'CODIGO', 'NOME', 'ATIVO'], [[10015, '15', 'Ortopedia', 1]]);
  inserir('SECAO', ['ID', 'NOME_SECAO', 'ID_BU', 'ATIVO'], [[10011, 'Órteses', 10015, 1], [10012, 'Próteses', 10015, 1]]);
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...equipe.map((id) => [id, 'VENDEDOR', EM]), [CELIA, 'COORDENADOR', EM],
  ]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], equipe.map((id, i) => [id, 10201 + i, 10049]));
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [10049, 'Célia Rocha', 'celia.rocha@benenutri.local', CELIA, 1],
  ]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[10049, 1, 15], [10049, 2, 15]]);
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ['15', LARA, 1, '1', 10011, EM], ['15', MAURO, 1, '1', 10011, EM], ['15', OTTO, 1, '2', null, EM],
    ['15', ZILDA, 1, '1', 10011, EM], ['15', ZILDA, 1, '2', 10011, EM], ['15', WAGNER, 1, '3', null, EM],
  ]);

  // Clientes 10101–10140 (Lara; Mauro já tem 10101–10103: C-019), 10141 (Wagner,
  // F3), 10142 (Otto, F2), disponíveis 10150–10160 e um Pessoa Física (10161).
  const ids = (de, ate) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const clientes = [...ids(10101, 10142), ...ids(10150, 10161)];
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'CIDADE', 'UF', 'STATUS'], clientes.map((id) => [
    id, `Ortopedia ${id} Ltda`, id >= 10150 ? `Clínica Órtese ${id}` : `Ortopédica ${id}`,
    `55${String(id).padStart(12, '0')}`, 'Brasília', 'DF', 'ATIVO',
  ]));
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'], clientes.map((id) => [
    id, `ORTOPEDIA ${id}`, id === 10161 ? 'PESSOA FISICA' : id % 2 ? 'HOSPITAL' : 'FARMACIA', 'DF', 'BRASILIA',
  ]));
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CRIADO_EM', 'CODFILIAL', 'ID_SECAO'], [
    ...ids(10101, 10140).map((id) => [id, LARA, EM, '1', 10011]),
    ...ids(10101, 10103).map((id) => [id, MAURO, EM, '1', 10011]),
    [10141, WAGNER, EM, '3', null],
    [10142, OTTO, EM, '2', 10011],
  ]);
}
