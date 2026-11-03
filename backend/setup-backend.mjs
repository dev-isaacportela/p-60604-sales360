import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  createServerFunctionMitra,
  createRecordsBatchMitra,
  listServerFunctionsMitra
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);

async function createBackend() {
  console.log('=== Criando tabelas ===');

  // 1. CARGOS
  await runDdlMitra({ projectId, sql: `CREATE TABLE CARGOS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    NOME VARCHAR(100) NOT NULL,
    DESCRICAO VARCHAR(300)
  );` });
  console.log('Tabela CARGOS criada');

  // 2. PERFIL_TELAS
  await runDdlMitra({ projectId, sql: `CREATE TABLE PERFIL_TELAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CARGO_ID INT NOT NULL,
    TELA VARCHAR(100) NOT NULL,
    CATEGORIA VARCHAR(100),
    ORDEM INT DEFAULT 0,
    FOREIGN KEY (CARGO_ID) REFERENCES CARGOS(ID)
  );` });
  console.log('Tabela PERFIL_TELAS criada');

  // 3. CLIENTES
  await runDdlMitra({ projectId, sql: `CREATE TABLE CLIENTES (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    RAZAO_SOCIAL VARCHAR(300) NOT NULL,
    NOME_FANTASIA VARCHAR(300),
    CNPJ VARCHAR(20),
    ENDERECO VARCHAR(500),
    CIDADE VARCHAR(200),
    UF VARCHAR(2),
    SEGMENTO VARCHAR(100),
    STATUS VARCHAR(20) DEFAULT 'ATIVO',
    TELEFONE VARCHAR(20),
    EMAIL VARCHAR(200),
    VENDEDOR_ID INT,
    CRIADO_EM VARCHAR(19)
  );` });
  console.log('Tabela CLIENTES criada');

  // 4. VISITAS
  await runDdlMitra({ projectId, sql: `CREATE TABLE VISITAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CLIENTE_ID INT NOT NULL,
    VENDEDOR_ID INT NOT NULL,
    DATA_AGENDADA VARCHAR(10) NOT NULL,
    HORA_INICIO VARCHAR(5),
    HORA_FIM VARCHAR(5),
    TIPO VARCHAR(50),
    STATUS VARCHAR(20) DEFAULT 'AGENDADA',
    CHECKIN_HORA VARCHAR(19),
    CHECKOUT_HORA VARCHAR(19),
    RELATO TEXT,
    CRIADO_EM VARCHAR(19),
    FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID)
  );` });
  console.log('Tabela VISITAS criada');

  // 5. TAREFAS
  await runDdlMitra({ projectId, sql: `CREATE TABLE TAREFAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    VENDEDOR_ID INT NOT NULL,
    TITULO VARCHAR(300) NOT NULL,
    DESCRICAO TEXT,
    STATUS VARCHAR(20) DEFAULT 'PENDENTE',
    PRIORIDADE VARCHAR(10) DEFAULT 'MEDIA',
    DATA_LIMITE VARCHAR(10),
    CRIADO_EM VARCHAR(19)
  );` });
  console.log('Tabela TAREFAS criada');

  // 6. PRODUTOS
  await runDdlMitra({ projectId, sql: `CREATE TABLE PRODUTOS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CODIGO VARCHAR(20),
    NOME VARCHAR(300) NOT NULL,
    CATEGORIA VARCHAR(100),
    PRECO_TABELA DECIMAL(10,2),
    CUSTO DECIMAL(10,2),
    UNIDADE VARCHAR(20) DEFAULT 'UN',
    ATIVO BOOLEAN DEFAULT TRUE
  );` });
  console.log('Tabela PRODUTOS criada');

  // 7. SIMULACOES
  await runDdlMitra({ projectId, sql: `CREATE TABLE SIMULACOES (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    CLIENTE_ID INT NOT NULL,
    VENDEDOR_ID INT NOT NULL,
    DATA_SIMULACAO VARCHAR(10),
    STATUS VARCHAR(20) DEFAULT 'RASCUNHO',
    VALOR_TOTAL DECIMAL(12,2) DEFAULT 0,
    MARGEM_MEDIA DECIMAL(5,2) DEFAULT 0,
    OBSERVACOES TEXT,
    CRIADO_EM VARCHAR(19),
    FOREIGN KEY (CLIENTE_ID) REFERENCES CLIENTES(ID)
  );` });
  console.log('Tabela SIMULACOES criada');

  // 8. SIMULACAO_ITENS
  await runDdlMitra({ projectId, sql: `CREATE TABLE SIMULACAO_ITENS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    SIMULACAO_ID INT NOT NULL,
    PRODUTO_ID INT NOT NULL,
    QUANTIDADE INT DEFAULT 1,
    PRECO_UNITARIO DECIMAL(10,2),
    DESCONTO_PERC DECIMAL(5,2) DEFAULT 0,
    FOREIGN KEY (SIMULACAO_ID) REFERENCES SIMULACOES(ID),
    FOREIGN KEY (PRODUTO_ID) REFERENCES PRODUTOS(ID)
  );` });
  console.log('Tabela SIMULACAO_ITENS criada');

  // 9. METAS
  await runDdlMitra({ projectId, sql: `CREATE TABLE METAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    VENDEDOR_ID INT NOT NULL,
    MES INT NOT NULL,
    ANO INT NOT NULL,
    VALOR_META DECIMAL(12,2),
    VALOR_REALIZADO DECIMAL(12,2) DEFAULT 0
  );` });
  console.log('Tabela METAS criada');

  // 10. COMISSOES
  await runDdlMitra({ projectId, sql: `CREATE TABLE COMISSOES (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    VENDEDOR_ID INT NOT NULL,
    MES INT NOT NULL,
    ANO INT NOT NULL,
    VALOR_VENDAS DECIMAL(12,2),
    PERC_COMISSAO DECIMAL(5,2),
    VALOR_COMISSAO DECIMAL(12,2)
  );` });
  console.log('Tabela COMISSOES criada');

  // ===== POPULAR DADOS SAMPLE =====
  console.log('\n=== Populando dados sample ===');

  // Cargos
  await createRecordsBatchMitra({ projectId, tableName: 'CARGOS', records: [
    { NOME: 'Vendedor Externo', DESCRICAO: 'Representante comercial autonomo' },
    { NOME: 'Supervisor', DESCRICAO: 'Gestor de equipe de vendas' },
    { NOME: 'Administrador', DESCRICAO: 'Administrador do sistema' },
  ] });
  console.log('Cargos criados');

  // Perfil Telas (Vendedor = cargo 1)
  await createRecordsBatchMitra({ projectId, tableName: 'PERFIL_TELAS', records: [
    { CARGO_ID: 1, TELA: 'Dashboard', CATEGORIA: 'Principal', ORDEM: 1 },
    { CARGO_ID: 1, TELA: 'Agenda', CATEGORIA: 'Principal', ORDEM: 2 },
    { CARGO_ID: 1, TELA: 'Carteira', CATEGORIA: 'Principal', ORDEM: 3 },
    { CARGO_ID: 1, TELA: 'Tarefas', CATEGORIA: 'Principal', ORDEM: 4 },
    { CARGO_ID: 1, TELA: 'Simulacao', CATEGORIA: 'Vendas', ORDEM: 5 },
    { CARGO_ID: 1, TELA: 'Analytics', CATEGORIA: 'Vendas', ORDEM: 6 },
    // Supervisor = cargo 2 (tudo)
    { CARGO_ID: 2, TELA: 'Dashboard', CATEGORIA: 'Principal', ORDEM: 1 },
    { CARGO_ID: 2, TELA: 'Agenda', CATEGORIA: 'Principal', ORDEM: 2 },
    { CARGO_ID: 2, TELA: 'Carteira', CATEGORIA: 'Principal', ORDEM: 3 },
    { CARGO_ID: 2, TELA: 'Tarefas', CATEGORIA: 'Principal', ORDEM: 4 },
    { CARGO_ID: 2, TELA: 'Simulacao', CATEGORIA: 'Vendas', ORDEM: 5 },
    { CARGO_ID: 2, TELA: 'Analytics', CATEGORIA: 'Vendas', ORDEM: 6 },
    // Admin = cargo 3 (tudo)
    { CARGO_ID: 3, TELA: 'Dashboard', CATEGORIA: 'Principal', ORDEM: 1 },
    { CARGO_ID: 3, TELA: 'Agenda', CATEGORIA: 'Principal', ORDEM: 2 },
    { CARGO_ID: 3, TELA: 'Carteira', CATEGORIA: 'Principal', ORDEM: 3 },
    { CARGO_ID: 3, TELA: 'Tarefas', CATEGORIA: 'Principal', ORDEM: 4 },
    { CARGO_ID: 3, TELA: 'Simulacao', CATEGORIA: 'Vendas', ORDEM: 5 },
    { CARGO_ID: 3, TELA: 'Analytics', CATEGORIA: 'Vendas', ORDEM: 6 },
  ] });
  console.log('Perfis de tela criados');

  // Clientes (30 clientes realistas - mercado de nutricao/suplementos)
  const now = new Date().toISOString().slice(0, 19);
  await createRecordsBatchMitra({ projectId, tableName: 'CLIENTES', records: [
    { RAZAO_SOCIAL: 'Farmacia Vida & Saude Ltda', NOME_FANTASIA: 'Vida & Saude', CNPJ: '12.345.678/0001-01', ENDERECO: 'Rua das Flores, 123', CIDADE: 'Sao Paulo', UF: 'SP', SEGMENTO: 'Farmacias', STATUS: 'ATIVO', TELEFONE: '(11) 3456-7890', EMAIL: 'contato@vidasaude.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'NutriFit Suplementos SA', NOME_FANTASIA: 'NutriFit', CNPJ: '23.456.789/0001-02', ENDERECO: 'Av. Paulista, 1000', CIDADE: 'Sao Paulo', UF: 'SP', SEGMENTO: 'Lojas Especializadas', STATUS: 'ATIVO', TELEFONE: '(11) 2345-6789', EMAIL: 'compras@nutrifit.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Supermercado Bom Preco Ltda', NOME_FANTASIA: 'Bom Preco', CNPJ: '34.567.890/0001-03', ENDERECO: 'Rua Central, 456', CIDADE: 'Campinas', UF: 'SP', SEGMENTO: 'Supermercados', STATUS: 'ATIVO', TELEFONE: '(19) 3456-7890', EMAIL: 'compras@bompreco.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Rede Saude Total SA', NOME_FANTASIA: 'Saude Total', CNPJ: '45.678.901/0001-04', ENDERECO: 'Av. Brasil, 789', CIDADE: 'Rio de Janeiro', UF: 'RJ', SEGMENTO: 'Farmacias', STATUS: 'ATIVO', TELEFONE: '(21) 2345-6789', EMAIL: 'compras@saudetotal.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Emporio Natural Ltda', NOME_FANTASIA: 'Emporio Natural', CNPJ: '56.789.012/0001-05', ENDERECO: 'Rua Verde, 321', CIDADE: 'Belo Horizonte', UF: 'MG', SEGMENTO: 'Lojas Especializadas', STATUS: 'ATIVO', TELEFONE: '(31) 3456-7890', EMAIL: 'vendas@emporionatural.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'GymPower Distribuidora', NOME_FANTASIA: 'GymPower', CNPJ: '67.890.123/0001-06', ENDERECO: 'Rua Fitness, 100', CIDADE: 'Curitiba', UF: 'PR', SEGMENTO: 'Distribuidores', STATUS: 'ATIVO', TELEFONE: '(41) 2345-6789', EMAIL: 'contato@gympower.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Farmacia Popular Ltda', NOME_FANTASIA: 'Farmacia Popular', CNPJ: '78.901.234/0001-07', ENDERECO: 'Av. Central, 555', CIDADE: 'Porto Alegre', UF: 'RS', SEGMENTO: 'Farmacias', STATUS: 'ATIVO', TELEFONE: '(51) 3456-7890', EMAIL: 'compras@farmaciapopular.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'BodyTech Store SA', NOME_FANTASIA: 'BodyTech', CNPJ: '89.012.345/0001-08', ENDERECO: 'Rua Esporte, 200', CIDADE: 'Florianopolis', UF: 'SC', SEGMENTO: 'Lojas Especializadas', STATUS: 'ATIVO', TELEFONE: '(48) 2345-6789', EMAIL: 'vendas@bodytech.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Supermercado Economia Ltda', NOME_FANTASIA: 'Economia', CNPJ: '90.123.456/0001-09', ENDERECO: 'Rua Principal, 789', CIDADE: 'Goiania', UF: 'GO', SEGMENTO: 'Supermercados', STATUS: 'INATIVO', TELEFONE: '(62) 3456-7890', EMAIL: 'contato@economia.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Atacadao Nutricional SA', NOME_FANTASIA: 'Atacadao', CNPJ: '01.234.567/0001-10', ENDERECO: 'Rod. BR-101, km 50', CIDADE: 'Salvador', UF: 'BA', SEGMENTO: 'Distribuidores', STATUS: 'ATIVO', TELEFONE: '(71) 2345-6789', EMAIL: 'compras@atacadaonutri.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Rede DrogaMais Ltda', NOME_FANTASIA: 'DrogaMais', CNPJ: '11.222.333/0001-11', ENDERECO: 'Av. Saude, 150', CIDADE: 'Recife', UF: 'PE', SEGMENTO: 'Farmacias', STATUS: 'ATIVO', TELEFONE: '(81) 3456-7890', EMAIL: 'compras@drogamais.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'VitaShop Comercio Ltda', NOME_FANTASIA: 'VitaShop', CNPJ: '22.333.444/0001-12', ENDERECO: 'Rua Vitamina, 88', CIDADE: 'Brasilia', UF: 'DF', SEGMENTO: 'Lojas Especializadas', STATUS: 'ATIVO', TELEFONE: '(61) 2345-6789', EMAIL: 'loja@vitashop.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Mercearia Sabor Natural', NOME_FANTASIA: 'Sabor Natural', CNPJ: '33.444.555/0001-13', ENDERECO: 'Rua Organica, 45', CIDADE: 'Manaus', UF: 'AM', SEGMENTO: 'Supermercados', STATUS: 'ATIVO', TELEFONE: '(92) 3456-7890', EMAIL: 'contato@sabornatural.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'ProHealth Distribuidora Ltda', NOME_FANTASIA: 'ProHealth', CNPJ: '44.555.666/0001-14', ENDERECO: 'Av. Industrial, 300', CIDADE: 'Fortaleza', UF: 'CE', SEGMENTO: 'Distribuidores', STATUS: 'ATIVO', TELEFONE: '(85) 2345-6789', EMAIL: 'comercial@prohealth.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
    { RAZAO_SOCIAL: 'Wellness Center SA', NOME_FANTASIA: 'Wellness', CNPJ: '55.666.777/0001-15', ENDERECO: 'Rua Bem-Estar, 222', CIDADE: 'Vitoria', UF: 'ES', SEGMENTO: 'Lojas Especializadas', STATUS: 'ATIVO', TELEFONE: '(27) 3456-7890', EMAIL: 'contato@wellness.com.br', VENDEDOR_ID: 1, CRIADO_EM: now },
  ] });
  console.log('Clientes criados (15)');

  // Produtos Benenutri (nutricao e suplementos)
  await createRecordsBatchMitra({ projectId, tableName: 'PRODUTOS', records: [
    { CODIGO: 'BEN-001', NOME: 'Whey Protein Concentrado 900g', CATEGORIA: 'Proteinas', PRECO_TABELA: 89.90, CUSTO: 42.50, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-002', NOME: 'Whey Protein Isolado 900g', CATEGORIA: 'Proteinas', PRECO_TABELA: 129.90, CUSTO: 62.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-003', NOME: 'Creatina Monohidratada 300g', CATEGORIA: 'Suplementos', PRECO_TABELA: 59.90, CUSTO: 25.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-004', NOME: 'BCAA 2:1:1 120caps', CATEGORIA: 'Aminoacidos', PRECO_TABELA: 49.90, CUSTO: 18.50, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-005', NOME: 'Glutamina 300g', CATEGORIA: 'Aminoacidos', PRECO_TABELA: 69.90, CUSTO: 30.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-006', NOME: 'Multivitaminico 60caps', CATEGORIA: 'Vitaminas', PRECO_TABELA: 39.90, CUSTO: 14.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-007', NOME: 'Vitamina C 1000mg 60caps', CATEGORIA: 'Vitaminas', PRECO_TABELA: 29.90, CUSTO: 10.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-008', NOME: 'Omega 3 120caps', CATEGORIA: 'Vitaminas', PRECO_TABELA: 44.90, CUSTO: 18.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-009', NOME: 'Pre-Treino Extreme 300g', CATEGORIA: 'Suplementos', PRECO_TABELA: 79.90, CUSTO: 35.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-010', NOME: 'Barra Proteica cx 12un', CATEGORIA: 'Snacks', PRECO_TABELA: 59.90, CUSTO: 28.00, UNIDADE: 'CX', ATIVO: true },
    { CODIGO: 'BEN-011', NOME: 'Albumina 500g', CATEGORIA: 'Proteinas', PRECO_TABELA: 34.90, CUSTO: 15.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-012', NOME: 'Colageno Hidrolisado 300g', CATEGORIA: 'Vitaminas', PRECO_TABELA: 54.90, CUSTO: 22.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-013', NOME: 'Hipercalorico 3kg', CATEGORIA: 'Proteinas', PRECO_TABELA: 119.90, CUSTO: 55.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-014', NOME: 'Caseina 900g', CATEGORIA: 'Proteinas', PRECO_TABELA: 109.90, CUSTO: 50.00, UNIDADE: 'UN', ATIVO: true },
    { CODIGO: 'BEN-015', NOME: 'Pasta de Amendoim 500g', CATEGORIA: 'Snacks', PRECO_TABELA: 24.90, CUSTO: 11.00, UNIDADE: 'UN', ATIVO: true },
  ] });
  console.log('Produtos criados (15)');

  // Visitas (dados para os proximos e ultimos meses)
  const hoje = new Date();
  const formatDate = (d) => d.toISOString().slice(0, 10);
  const visitasData = [];
  const tiposVisita = ['Prospecao', 'Reposicao', 'Relacionamento', 'Negociacao'];
  const statusVisita = ['CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'AGENDADA', 'AGENDADA', 'CANCELADA'];

  for (let i = -60; i < 30; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // pula fds
    const clienteId = (Math.abs(i) % 15) + 1;
    const status = i < 0 ? statusVisita[Math.abs(i) % 6] : (i === 0 ? 'EM_ANDAMENTO' : 'AGENDADA');
    const hora = `${8 + (Math.abs(i) % 8)}:${i % 2 === 0 ? '00' : '30'}`;
    const horaFim = `${9 + (Math.abs(i) % 8)}:${i % 2 === 0 ? '00' : '30'}`;

    visitasData.push({
      CLIENTE_ID: clienteId,
      VENDEDOR_ID: 1,
      DATA_AGENDADA: formatDate(d),
      HORA_INICIO: hora,
      HORA_FIM: horaFim,
      TIPO: tiposVisita[Math.abs(i) % 4],
      STATUS: status,
      CHECKIN_HORA: status === 'CONCLUIDA' ? `${formatDate(d)}T${hora}:00` : null,
      CHECKOUT_HORA: status === 'CONCLUIDA' ? `${formatDate(d)}T${horaFim}:00` : null,
      RELATO: status === 'CONCLUIDA' ? 'Visita realizada com sucesso. Cliente demonstrou interesse nos novos produtos.' : null,
      CRIADO_EM: now,
    });
  }
  // Inserir em lotes de 20
  for (let i = 0; i < visitasData.length; i += 20) {
    await createRecordsBatchMitra({ projectId, tableName: 'VISITAS', records: visitasData.slice(i, i + 20) });
  }
  console.log(`Visitas criadas (${visitasData.length})`);

  // Tarefas
  await createRecordsBatchMitra({ projectId, tableName: 'TAREFAS', records: [
    { VENDEDOR_ID: 1, TITULO: 'Enviar proposta para NutriFit', DESCRICAO: 'Preparar e enviar proposta de Whey Protein e Creatina', STATUS: 'PENDENTE', PRIORIDADE: 'ALTA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 2*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Atualizar cadastro Bom Preco', DESCRICAO: 'Atualizar dados de contato do Supermercado Bom Preco', STATUS: 'PENDENTE', PRIORIDADE: 'MEDIA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 5*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Reuniao com Saude Total', DESCRICAO: 'Agendar reuniao para apresentar linha de vitaminas', STATUS: 'EM_ANDAMENTO', PRIORIDADE: 'ALTA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 1*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Coletar feedback GymPower', DESCRICAO: 'Ligar para coletar feedback dos ultimos pedidos', STATUS: 'PENDENTE', PRIORIDADE: 'BAIXA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 7*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Preparar relatorio mensal', DESCRICAO: 'Consolidar dados de vendas do mes para apresentar ao supervisor', STATUS: 'PENDENTE', PRIORIDADE: 'MEDIA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 3*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Follow-up com Emporio Natural', DESCRICAO: 'Acompanhar entrega e satisfacao do ultimo pedido', STATUS: 'CONCLUIDA', PRIORIDADE: 'MEDIA', DATA_LIMITE: formatDate(new Date(hoje.getTime() - 2*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Cadastrar novo cliente Wellness', DESCRICAO: 'Finalizar cadastro e primeira visita', STATUS: 'CONCLUIDA', PRIORIDADE: 'ALTA', DATA_LIMITE: formatDate(new Date(hoje.getTime() - 5*86400000)), CRIADO_EM: now },
    { VENDEDOR_ID: 1, TITULO: 'Treinamento de produtos novos', DESCRICAO: 'Participar do treinamento sobre a nova linha de proteinas', STATUS: 'EM_ANDAMENTO', PRIORIDADE: 'MEDIA', DATA_LIMITE: formatDate(new Date(hoje.getTime() + 4*86400000)), CRIADO_EM: now },
  ] });
  console.log('Tarefas criadas');

  // Simulacoes
  await createRecordsBatchMitra({ projectId, tableName: 'SIMULACOES', records: [
    { CLIENTE_ID: 1, VENDEDOR_ID: 1, DATA_SIMULACAO: formatDate(new Date(hoje.getTime() - 10*86400000)), STATUS: 'FINALIZADA', VALOR_TOTAL: 2497.00, MARGEM_MEDIA: 48.50, OBSERVACOES: 'Pedido mensal regular', CRIADO_EM: now },
    { CLIENTE_ID: 2, VENDEDOR_ID: 1, DATA_SIMULACAO: formatDate(new Date(hoje.getTime() - 5*86400000)), STATUS: 'FINALIZADA', VALOR_TOTAL: 4890.00, MARGEM_MEDIA: 52.30, OBSERVACOES: 'Pedido grande para inauguracao', CRIADO_EM: now },
    { CLIENTE_ID: 3, VENDEDOR_ID: 1, DATA_SIMULACAO: formatDate(new Date(hoje.getTime() - 2*86400000)), STATUS: 'RASCUNHO', VALOR_TOTAL: 1250.00, MARGEM_MEDIA: 45.00, OBSERVACOES: 'Aguardando aprovacao do gerente', CRIADO_EM: now },
  ] });
  console.log('Simulacoes criadas');

  // Simulacao Itens
  await createRecordsBatchMitra({ projectId, tableName: 'SIMULACAO_ITENS', records: [
    { SIMULACAO_ID: 1, PRODUTO_ID: 1, QUANTIDADE: 10, PRECO_UNITARIO: 89.90, DESCONTO_PERC: 5 },
    { SIMULACAO_ID: 1, PRODUTO_ID: 3, QUANTIDADE: 15, PRECO_UNITARIO: 59.90, DESCONTO_PERC: 3 },
    { SIMULACAO_ID: 1, PRODUTO_ID: 6, QUANTIDADE: 20, PRECO_UNITARIO: 39.90, DESCONTO_PERC: 5 },
    { SIMULACAO_ID: 2, PRODUTO_ID: 1, QUANTIDADE: 30, PRECO_UNITARIO: 89.90, DESCONTO_PERC: 8 },
    { SIMULACAO_ID: 2, PRODUTO_ID: 2, QUANTIDADE: 20, PRECO_UNITARIO: 129.90, DESCONTO_PERC: 5 },
    { SIMULACAO_ID: 2, PRODUTO_ID: 9, QUANTIDADE: 10, PRECO_UNITARIO: 79.90, DESCONTO_PERC: 3 },
    { SIMULACAO_ID: 3, PRODUTO_ID: 10, QUANTIDADE: 10, PRECO_UNITARIO: 59.90, DESCONTO_PERC: 0 },
    { SIMULACAO_ID: 3, PRODUTO_ID: 15, QUANTIDADE: 20, PRECO_UNITARIO: 24.90, DESCONTO_PERC: 0 },
  ] });
  console.log('Itens de simulacao criados');

  // Metas (ultimos 6 meses)
  const metasData = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - m);
    metasData.push({
      VENDEDOR_ID: 1,
      MES: d.getMonth() + 1,
      ANO: d.getFullYear(),
      VALOR_META: 50000 + Math.floor(Math.random() * 10000),
      VALOR_REALIZADO: 35000 + Math.floor(Math.random() * 25000),
    });
  }
  await createRecordsBatchMitra({ projectId, tableName: 'METAS', records: metasData });
  console.log('Metas criadas');

  // Comissoes
  const comissoesData = metasData.map(m => ({
    VENDEDOR_ID: 1,
    MES: m.MES,
    ANO: m.ANO,
    VALOR_VENDAS: m.VALOR_REALIZADO,
    PERC_COMISSAO: 5.00,
    VALOR_COMISSAO: m.VALOR_REALIZADO * 0.05,
  }));
  await createRecordsBatchMitra({ projectId, tableName: 'COMISSOES', records: comissoesData });
  console.log('Comissoes criadas');

  // ===== CRIAR SERVER FUNCTIONS =====
  console.log('\n=== Criando Server Functions ===');

  // SF 1: Dashboard KPIs
  await createServerFunctionMitra({ projectId, name: 'dashboardKpis', type: 'SQL', code: `
SELECT
  (SELECT COALESCE(SUM(VALOR_REALIZADO),0) FROM METAS WHERE MES = MONTH(CURRENT_DATE) AND ANO = YEAR(CURRENT_DATE)) AS VENDAS_MES,
  (SELECT COALESCE(SUM(VALOR_META),0) FROM METAS WHERE MES = MONTH(CURRENT_DATE) AND ANO = YEAR(CURRENT_DATE)) AS META_MES,
  (SELECT COUNT(*) FROM VISITAS WHERE STATUS = 'CONCLUIDA' AND SUBSTRING(DATA_AGENDADA,1,7) = SUBSTRING(CURRENT_DATE,1,7)) AS VISITAS_MES,
  (SELECT COUNT(*) FROM CLIENTES WHERE STATUS = 'ATIVO') AS CLIENTES_ATIVOS
  `, description: 'KPIs do dashboard principal' });

  // SF 2: Vendas Mensais (12 meses)
  await createServerFunctionMitra({ projectId, name: 'vendasMensais', type: 'SQL', code: `
SELECT M.ANO, M.MES,
  CONCAT(M.ANO,'-',LPAD(M.MES,2,'0')) AS PERIODO,
  SUM(M.VALOR_META) AS META,
  SUM(M.VALOR_REALIZADO) AS REALIZADO
FROM METAS M
GROUP BY M.ANO, M.MES
ORDER BY M.ANO, M.MES
  `, description: 'Vendas mensais com meta e realizado' });

  // SF 3: Visitas por Status
  await createServerFunctionMitra({ projectId, name: 'visitasPorStatus', type: 'SQL', code: `
SELECT STATUS AS name, COUNT(*) AS value FROM VISITAS
WHERE SUBSTRING(DATA_AGENDADA,1,7) = SUBSTRING(CURRENT_DATE,1,7)
GROUP BY STATUS ORDER BY value DESC
  `, description: 'Distribuicao de visitas por status no mes atual' });

  // SF 4: Proximas Visitas
  await createServerFunctionMitra({ projectId, name: 'proximasVisitas', type: 'SQL', code: `
SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM, V.TIPO, V.STATUS,
  C.NOME_FANTASIA AS CLIENTE, C.CIDADE, C.UF
FROM VISITAS V
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
WHERE V.DATA_AGENDADA >= CURRENT_DATE AND V.STATUS IN ('AGENDADA','EM_ANDAMENTO')
ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
LIMIT 10
  `, description: 'Proximas visitas agendadas' });

  // SF 5: Listar Visitas por Periodo
  await createServerFunctionMitra({ projectId, name: 'listarVisitasPeriodo', type: 'SQL', code: `
SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM, V.TIPO, V.STATUS,
  V.CHECKIN_HORA, V.CHECKOUT_HORA, V.RELATO,
  C.ID AS CLIENTE_ID, C.NOME_FANTASIA AS CLIENTE, C.CIDADE
FROM VISITAS V
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
WHERE V.DATA_AGENDADA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
ORDER BY V.DATA_AGENDADA, V.HORA_INICIO
  `, description: 'Lista visitas em um periodo' });

  // SF 6: Buscar Clientes
  await createServerFunctionMitra({ projectId, name: 'buscarClientes', type: 'SQL', code: `
SELECT C.ID, C.RAZAO_SOCIAL, C.NOME_FANTASIA, C.CNPJ, C.CIDADE, C.UF,
  C.SEGMENTO, C.STATUS, C.TELEFONE, C.EMAIL, C.ENDERECO, C.VENDEDOR_ID
FROM CLIENTES C
WHERE ('{{busca}}' = '' OR C.RAZAO_SOCIAL LIKE '%{{busca}}%' OR C.NOME_FANTASIA LIKE '%{{busca}}%' OR C.CNPJ LIKE '%{{busca}}%')
  AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
  AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
ORDER BY C.NOME_FANTASIA
LIMIT {{limit}} OFFSET {{offset}}
  `, description: 'Busca clientes com filtros e paginacao' });

  // SF 7: Contar Clientes
  await createServerFunctionMitra({ projectId, name: 'contarClientes', type: 'SQL', code: `
SELECT COUNT(*) AS TOTAL FROM CLIENTES C
WHERE ('{{busca}}' = '' OR C.RAZAO_SOCIAL LIKE '%{{busca}}%' OR C.NOME_FANTASIA LIKE '%{{busca}}%' OR C.CNPJ LIKE '%{{busca}}%')
  AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
  AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
  `, description: 'Conta clientes com filtros' });

  // SF 8: Listar Produtos
  await createServerFunctionMitra({ projectId, name: 'listarProdutos', type: 'SQL', code: `
SELECT ID, CODIGO, NOME, CATEGORIA, PRECO_TABELA, CUSTO, UNIDADE, ATIVO
FROM PRODUTOS WHERE ATIVO = true
ORDER BY NOME
  `, description: 'Lista todos os produtos ativos' });

  // SF 9: Listar Simulacoes por Cliente
  await createServerFunctionMitra({ projectId, name: 'listarSimulacoes', type: 'SQL', code: `
SELECT S.ID, S.DATA_SIMULACAO, S.STATUS, S.VALOR_TOTAL, S.MARGEM_MEDIA, S.OBSERVACOES,
  C.NOME_FANTASIA AS CLIENTE
FROM SIMULACOES S
JOIN CLIENTES C ON C.ID = S.CLIENTE_ID
WHERE ('{{clienteId}}' = '' OR S.CLIENTE_ID = {{clienteId}})
ORDER BY S.DATA_SIMULACAO DESC
LIMIT {{limit}} OFFSET {{offset}}
  `, description: 'Lista simulacoes com filtro por cliente' });

  // SF 10: Itens de Simulacao
  await createServerFunctionMitra({ projectId, name: 'itensSimulacao', type: 'SQL', code: `
SELECT SI.ID, SI.QUANTIDADE, SI.PRECO_UNITARIO, SI.DESCONTO_PERC,
  P.NOME AS PRODUTO, P.CODIGO, P.CATEGORIA, P.CUSTO
FROM SIMULACAO_ITENS SI
JOIN PRODUTOS P ON P.ID = SI.PRODUTO_ID
WHERE SI.SIMULACAO_ID = {{simulacaoId}}
  `, description: 'Itens de uma simulacao' });

  // SF 11: Listar Tarefas
  await createServerFunctionMitra({ projectId, name: 'listarTarefas', type: 'SQL', code: `
SELECT ID, TITULO, DESCRICAO, STATUS, PRIORIDADE, DATA_LIMITE, CRIADO_EM
FROM TAREFAS
WHERE VENDEDOR_ID = :VAR_USER
  AND ('{{status}}' = '' OR STATUS = '{{status}}')
  AND ('{{prioridade}}' = '' OR PRIORIDADE = '{{prioridade}}')
ORDER BY
  CASE STATUS WHEN 'PENDENTE' THEN 1 WHEN 'EM_ANDAMENTO' THEN 2 WHEN 'CONCLUIDA' THEN 3 END,
  CASE PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'BAIXA' THEN 3 END,
  DATA_LIMITE
  `, description: 'Lista tarefas do vendedor logado' });

  // SF 12: Contar Tarefas Pendentes
  await createServerFunctionMitra({ projectId, name: 'contarTarefasPendentes', type: 'SQL', code: `
SELECT COUNT(*) AS TOTAL FROM TAREFAS WHERE STATUS IN ('PENDENTE','EM_ANDAMENTO')
  `, description: 'Conta tarefas pendentes para badge no menu' });

  // SF 13: Check-in Visita
  await createServerFunctionMitra({ projectId, name: 'checkinVisita', type: 'SQL', code: `
UPDATE VISITAS SET STATUS = 'EM_ANDAMENTO', CHECKIN_HORA = '{{checkinHora}}' WHERE ID = {{visitaId}}
  `, description: 'Registra check-in de visita' });

  // SF 14: Check-out Visita
  await createServerFunctionMitra({ projectId, name: 'checkoutVisita', type: 'SQL', code: `
UPDATE VISITAS SET STATUS = 'CONCLUIDA', CHECKOUT_HORA = '{{checkoutHora}}', RELATO = '{{relato}}' WHERE ID = {{visitaId}}
  `, description: 'Registra check-out com relato' });

  // SF 15: Atualizar Status Tarefa
  await createServerFunctionMitra({ projectId, name: 'atualizarStatusTarefa', type: 'SQL', code: `
UPDATE TAREFAS SET STATUS = '{{novoStatus}}' WHERE ID = {{tarefaId}}
  `, description: 'Atualiza status de uma tarefa' });

  // SF 16: Analytics - Vendas por Vendedor (raiz)
  await createServerFunctionMitra({ projectId, name: 'analyticsVendasVendedor', type: 'SQL', code: `
SELECT 'Vendedor 1' AS name, SUM(VALOR_REALIZADO) AS value
FROM METAS GROUP BY VENDEDOR_ID ORDER BY value DESC
  `, description: 'Vendas por vendedor para analytics' });

  // SF 17: Analytics - Vendas por Categoria
  await createServerFunctionMitra({ projectId, name: 'analyticsVendasCategoria', type: 'SQL', code: `
SELECT P.CATEGORIA AS name, SUM(SI.QUANTIDADE * SI.PRECO_UNITARIO * (1 - SI.DESCONTO_PERC/100)) AS value
FROM SIMULACAO_ITENS SI
JOIN PRODUTOS P ON P.ID = SI.PRODUTO_ID
JOIN SIMULACOES S ON S.ID = SI.SIMULACAO_ID
WHERE S.STATUS = 'FINALIZADA'
GROUP BY P.CATEGORIA ORDER BY value DESC
  `, description: 'Vendas por categoria de produto' });

  // SF 18: Analytics - Evolucao Mensal
  await createServerFunctionMitra({ projectId, name: 'analyticsEvolucaoMensal', type: 'SQL', code: `
SELECT CONCAT(ANO,'-',LPAD(MES,2,'0')) AS name, SUM(VALOR_REALIZADO) AS value
FROM METAS GROUP BY ANO, MES ORDER BY ANO, MES
  `, description: 'Evolucao mensal de vendas' });

  // SF 19: Analytics - Mix de Produtos
  await createServerFunctionMitra({ projectId, name: 'analyticsMixProdutos', type: 'SQL', code: `
SELECT P.NOME AS name, SUM(SI.QUANTIDADE) AS value
FROM SIMULACAO_ITENS SI
JOIN PRODUTOS P ON P.ID = SI.PRODUTO_ID
JOIN SIMULACOES S ON S.ID = SI.SIMULACAO_ID
WHERE S.STATUS = 'FINALIZADA'
GROUP BY P.NOME ORDER BY value DESC LIMIT 8
  `, description: 'Mix de produtos mais vendidos' });

  // SF 20: Visitas do Dia (agenda)
  await createServerFunctionMitra({ projectId, name: 'visitasDoDia', type: 'SQL', code: `
SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.HORA_FIM, V.TIPO, V.STATUS,
  V.CHECKIN_HORA, V.CHECKOUT_HORA, V.RELATO,
  C.ID AS CLIENTE_ID, C.NOME_FANTASIA AS CLIENTE, C.CIDADE, C.ENDERECO
FROM VISITAS V
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
WHERE V.DATA_AGENDADA = '{{data}}'
ORDER BY V.HORA_INICIO
  `, description: 'Visitas agendadas para uma data especifica' });

  // SF 21: Cancelar Visita
  await createServerFunctionMitra({ projectId, name: 'cancelarVisita', type: 'SQL', code: `
UPDATE VISITAS SET STATUS = 'CANCELADA' WHERE ID = {{visitaId}}
  `, description: 'Cancela uma visita' });

  // SF 22: Historico Visitas do Cliente
  await createServerFunctionMitra({ projectId, name: 'historicoVisitasCliente', type: 'SQL', code: `
SELECT V.ID, V.DATA_AGENDADA, V.HORA_INICIO, V.TIPO, V.STATUS, V.RELATO
FROM VISITAS V
WHERE V.CLIENTE_ID = {{clienteId}}
  AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
  AND (
    '{{periodoDias}}' = 'ALL'
    OR V.DATA_AGENDADA >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL {{periodoDias}} DAY), '%Y-%m-%d')
  )
ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC
LIMIT {{limit}} OFFSET {{offset}}
  `, description: 'Historico de visitas de um cliente' });

  // Listar SFs criadas
  const sfs = await listServerFunctionsMitra({ projectId });
  console.log('\n=== Server Functions criadas ===');
  sfs.result.forEach(sf => console.log(`  SF ${sf.id}: ${sf.name} (${sf.type})`));

  console.log('\n=== Backend criado com sucesso! ===');
}

createBackend().catch(err => {
  console.error('ERRO:', err.message || err);
  process.exit(1);
});
