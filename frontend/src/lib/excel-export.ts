import type { Workbook, Worksheet } from 'exceljs';

/**
 * Camada fina sobre o ExcelJS para gerar planilhas .xlsx de verdade:
 * numeros permanecem numericos (filtraveis e calculaveis no Excel), com
 * cabecalho congelado, autofiltro, larguras e agrupamento de colunas.
 *
 * Regra do projeto: nao exportar valor como texto ("R$ 1.234,56"). O valor vai
 * como numero e a apresentacao fica por conta do formato da celula.
 */

type ExcelCellType = 'text' | 'integer' | 'decimal' | 'currency' | 'percent' | 'date';

type ExcelCellValue = string | number | Date | null | undefined;

interface ExcelColumnSpec {
  header: string;
  type: ExcelCellType;
  width?: number;
  /** Rotulo do super-cabecalho mesclado acima da coluna (agrupa blocos lado a lado). */
  group?: string;
  /** Cor ARGB de fundo do super-cabecalho do grupo. */
  groupColor?: string;
  /** Soma a coluna na linha de total. */
  total?: boolean;
}

interface ExcelSheetSpec {
  name: string;
  title?: string;
  subtitle?: string;
  columns: ExcelColumnSpec[];
  rows: ExcelCellValue[][];
  totalsLabel?: string;
  /** Quantidade de colunas a esquerda que ficam congeladas. */
  freezeColumns?: number;
  autoFilter?: boolean;
  emptyMessage?: string;
}

const BRAND = {
  header: 'FF156B16',
  headerText: 'FFFFFFFF',
  title: 'FF1B1C1A',
  subtitle: 'FF6B7566',
  zebra: 'FFF4F8F2',
  border: 'FFD9E2D6',
  totalFill: 'FFECF5EA',
};

const NUMBER_FORMATS: Record<ExcelCellType, string | undefined> = {
  text: undefined,
  integer: '#,##0;[Red]-#,##0',
  decimal: '#,##0.00;[Red]-#,##0.00',
  currency: '#,##0.00;[Red]-#,##0.00',
  percent: '0.0%;[Red]-0.0%',
  date: 'dd/mm/yyyy',
};

/** Cria a especificacao de uma coluna ja tipada (evita import de types entre arquivos). */
export function excelColumn(header: string, options: Omit<ExcelColumnSpec, 'header'>): ExcelColumnSpec {
  return { header, ...options };
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Planilha').replace(/[\\/*?:[\]]/g, '-').slice(0, 31).trim() || 'Planilha';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const tail = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function columnWidth(column: ExcelColumnSpec, values: ExcelCellValue[]): number {
  if (column.width) return column.width;
  const longest = values.reduce<number>((max, value) => {
    if (value === null || value === undefined) return max;
    const length = value instanceof Date ? 10 : String(value).length;
    return Math.max(max, length);
  }, column.header.length);
  return Math.min(46, Math.max(11, longest + 3));
}

function thinBorder() {
  const side = { style: 'thin' as const, color: { argb: BRAND.border } };
  return { top: side, left: side, bottom: side, right: side };
}

function buildSheet(workbook: Workbook, spec: ExcelSheetSpec, usedNames: Set<string>) {
  const sheet: Worksheet = workbook.addWorksheet(sanitizeSheetName(spec.name, usedNames), {
    views: [{ showGridLines: false }],
  });
  const columnCount = spec.columns.length;
  const hasGroups = spec.columns.some((column) => Boolean(column.group));
  let cursor = 1;

  if (spec.title) {
    const row = sheet.getRow(cursor);
    row.getCell(1).value = spec.title;
    row.getCell(1).font = { bold: true, size: 14, color: { argb: BRAND.title } };
    row.height = 22;
    if (columnCount > 1) sheet.mergeCells(cursor, 1, cursor, columnCount);
    cursor += 1;
  }

  if (spec.subtitle) {
    const row = sheet.getRow(cursor);
    row.getCell(1).value = spec.subtitle;
    row.getCell(1).font = { size: 10, italic: true, color: { argb: BRAND.subtitle } };
    row.getCell(1).alignment = { vertical: 'middle', wrapText: true };
    row.height = 28;
    if (columnCount > 1) sheet.mergeCells(cursor, 1, cursor, columnCount);
    cursor += 1;
  }

  if (spec.title || spec.subtitle) cursor += 1;

  if (hasGroups) {
    const groupRow = sheet.getRow(cursor);
    groupRow.height = 20;
    let index = 0;
    while (index < columnCount) {
      const group = spec.columns[index].group;
      let end = index;
      while (end + 1 < columnCount && spec.columns[end + 1].group === group && group) end += 1;
      if (group) {
        const cell = groupRow.getCell(index + 1);
        cell.value = group;
        cell.font = { bold: true, size: 10, color: { argb: BRAND.headerText } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spec.columns[index].groupColor || BRAND.header } };
        cell.border = thinBorder();
        if (end > index) sheet.mergeCells(cursor, index + 1, cursor, end + 1);
      }
      index = end + 1;
    }
    cursor += 1;
  }

  const headerRowIndex = cursor;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.height = 30;
  spec.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, size: 11, color: { argb: BRAND.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.header } };
    cell.alignment = { horizontal: column.type === 'text' ? 'left' : 'right', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  cursor += 1;

  const firstDataRow = cursor;
  spec.rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(cursor);
    spec.columns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      const value = values[columnIndex];
      cell.value = value === undefined || value === '' ? null : value;
      const numberFormat = NUMBER_FORMATS[column.type];
      if (numberFormat) cell.numFmt = numberFormat;
      cell.alignment = { horizontal: column.type === 'text' ? 'left' : 'right', vertical: 'middle' };
      cell.border = thinBorder();
      if (rowIndex % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
      }
    });
    cursor += 1;
  });
  const lastDataRow = cursor - 1;

  if (spec.rows.length === 0 && spec.emptyMessage) {
    const row = sheet.getRow(cursor);
    row.getCell(1).value = spec.emptyMessage;
    row.getCell(1).font = { italic: true, color: { argb: BRAND.subtitle } };
    if (columnCount > 1) sheet.mergeCells(cursor, 1, cursor, columnCount);
    cursor += 1;
  }

  if (spec.rows.length > 0 && spec.columns.some((column) => column.total)) {
    const totalRow = sheet.getRow(cursor);
    totalRow.height = 20;
    spec.columns.forEach((column, columnIndex) => {
      const cell = totalRow.getCell(columnIndex + 1);
      if (columnIndex === 0) {
        cell.value = spec.totalsLabel || 'TOTAL';
      } else if (column.total) {
        const columnLetter = sheet.getColumn(columnIndex + 1).letter;
        cell.value = { formula: `SUM(${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow})` };
        const totalFormat = NUMBER_FORMATS[column.type];
        if (totalFormat) cell.numFmt = totalFormat;
      }
      cell.font = { bold: true, color: { argb: BRAND.title } };
      cell.alignment = { horizontal: column.type === 'text' ? 'left' : 'right', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.totalFill } };
      cell.border = thinBorder();
    });
    cursor += 1;
  }

  spec.columns.forEach((column, index) => {
    const values = spec.rows.map((row) => row[index]);
    sheet.getColumn(index + 1).width = columnWidth(column, values);
  });

  sheet.views = [{
    state: 'frozen',
    xSplit: spec.freezeColumns || 0,
    ySplit: headerRowIndex,
    showGridLines: false,
  }];

  if (spec.autoFilter !== false && spec.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: lastDataRow, column: columnCount },
    };
  }
}

export async function downloadExcelWorkbook(options: {
  fileName: string;
  sheets: ExcelSheetSpec[];
  creator?: string;
}): Promise<void> {
  // ExcelJS pesa ~1MB: carrega sob demanda para nao entrar no bundle inicial.
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.creator || 'Mitra';
  workbook.created = new Date();

  const usedNames = new Set<string>();
  options.sheets.forEach((sheet) => buildSheet(workbook, sheet, usedNames));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.fileName.endsWith('.xlsx') ? options.fileName : `${options.fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
