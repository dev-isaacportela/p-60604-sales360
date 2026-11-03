import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * PDF do Comparativo mensal, no molde do relatório de referência ("Comparativo cliente a
 * cliente"): os dois meses anteriores, o mês atual e a variação do atual contra o anterior,
 * com semáforo verde/vermelho. O PDF é impresso, então as cores são as da marca no tema claro.
 */

export interface LinhaPdf {
  CLIENTE_ID: number;
  CLIENTE: string;
  MES_2: number;
  MES_1: number;
  ATUAL: number;
}

interface Opcoes {
  linhas: LinhaPdf[];
  nomeAnt2: string;
  nomeAnt: string;
  nomeAtual: string;
  ano: number;
  mesCorrente: boolean;
  escopo: string;
  recorte: string;
}

const VERDE: [number, number, number] = [34, 134, 58];
const VERMELHO: [number, number, number] = [176, 58, 46];
const MARCA: [number, number, number] = [21, 107, 22];
const MARCA_SUAVE: [number, number, number] = [236, 245, 234];
const TEXTO: [number, number, number] = [27, 28, 26];
const SUAVE: [number, number, number] = [101, 112, 99];
const BORDA: [number, number, number] = [221, 229, 216];

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sinal = (v: number) => `${v > 0 ? '+ ' : v < 0 ? '- ' : ''}${moeda(Math.abs(v))}`;
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function gerarPdfComparativoMensal(o: Opcoes) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const rodape = `Comparativo de faturamento — ${o.nomeAnt} x ${o.nomeAtual}`;

  // Cabeçalho
  doc.setFillColor(...MARCA);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('COMPARATIVO CLIENTE A CLIENTE', M, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${o.nomeAnt2}, ${o.nomeAnt} e ${o.nomeAtual} de ${o.ano}${o.mesCorrente ? ` (até ${hoje})` : ''} · ${o.escopo}${o.recorte ? ` · ${o.recorte}` : ''}`, M, 19);

  // KPIs
  const tot = o.linhas.reduce((a, l) => ({ m2: a.m2 + l.MES_2, m1: a.m1 + l.MES_1, at: a.at + l.ATUAL }), { m2: 0, m1: 0, at: 0 });
  const varTot = tot.at - tot.m1;
  const kpis: Array<{ r: string; v: string; n: string; cor?: [number, number, number] }> = [
    { r: o.nomeAnt2, v: moeda(tot.m2), n: 'Fechado' },
    { r: o.nomeAnt, v: moeda(tot.m1), n: 'Fechado' },
    { r: o.nomeAtual, v: moeda(tot.at), n: o.mesCorrente ? 'Parcial' : 'Fechado' },
    { r: 'Variação', v: sinal(varTot), n: tot.m1 > 0 ? pct(varTot / tot.m1) : '—', cor: varTot < 0 ? VERMELHO : VERDE },
  ];
  const gap = 4;
  const kw = (W - 2 * M - gap * 3) / 4;
  let y = 32;
  kpis.forEach((k, i) => {
    const x = M + i * (kw + gap);
    doc.setFillColor(...MARCA_SUAVE);
    doc.setDrawColor(...BORDA);
    doc.roundedRect(x, y, kw, 20, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SUAVE);
    doc.text(k.r.toUpperCase(), x + 3.5, y + 5.5);
    doc.setFontSize(11.5);
    doc.setTextColor(...(k.cor || TEXTO));
    doc.text(k.v, x + 3.5, y + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...(k.cor || SUAVE));
    doc.text(k.n, x + 3.5, y + 17);
  });
  y += 27;

  // Tabela principal: quem comprou em algum dos meses anteriores
  const comBase = o.linhas.filter((l) => l.MES_2 > 0 || l.MES_1 > 0).sort((a, b) => (b.MES_1 - a.MES_1) || (b.ATUAL - a.ATUAL));
  const novos = o.linhas.filter((l) => l.MES_2 === 0 && l.MES_1 === 0 && l.ATUAL > 0).sort((a, b) => b.ATUAL - a.ATUAL);
  const variacoes = comBase.map((l) => l.ATUAL - l.MES_1);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 16 },
    head: [['Código', 'Cliente', o.nomeAnt2, o.nomeAnt, o.nomeAtual, '', 'Variação', '%']],
    body: comBase.map((l, i) => {
      const v = variacoes[i];
      return [String(l.CLIENTE_ID), l.CLIENTE, moeda(l.MES_2), moeda(l.MES_1), moeda(l.ATUAL), '', sinal(v), l.MES_1 > 0 ? pct(v / l.MES_1) : '—'];
    }),
    foot: [['', 'Total', moeda(tot.m2), moeda(tot.m1), moeda(tot.at), '', sinal(varTot), tot.m1 > 0 ? pct(varTot / tot.m1) : '—']],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: TEXTO, lineColor: BORDA },
    headStyles: { fillColor: MARCA, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
    footStyles: { fillColor: MARCA_SUAVE, textColor: TEXTO, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 247] },
    columnStyles: {
      0: { cellWidth: 15, textColor: SUAVE },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 23 },
      3: { halign: 'right', cellWidth: 23 },
      4: { halign: 'right', cellWidth: 23, fontStyle: 'bold' },
      5: { cellWidth: 6 },
      6: { halign: 'right', cellWidth: 25, fontStyle: 'bold' },
      7: { halign: 'right', cellWidth: 15 },
    },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = 'right';
      if (d.section === 'body' && (d.column.index === 6 || d.column.index === 7)) {
        const v = variacoes[d.row.index];
        d.cell.styles.textColor = v < 0 ? VERMELHO : v > 0 ? VERDE : SUAVE;
      }
      if (d.section === 'foot' && (d.column.index === 6 || d.column.index === 7)) d.cell.styles.textColor = varTot < 0 ? VERMELHO : VERDE;
    },
    didDrawCell: (d) => {
      // Semáforo: a bolinha verde ou vermelha ao lado da variação
      if ((d.section === 'body' || d.section === 'foot') && d.column.index === 5) {
        const v = d.section === 'foot' ? varTot : variacoes[d.row.index];
        if (v === 0) return;
        doc.setFillColor(...(v < 0 ? VERMELHO : VERDE));
        doc.circle(d.cell.x + d.cell.width / 2, d.cell.y + d.cell.height / 2, 1.5, 'F');
      }
    },
  });

  // Clientes que aparecem só no mês atual
  if (novos.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      margin: { left: M, right: M, bottom: 16 },
      head: [[{ content: `CLIENTES QUE APARECEM SOMENTE EM ${o.nomeAtual.toUpperCase()}`, colSpan: 3 }], ['Código', 'Cliente', o.nomeAtual]],
      body: novos.map((l) => [String(l.CLIENTE_ID), l.CLIENTE, moeda(l.ATUAL)]),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 2, textColor: TEXTO },
      headStyles: { fillColor: MARCA_SUAVE, textColor: MARCA, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 15, textColor: SUAVE }, 2: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } },
    });
  }

  // Rodapé em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDA);
    doc.line(M, h - 11, W - M, h - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SUAVE);
    doc.text(rodape, M, h - 6.5);
    doc.text(`Gerado em ${hoje} · página ${p} de ${paginas}`, W - M, h - 6.5, { align: 'right' });
  }

  doc.save(`Comparativo ${o.nomeAnt} x ${o.nomeAtual} ${o.ano}.pdf`);
}
