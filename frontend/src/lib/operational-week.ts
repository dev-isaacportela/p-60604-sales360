function localDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function minDate(a: Date, b: Date): Date {
  return new Date(a.getTime() <= b.getTime() ? a : b);
}

function maxDate(a: Date, b: Date): Date {
  return new Date(a.getTime() >= b.getTime() ? a : b);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function previousFriday(date: Date): Date {
  const start = localDateOnly(date);
  const daysSinceFriday = (start.getDay() + 2) % 7;
  start.setDate(start.getDate() - daysSinceFriday);
  return start;
}

function firstFridayAfterMonthStart(year: number, month: number): Date {
  const firstDay = new Date(year, month - 1, 1);
  const daysUntilFriday = (5 - firstDay.getDay() + 7) % 7;
  firstDay.setDate(firstDay.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
  return firstDay;
}

function weekNumberFromStart(weekStart: Date): number {
  if (weekStart.getDate() === 1) return 1;
  const firstFriday = firstFridayAfterMonthStart(weekStart.getFullYear(), weekStart.getMonth() + 1);
  return 2 + Math.floor((weekStart.getTime() - firstFriday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function getOperationalWeek(date = new Date()) {
  const dateOnly = localDateOnly(date);
  const fridayStart = previousFriday(dateOnly);
  const weekStart = maxDate(monthStart(dateOnly), fridayStart);
  const weekEnd = minDate(monthEnd(dateOnly), addDays(fridayStart, 6));
  const weekNumber = weekNumberFromStart(weekStart);

  return {
    year: weekStart.getFullYear(),
    month: weekStart.getMonth() + 1,
    weekNumber,
    startIso: isoDate(weekStart),
    endIso: isoDate(weekEnd),
  };
}

export function getOperationalWeekNumber(date = new Date()): number {
  return getOperationalWeek(date).weekNumber;
}

export function buildOperationalWeeksForMonth(year: number, month: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let cursor = firstDay;

  while (cursor <= lastDay) {
    const fridayStart = previousFriday(cursor);
    const start = maxDate(firstDay, fridayStart);
    const end = minDate(lastDay, addDays(fridayStart, 6));
    const weekNumber = weekNumberFromStart(start);

    weeks.push({
      ANO: year,
      MES: month,
      SEMANA_NUMERO: weekNumber,
      DATA_INICIO_SEMANA: isoDate(start),
      DATA_FIM_SEMANA: isoDate(end),
      TOTAL_PEDIDOS: 0,
      VALOR_TOTAL_SEMANA: 0,
    });

    cursor = addDays(end, 1);
  }

  return weeks.reverse();
}

export function formatOperationalWeekRange(startIso?: string, endIso?: string): string {
  const start = startIso ? dateFromIso(startIso) : null;
  const end = endIso ? dateFromIso(endIso) : null;
  if (!start || !end) return '';

  const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${formatter.format(start)} a ${formatter.format(end)}`;
}
