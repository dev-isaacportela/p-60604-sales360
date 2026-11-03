// Grava e baixa a planilha descrita por lib/semanal.ts (`Planilha`): o exceljs
// só é carregado no clique, para não pesar na abertura da tela.

import type { Planilha } from '@/lib/semanal'

export async function baixarPlanilha(p: Planilha): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  for (const aba of p.abas) {
    const folha = livro.addWorksheet(aba.nome, { views: [{ state: 'frozen', xSplit: aba.fixas, ySplit: 1 }] })
    folha.addRow(aba.colunas).font = { bold: true }
    for (const linha of aba.linhas) folha.addRow(linha)
    aba.formatos.forEach((fmt, i) => {
      const coluna = folha.getColumn(i + 1)
      coluna.width = Math.min(40, Math.max(10, aba.colunas[i].length + 2))
      if (fmt) coluna.numFmt = fmt
    })
  }
  const buffer = await livro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = p.arquivo
  a.click()
  URL.revokeObjectURL(url)
}
