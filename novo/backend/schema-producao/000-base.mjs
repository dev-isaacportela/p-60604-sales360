// Tabelas-base de produção lidas por várias specs — só para o simulador.
// Contrato: docs/specs/000-visao-geral/modelo-de-dados.md. Não é publicado.
// Uma tabela mora num arquivo só de schema-producao/: antes de declarar uma
// tabela numa spec nova, procure se ela já está aqui ou em outro arquivo.

export const TABELAS = [
  `CREATE TABLE IF NOT EXISTS FILIAL (
    CODFILIAL VARCHAR(10) NOT NULL PRIMARY KEY,
    NOME_FILIAL VARCHAR(100) NOT NULL,
    ATIVO BOOLEAN DEFAULT TRUE,
    CRIADO_EM VARCHAR(19) NULL,
    ATUALIZADO_EM VARCHAR(19) NULL,
    UF VARCHAR(20) NULL
  )`,

  // Unidade de negócio = departamento do ERP (CODIGO = CODEPTO).
  `CREATE TABLE IF NOT EXISTS BU (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODIGO VARCHAR(100) NOT NULL,
    NOME VARCHAR(150) NOT NULL,
    ATIVO BOOLEAN DEFAULT TRUE,
    CRIADO_EM VARCHAR(19) NULL,
    ATUALIZADO_EM VARCHAR(19) NULL,
    UNIQUE KEY UX_BU_CODIGO (CODIGO)
  )`,

  // ID = código da seção no ERP (sem auto-incremento).
  `CREATE TABLE IF NOT EXISTS SECAO (
    ID INT NOT NULL PRIMARY KEY,
    NOME_SECAO VARCHAR(100) NOT NULL,
    ID_BU INT NULL,
    ATIVO BOOLEAN DEFAULT TRUE,
    CRIADO_EM VARCHAR(19) NULL,
    ATUALIZADO_EM VARCHAR(19) NULL,
    UNIQUE KEY UX_SECAO_NOME_BU (NOME_SECAO, ID_BU),
    INDEX IX_SECAO_BU (ID_BU)
  )`,
];
