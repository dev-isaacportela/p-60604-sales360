// Compatibilidade MySQL -> SQLite.
//
// As server functions do projeto sao escritas em MySQL e publicadas assim no
// Mitra. O simulador executa ESSE MESMO SQL, sem reimplementar nada em JS: e a
// unica forma de o teste local dizer alguma coisa sobre o que roda em producao.
// Aqui ficam as duas pontas dessa traducao:
//
//   registerMysqlFunctions(db) -> funcoes que o SQLite nao tem, registradas
//                                 como funcao escalar (STR_TO_DATE, FIELD...)
//   toSqlite(sql)              -> reescrita sintatica do que nao cabe em funcao
//                                 escalar (INTERVAL, CAST AS UNSIGNED...)
//
// Tudo que for traduzido tem que preservar o SIGNIFICADO, nunca so evitar o
// erro de sintaxe: um shim que devolve valor plausivel e errado transforma o
// simulador em fonte de falso positivo.

const MYSQL_TO_LUXON = [
  ['%Y', 'yyyy'],
  ['%m', 'MM'],
  ['%d', 'dd'],
  ['%H', 'HH'],
  ['%i', 'mm'],
  ['%s', 'ss'],
];

/** '%Y-%m-%dT%H:%i:%s' -> regex nomeada, para ler a data com o formato dado. */
function parseWithFormat(text, format) {
  if (text == null) return null;
  const value = String(text);
  let pattern = '';
  const order = [];
  for (let i = 0; i < format.length; i += 1) {
    if (format[i] === '%' && i + 1 < format.length) {
      const token = format.slice(i, i + 2);
      const known = MYSQL_TO_LUXON.find(([mysql]) => mysql === token);
      if (!known) return null;
      order.push(token);
      pattern += token === '%Y' ? '(\\d{4})' : '(\\d{2})';
      i += 1;
      continue;
    }
    pattern += format[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const match = value.match(new RegExp(`^${pattern}`));
  if (!match) return null;
  const parts = { '%Y': 1970, '%m': 1, '%d': 1, '%H': 0, '%i': 0, '%s': 0 };
  order.forEach((token, index) => { parts[token] = Number(match[index + 1]); });
  const date = new Date(Date.UTC(parts['%Y'], parts['%m'] - 1, parts['%d'], parts['%H'], parts['%i'], parts['%s']));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date, format) {
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return format
    .replace(/%Y/g, String(date.getUTCFullYear()))
    .replace(/%m/g, pad(date.getUTCMonth() + 1))
    .replace(/%d/g, pad(date.getUTCDate()))
    .replace(/%H/g, pad(date.getUTCHours()))
    .replace(/%i/g, pad(date.getUTCMinutes()))
    .replace(/%s/g, pad(date.getUTCSeconds()));
}

const ISO = '%Y-%m-%dT%H:%i:%s';

/** Le uma data vinda do banco: as colunas do projeto guardam ISO sem timezone. */
function readDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const direct = parseWithFormat(text, ISO);
  if (direct) return direct;
  const dateOnly = parseWithFormat(text, '%Y-%m-%d');
  if (dateOnly) return dateOnly;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const UNIT_MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
};

export function registerMysqlFunctions(db, { now = () => new Date() } = {}) {
  const def = (name, arity, fn) => db.function(name, { deterministic: false, varargs: arity == null }, fn);

  def('NOW', 0, () => formatDate(now(), ISO));
  def('CURDATE', 0, () => formatDate(now(), '%Y-%m-%d'));

  def('STR_TO_DATE', 2, (text, format) => {
    const date = parseWithFormat(text, String(format ?? ISO));
    // Devolve ISO: comparacao entre dois resultados de STR_TO_DATE continua
    // correta porque ISO e lexicograficamente ordenavel.
    return date ? formatDate(date, ISO) : null;
  });

  def('DATE_FORMAT', 2, (value, format) => {
    const date = readDate(value);
    return date ? formatDate(date, String(format ?? ISO)) : null;
  });

  // DATE_SUB/DATE_ADD chegam aqui ja normalizados por toSqlite(), que troca
  // `INTERVAL 30 DAY` por dois argumentos escalares.
  def('MITRA_DATE_ADD', 3, (value, amount, unit) => {
    const date = readDate(value);
    if (!date) return null;
    const step = UNIT_MS[String(unit).toUpperCase()];
    if (!step) return null;
    return formatDate(new Date(date.getTime() + Number(amount) * step), ISO);
  });

  // DATEDIFF(fim, inicio) -> dias inteiros. O CRM mede atraso com ele.
  def('DATEDIFF', 2, (fim, inicio) => {
    const a = readDate(fim);
    const b = readDate(inicio);
    if (!a || !b) return null;
    // So a parte de data importa: 'ontem 23h' para 'hoje 01h' e 1 dia.
    const dia = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.round((dia(a) - dia(b)) / UNIT_MS.DAY);
  });

  def('TIMESTAMPDIFF', 3, (unit, from, to) => {
    const start = readDate(from);
    const end = readDate(to);
    if (!start || !end) return null;
    const step = UNIT_MS[String(unit).toUpperCase()];
    if (!step) return null;
    return Math.trunc((end.getTime() - start.getTime()) / step);
  });

  // FIELD(x, a, b, c) -> posicao 1-based de x na lista, 0 se nao achar.
  def('FIELD', null, (...args) => {
    const [needle, ...list] = args;
    const target = needle == null ? null : String(needle);
    const index = list.findIndex((item) => (item == null ? null : String(item)) === target);
    return index === -1 ? 0 : index + 1;
  });

  def('CONCAT', null, (...args) => (args.some((a) => a == null) ? null : args.map(String).join('')));

  def('LEAST', null, (...args) => {
    const valid = args.filter((a) => a != null);
    if (valid.length !== args.length) return null;
    return valid.reduce((a, b) => (Number(b) < Number(a) ? b : a));
  });

  def('GREATEST', null, (...args) => {
    const valid = args.filter((a) => a != null);
    if (valid.length !== args.length) return null;
    return valid.reduce((a, b) => (Number(b) > Number(a) ? b : a));
  });

  def('CEIL', 1, (value) => (value == null ? null : Math.ceil(Number(value))));
  def('CEILING', 1, (value) => (value == null ? null : Math.ceil(Number(value))));
  def('IFNULL', 2, (a, b) => (a == null ? b : a));
  def('CHAR_LENGTH', 1, (value) => (value == null ? null : [...String(value)].length));
  def('LCASE', 1, (value) => (value == null ? null : String(value).toLowerCase()));
  def('UCASE', 1, (value) => (value == null ? null : String(value).toUpperCase()));

  // Comparacao sem acento nem caixa (COLLATE utf8mb4_0900_ai_ci, ver toSqlite).
  def('MITRA_SEM_ACENTO', 1, (value) => (value == null ? null : String(value).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()));
}

/**
 * Reescreve o que nao cabe em funcao escalar. Trabalha so fora de literais de
 * string, para nunca alterar um dado que por acaso pareca SQL.
 */
export function toSqlite(sql) {
  return mapOutsideStrings(traduzirComLiterais(String(sql)), (chunk) => {
    let out = chunk;

    // LAST_INSERT_ID() -> last_insert_rowid(): o mesmo "ultimo id desta conexao".
    out = out.replace(/\bLAST_INSERT_ID\s*\(\s*\)/gi, 'last_insert_rowid()');

    // DATE_SUB(x, INTERVAL 30 DAY) -> MITRA_DATE_ADD(x, -30, 'DAY')
    out = out.replace(/\bDATE_SUB\s*\(([^,]+?),\s*INTERVAL\s+(-?\d+)\s+(SECOND|MINUTE|HOUR|DAY)\s*\)/gi,
      (_, value, amount, unit) => `MITRA_DATE_ADD(${value}, ${-Number(amount)}, '${unit.toUpperCase()}')`);
    out = out.replace(/\bDATE_ADD\s*\(([^,]+?),\s*INTERVAL\s+(-?\d+)\s+(SECOND|MINUTE|HOUR|DAY)\s*\)/gi,
      (_, value, amount, unit) => `MITRA_DATE_ADD(${value}, ${Number(amount)}, '${unit.toUpperCase()}')`);

    // TIMESTAMPDIFF(MINUTE, a, b): a unidade e palavra nua no MySQL.
    out = out.replace(/\bTIMESTAMPDIFF\s*\(\s*(SECOND|MINUTE|HOUR|DAY)\s*,/gi,
      (_, unit) => `TIMESTAMPDIFF('${unit.toUpperCase()}',`);

    // CAST(x AS UNSIGNED) -> CAST(x AS INTEGER)
    out = out.replace(/\bAS\s+UNSIGNED\s*\)/gi, 'AS INTEGER)');
    out = out.replace(/\bAS\s+SIGNED\s*\)/gi, 'AS INTEGER)');

    // GROUP_CONCAT(x SEPARATOR 's') -> group_concat(x, 's'). O SQLite tem a
    // mesma agregacao, com o separador como segundo argumento em vez de
    // palavra-chave. O literal do separador nao e tocado: ele fica fora deste
    // trecho, e e por isso que a troca e da palavra, nao da expressao inteira.
    out = out.replace(/\bSEPARATOR\b/gi, ',');

    // SUBSTRING(x, 1, 10) -> substr; SQLite aceita substr, nao SUBSTRING.
    out = out.replace(/\bSUBSTRING\s*\(/gi, 'substr(');

    // Booleanos: as colunas viram INTEGER no schema traduzido.
    out = out.replace(/\bIS\s+TRUE\b/gi, '= 1').replace(/\bIS\s+FALSE\b/gi, '= 0');
    out = out.replace(/(?<![.\w])TRUE(?![\w])/gi, '1').replace(/(?<![.\w])FALSE(?![\w])/gi, '0');

    return out;
  });
}

/**
 * Traducoes cujo padrao atravessa literais de string (por isso nao cabem em
 * mapOutsideStrings): os literais sao mascarados, o padrao casa e eles voltam.
 *  - JSON_TABLE(json, '$[*]' COLUMNS (A T PATH '$.a', ...)) ->
 *    (SELECT json_extract(value, '$.a') AS A, ... FROM json_each(json));
 *    so a raiz '$[*]', que e o que as SFs usam.
 *  - CONVERT(x USING utf8mb4) COLLATE utf8mb4_0900_ai_ci -> MITRA_SEM_ACENTO(x):
 *    os dois lados da comparacao sao escritos assim, e o SQLite ja ignora caixa
 *    ASCII no LIKE.
 */
function traduzirComLiterais(sql) {
  const literais = [];
  const mascarado = sql.replace(/'(?:[^']|'')*'/g, (lit) => `\u0000${literais.push(lit) - 1}\u0000`);
  const restaurar = (texto) => texto.replace(/\u0000(\d+)\u0000/g, (_, i) => literais[Number(i)]);
  const traduzido = mascarado
    .replace(/\bJSON_TABLE\s*\(\s*(\u0000\d+\u0000)\s*,\s*\u0000\d+\u0000\s+COLUMNS\s*\(([\s\S]*?)\)\s*\)/gi, (_, json, colunas) => {
      const campos = splitTopLevelCommas(colunas).map((coluna) => {
        const m = coluna.trim().match(/^(\w+)\s+[\s\S]+?\s+PATH\s+(\u0000\d+\u0000)$/i);
        if (!m) throw new Error(`JSON_TABLE: coluna nao reconhecida: ${restaurar(coluna)}`);
        return `json_extract(value, ${m[2]}) AS ${m[1]}`;
      });
      return `(SELECT ${campos.join(', ')} FROM json_each(${json}))`;
    })
    .replace(/\bCONVERT\s*\(([\s\S]+?)\s+USING\s+utf8mb4\s*\)\s*COLLATE\s+utf8mb4_0900_ai_ci\b/gi, 'MITRA_SEM_ACENTO($1)');
  return restaurar(traduzido);
}

/**
 * Divide uma SF com varias instrucoes (`;` fora de literais). A plataforma
 * aceita assim (o mixCriar do antigo e um exemplo) e roda uma a uma.
 */
export function splitStatements(sql) {
  const partes = [];
  let atual = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      atual += char;
      if (char === quote && sql[i + 1] === quote) { atual += sql[i + 1]; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    if (char === ';') { partes.push(atual); atual = ''; continue; }
    atual += char;
  }
  return [...partes, atual].filter((parte) => parte.trim());
}

/** Aplica `fn` apenas aos trechos fora de literais 'assim' e "assim". */
function mapOutsideStrings(sql, fn) {
  let out = '';
  let buffer = '';
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      out += char;
      // '' e "" escapam a propria aspa dentro do literal.
      if (char === quote && sql[i + 1] === quote) { out += sql[i + 1]; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      out += fn(buffer);
      buffer = '';
      out += char;
      quote = char;
      continue;
    }
    buffer += char;
  }
  return out + fn(buffer);
}

/**
 * `UPDATE T1 A JOIN T2 B ON ... SET A.x = ..., B.y = ... WHERE ...` nao existe
 * no SQLite. Devolve o plano para o runtime executar em transacao (tudo ou
 * nada, como a instrucao unica do MySQL): um SELECT que fixa as linhas
 * atingidas e um UPDATE por tabela. Devolve null se o SQL nao tem essa forma.
 * ponytail: cada atribuicao so pode citar a propria tabela; cruzar aliases no
 * lado direito exige reescrever como subconsulta.
 */
export function planUpdateJoin(sql) {
  const literais = [];
  const mascarado = String(sql).replace(/'(?:[^']|'')*'/g, (lit) => `\u0000${literais.push(lit) - 1}\u0000`);
  const restaurar = (texto) => texto.replace(/\u0000(\d+)\u0000/g, (_, i) => literais[Number(i)]);
  const m = mascarado.match(/^\s*UPDATE\s+(\w+)\s+(?:AS\s+)?(\w+)\s+(?:INNER\s+)?JOIN\s+(\w+)\s+(?:AS\s+)?(\w+)\s+ON\s+([\s\S]+?)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (!m) return null;
  const [, t1, a1, t2, a2, on, sets, where] = m;
  const tabelas = { [a1.toUpperCase()]: t1, [a2.toUpperCase()]: t2 };
  const porAlias = {};
  for (const atribuicao of splitTopLevelCommas(sets)) {
    const am = atribuicao.trim().match(/^(\w+)\.(\w+)\s*=\s*([\s\S]+)$/);
    if (!am) throw new Error(`UPDATE JOIN: atribuicao sem alias: ${restaurar(atribuicao)}`);
    const alias = am[1].toUpperCase();
    if (!tabelas[alias]) throw new Error(`UPDATE JOIN: alias desconhecido ${am[1]}`);
    (porAlias[alias] ||= []).push(`${am[2]} = ${am[3].trim()}`);
  }
  const aliases = Object.keys(porAlias);
  return {
    selecionar: restaurar(`SELECT ${aliases.map((a) => `${a}.rowid AS R_${a}`).join(', ')} FROM ${t1} ${a1} JOIN ${t2} ${a2} ON ${on} WHERE ${where}`),
    atualizar: aliases.map((a) => ({
      coluna: `R_${a}`,
      sql: (ids) => restaurar(`UPDATE ${tabelas[a]} AS ${a} SET ${porAlias[a].join(', ')} WHERE rowid IN (${ids.join(', ')})`),
    })),
  };
}

function splitTopLevelCommas(texto) {
  const partes = [];
  let nivel = 0;
  let atual = '';
  for (const c of texto) {
    if (c === '(') nivel += 1;
    if (c === ')') nivel -= 1;
    if (c === ',' && nivel === 0) { partes.push(atual); atual = ''; continue; }
    atual += c;
  }
  return [...partes, atual];
}
