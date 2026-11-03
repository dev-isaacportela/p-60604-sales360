// Base comum a todas as specs: filiais (UFs de produção), BUs e seções.
// Os escopos das specs (BU_VENDEDOR etc.) apontam para estes códigos.

export function semear({ inserir }) {
  inserir('FILIAL', ['CODFILIAL', 'NOME_FILIAL', 'UF', 'ATIVO'], [
    ['1', 'Filial 1 · Brasília', 'DF', 1],
    ['2', 'Filial 2 · Goiânia', 'GO', 1],
    ['3', 'Filial 3 · Taguatinga', 'DF', 1],
    ['4', 'Filial 4 · Anápolis', 'GO', 1],
    ['6', 'Filial 6 · Palmas', 'TO', 1],
    ['8', 'Filial 8 · Porto Alegre', 'RS', 0],
  ]);
  // Correspondência fixa departamento ↔ unidade do planejamento (spec 007, RN-010).
  inserir('BU', ['CODIGO', 'NOME', 'ATIVO'], [
    ['1', 'Nutrição', 1],
    ['2', 'Enfermagem', 1],
    ['8', 'Medicamento', 1],
    ['9', 'Estética e Injetáveis', 1],
  ]);
  inserir('SECAO', ['ID', 'NOME_SECAO', 'ID_BU', 'ATIVO'], [
    [101, 'Dietas enterais', 1, 1],
    [102, 'Suplementos', 1, 1],
    [201, 'Curativos', 2, 1],
    [801, 'Genéricos', 3, 1],
    [901, 'Toxinas', 4, 1],
  ]);
}
