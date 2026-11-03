// Tabelas de PRODUCAO que a spec 004 (atividades) le e grava — so para o
// simulador. NAO e publicado: as tabelas ja existem no Mitra.
// TAREFAS esta em 001-acesso.mjs. Um template literal por tabela.

export const TABELAS = [
  // DDL de backend/hotfix-agenda-historico-atividades-mix.mjs. A FK nao tem
  // cascata: excluir atividade apaga o log antes (s360AtividadeExcluir).
  `CREATE TABLE IF NOT EXISTS ATIVIDADES_LOG (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    ID_ATIVIDADE INT NOT NULL,
    CAMPO_ALTERADO VARCHAR(80) NOT NULL,
    VALOR_ANTERIOR VARCHAR(255),
    VALOR_NOVO VARCHAR(255),
    DATA_ALTERACAO VARCHAR(19) NOT NULL,
    ID_USUARIO INT NOT NULL,
    FOREIGN KEY (ID_ATIVIDADE) REFERENCES TAREFAS(ID)
  )`,

  // DDL de backend/fix-google-agenda-fila-e-put.mjs. Dona: spec 003 (processa);
  // a 004 so enfileira. Se a 003 declarar tambem, uma copia sai no merge.
  `CREATE TABLE IF NOT EXISTS GOOGLE_AGENDA_FILA (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    ENTIDADE VARCHAR(20) NOT NULL,
    ENTIDADE_ID INT NOT NULL,
    SOLICITADO_EM VARCHAR(19),
    PROCESSADO_EM VARCHAR(19) NULL,
    TENTATIVAS INT DEFAULT 0,
    ULTIMO_ERRO VARCHAR(500) NULL,
    UNIQUE KEY UK_FILA_ITEM (ENTIDADE, ENTIDADE_ID)
  )`,
];
