export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactSearchText(value: unknown): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

const QUERY_STOPWORDS = new Set([
  'cliente',
  'clientes',
  'id',
  'codigo',
  'cod',
  'codcli',
  'numero',
  'n',
]);

function getQueryTokens(query: string): string[] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
  const meaningfulTokens = tokens.filter((token) => !QUERY_STOPWORDS.has(token));
  return meaningfulTokens.length ? meaningfulTokens : tokens;
}

function boundedDistance(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function tokenScore(field: string, token: string): number {
  if (!field || !token) return 0;
  if (field === token) return 120;
  if (field.startsWith(token)) return 100;
  if (field.includes(` ${token}`)) return 90;
  if (field.includes(token)) return 72;

  const fieldTokens = field.split(' ').filter(Boolean);
  const maxDistance = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
  if (!maxDistance) return 0;

  for (const fieldToken of fieldTokens) {
    if (fieldToken.length < 4) continue;
    const distance = boundedDistance(fieldToken, token, maxDistance);
    if (distance <= maxDistance) return distance === 1 ? 54 : 42;
  }

  return 0;
}

export function smartSearchScore(fields: unknown[], query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const tokens = getQueryTokens(query);
  const compactQuery = compactSearchText(query);
  const compactMeaningfulQuery = tokens.join('');
  const normalizedFields = fields.map((field) => normalizeSearchText(field)).filter(Boolean);
  const compactFields = fields.map((field) => compactSearchText(field)).filter(Boolean);

  if (compactQuery && compactFields.some((field) => field === compactQuery)) return 10000;
  if (compactMeaningfulQuery && compactFields.some((field) => field === compactMeaningfulQuery)) return 9500;

  let score = 0;
  for (const token of tokens) {
    const compactToken = compactSearchText(token);
    const compactHit = compactToken ? compactFields.some((field) => field.includes(compactToken)) : false;
    const bestTextScore = normalizedFields.reduce((best, field) => Math.max(best, tokenScore(field, token)), 0);
    const bestTokenScore = Math.max(bestTextScore, compactHit ? 95 : 0);

    if (bestTokenScore === 0) return 0;
    score += bestTokenScore;
  }

  if (normalizedFields.some((field) => field.startsWith(normalizedQuery))) score += 250;
  if (normalizedFields.some((field) => field.includes(normalizedQuery))) score += 120;
  if (compactQuery && compactFields.some((field) => field.includes(compactQuery))) score += 160;
  if (compactMeaningfulQuery && compactFields.some((field) => field.includes(compactMeaningfulQuery))) score += 140;

  return score;
}
