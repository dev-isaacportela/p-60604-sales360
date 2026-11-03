// Grava e baixa a planilha descrita por lib/semanal.ts (`Planilha`): o exceljs
// só é carregado no clique, para não pesar na abertura da tela.
//
// Formatação: cabeçalho verde com filtro, linhas zebradas, linha TOTAL em
// negrito, negativos de moeda e % em vermelho e largura pelo conteúdo.

import type { Planilha } from '@/lib/semanal'

const VERDE = 'FF156B16'
const ZEBRA = 'FFF3F6F3'
const TOTAL = 'FFE3ECE3'
const BORDA = { style: 'thin' as const, color: { argb: 'FFD5DCD5' } }

/** '"R$" #,##0.00' → '"R$" #,##0.00;[Red]-"R$" #,##0.00' (já tendo seções, fica). */
const comNegativoVermelho = (fmt: string) => (!fmt || fmt.includes(';') ? fmt : `${fmt};[Red]-${fmt}`)
const preenchimento = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })

export async function baixarPlanilha(p: Planilha): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  for (const aba of p.abas) {
    const folha = livro.addWorksheet(aba.nome, { views: [{ state: 'frozen', xSplit: aba.fixas, ySplit: 1 }] })
    const cabecalho = folha.addRow(aba.colunas)
    cabecalho.height = 32
    cabecalho.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = preenchimento(VERDE)
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      c.border = { top: BORDA, left: BORDA, bottom: BORDA, right: BORDA }
    })
    aba.linhas.forEach((valores, k) => {
      const linha = folha.addRow(valores)
      const total = valores[0] === 'TOTAL'
      for (let i = 1; i <= aba.colunas.length; i += 1) {
        const c = linha.getCell(i)
        c.border = { top: total ? { style: 'medium' as const, color: { argb: VERDE } } : BORDA, left: BORDA, bottom: BORDA, right: BORDA }
        if (total) { c.font = { bold: true }; c.fill = preenchimento(TOTAL) } else if (k % 2) c.fill = preenchimento(ZEBRA)
      }
    })
    aba.colunas.forEach((titulo, i) => {
      const coluna = folha.getColumn(i + 1)
      const fmt = aba.formatos[i]
      // Largura pelo maior conteúdo (números formatados ganham folga para "R$" e milhar).
      const maior = Math.max(0, ...aba.linhas.map(l => String(l[i] ?? '').length + (fmt ? 6 : 0)))
      coluna.width = Math.min(45, Math.max(10, Math.ceil(titulo.length / 2) + 2, maior + 2))
      if (fmt) coluna.numFmt = comNegativoVermelho(fmt)
    })
    if (aba.linhas.length) folha.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } }
  }
  const buffer = await livro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = p.arquivo
  a.click()
  URL.revokeObjectURL(url)
}
