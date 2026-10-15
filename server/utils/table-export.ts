// Download a table as CSV or Excel: a title line, the period, the header and rows, then totals by currency.
import type { H3Event } from 'h3'
export interface ExportCol { key: string; label: string; money?: boolean }
export async function sendTable(event: H3Event, o: { file: string; title: string; period: string; cols: ExportCol[]; rows: Record<string, unknown>[]; totals?: { label: string; values: Record<string, number> }[]; format: 'csv' | 'xlsx' }) {
  const name = o.file.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'export'
  if (o.format === 'xlsx') {
    const { default: Excel } = await import('exceljs')
    const wb = new Excel.Workbook(), ws = wb.addWorksheet(o.title.slice(0, 31) || 'Export', { views: [{ state: 'frozen', ySplit: 4 }] })
    ws.addRow([o.title]).font = { bold: true, size: 13 }; ws.addRow([o.period]).font = { color: { argb: 'FF6B7686' } }; ws.addRow([])
    const h = ws.addRow(o.cols.map((c) => c.label)); h.font = { bold: true }
    for (const r of o.rows) ws.addRow(o.cols.map((c) => r[c.key] ?? ''))
    o.cols.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = Math.min(48, Math.max(12, c.label.length + 4, ...o.rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length + 2))); if (c.money) col.numFmt = '#,##0.00' })
    if (o.totals?.length) { ws.addRow([]); for (const t of o.totals) for (const [cur, v] of Object.entries(t.values)) { const row = ws.addRow([t.label + ' (' + cur + ')', v]); row.font = { bold: true }; row.getCell(2).numFmt = '#,##0.00' } }
    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', 'attachment; filename="' + name + '.xlsx"')
    return Buffer.from(await wb.xlsx.writeBuffer())
  }
  const q = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const lines = [q(o.title), q(o.period), '', o.cols.map((c) => q(c.label)).join(','), ...o.rows.map((r) => o.cols.map((c) => q(r[c.key])).join(','))]
  if (o.totals?.length) { lines.push(''); for (const t of o.totals) for (const [cur, v] of Object.entries(t.values)) lines.push(q(t.label + ' (' + cur + ')') + ',' + v.toFixed(2)) }
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="' + name + '.csv"')
  return '﻿' + lines.join('\n')
}
