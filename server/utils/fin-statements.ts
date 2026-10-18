// Standard financial statements from a company's figures: income statement, balance sheet and cash flow by month,
// quarter or year, with the company's logo and the founder's comments. As a typeset PDF or an Excel workbook.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { deriveLines, rollUp, type FinRow } from '~/shared/fin-view'

export interface StRow { label: string; key?: string; values: (number | null)[]; kind?: 'head' | 'total' | 'sub' | 'pct' | 'line' }
export interface StSection { title: string; rows: StRow[]; note?: string }
export interface Statements { company: string; currency: string; periods: string[]; period_type: string; sections: StSection[]; comments: string; withSecurities: boolean }

const lbl = (d: string, t: string) => (t === 'year' ? 'FY ' + d.slice(0, 4) : t === 'quarter' ? 'Q' + Math.ceil(Number(d.slice(5, 7)) / 3) + ' ' + d.slice(0, 4) : new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }))
export function buildStatements(raw: FinRow[], o: { company: string; period_type: 'month' | 'quarter' | 'year'; count: number; withSecurities: boolean; comments: string; notes: Record<string, string> }): Statements {
  const today = new Date().toISOString().slice(0, 10)
  const months = raw.filter((r) => r.period_type === 'month')
  const native = raw.filter((r) => r.period_type === o.period_type)
  const base = (o.period_type === 'month' ? months : native.length ? native : rollUp(months, o.period_type)).filter((r) => r.period_end <= today)
  const rows = base.slice(-o.count).map((r) => ({ ...r, derived: deriveLines(r.lines, r.period_type === 'year' ? 12 : r.period_type === 'quarter' ? 3 : 1) }))
  const v = (k: string) => rows.map((r) => (typeof r.derived[k] === 'number' ? (r.derived[k] as number) : null))
  const any = (k: string) => v(k).some((x) => x !== null)
  const line = (label: string, k: string, kind: StRow['kind'] = 'line'): StRow[] => (any(k) ? [{ label, key: k, values: v(k), kind }] : [])
  const neg = (vals: (number | null)[]) => vals.map((x) => (x === null ? null : -Math.abs(x)))
  const opexLines = [['Payroll', 'opex_payroll'], ['Sales and marketing', 'opex_marketing'], ['Research and development', 'opex_rnd'], ['General and administrative', 'opex_ga'], ['Other operating expenses', 'opex_other']] as const
  const income: StRow[] = [
    ...line('Revenue', 'revenue', 'total'),
    ...(any('cogs') ? [{ label: 'Cost of revenue', values: neg(v('cogs')) }] : []),
    ...line('Gross profit', 'gross_profit', 'total'),
    ...(any('gross_margin') ? [{ label: 'Gross margin', values: v('gross_margin'), kind: 'pct' as const }] : []),
    ...(opexLines.some(([, k]) => any(k)) || any('opex_total') ? [{ label: 'Operating expenses', values: rows.map(() => null), kind: 'head' as const }] : []),
    ...opexLines.flatMap(([l, k]) => (any(k) ? [{ label: l, values: neg(v(k)), kind: 'sub' as const }] : [])),
    ...(any('opex_total') ? [{ label: 'Total operating expenses', values: neg(v('opex_total')), kind: 'total' as const }] : []),
    ...line('EBITDA', 'ebitda', 'total'),
    ...(any('depreciation') ? [{ label: 'Depreciation and amortisation', values: neg(v('depreciation')) }] : []),
    ...(any('interest') ? [{ label: 'Interest expense', values: neg(v('interest')) }] : []),
    ...line('Other income (interest, dividends, gains)', 'other_income'),
    ...(any('tax') ? [{ label: 'Tax', values: neg(v('tax')) }] : []),
    ...line('Net income', 'net_income', 'total')]
  const cash = v('cash'), sec = v('investments')
  const cms = cash.map((c, i) => (c === null && sec[i] === null ? null : (c ?? 0) + (sec[i] ?? 0)))
  const balance: StRow[] = [{ label: 'Assets', values: rows.map(() => null), kind: 'head' },
    ...line('Cash and bank', 'cash', 'sub'), ...line(o.withSecurities ? 'Marketable securities (e.g. treasury bills)' : 'Short-term investments', 'investments', 'sub'),
    ...(o.withSecurities && any('investments') ? [{ label: 'Cash and marketable securities', values: cms, kind: 'total' as const }] : []),
    ...line('Receivables', 'receivables', 'sub'), ...line('Long-term investments and stakes', 'long_term_investments', 'sub'), ...line('Other assets', 'other_assets', 'sub'), ...line('Total assets', 'total_assets', 'total'),
    { label: 'Liabilities', values: rows.map(() => null), kind: 'head' }, ...line('Payables', 'payables', 'sub'), ...line('Debt', 'debt', 'sub'), ...line('Other liabilities', 'other_liabilities', 'sub'), ...line('Total liabilities', 'total_liabilities', 'total'),
    ...line("Shareholders' equity", 'equity', 'total'),
    ...(any('total_liabilities') && any('equity') ? [{ label: 'Total liabilities and equity', values: rows.map((r) => (typeof r.derived.total_liabilities === 'number' || typeof r.derived.equity === 'number' ? ((r.derived.total_liabilities as number) ?? 0) + ((r.derived.equity as number) ?? 0) : null)), kind: 'total' as const }] : [])]
  const cfK = ['operating_cf', 'investing_cf', 'financing_cf']
  const flow: StRow[] = [...line('Cash from operating activities', 'operating_cf'), ...line('Cash from investing activities', 'investing_cf'), ...line('Cash from financing activities', 'financing_cf'),
    ...(cfK.some(any) ? [{ label: 'Net change in cash', values: rows.map((r) => (cfK.some((k) => typeof r.derived[k] === 'number') ? cfK.reduce((a, k) => a + ((r.derived[k] as number) ?? 0), 0) : null)), kind: 'total' as const }] : []),
    ...(cfK.some(any) ? line('Cash at the end of the period', 'cash', 'sub') : [])]
  const sections: StSection[] = [{ title: 'Income statement', rows: income, note: o.notes.income }, { title: 'Balance sheet', rows: balance.filter((r) => r.kind !== 'head' || true), note: o.notes.balance }, { title: 'Cash flow', rows: flow, note: o.notes.cash }]
    .filter((s) => s.rows.some((r) => r.kind !== 'head'))
  // Headings with nothing under them are dropped.
  for (const s of sections) s.rows = s.rows.filter((r, i) => r.kind !== 'head' || (s.rows[i + 1] && s.rows[i + 1]!.kind !== 'head'))
  return { company: o.company, currency: rows[rows.length - 1]?.currency ?? 'USD', periods: rows.map((r) => lbl(r.period_end, r.period_type)), period_type: o.period_type, sections, comments: o.comments, withSecurities: o.withSecurities }
}

const fmtN = (x: number | null, pct = false) => (x === null ? '' : pct ? x.toFixed(1) + '%' : x < 0 ? '(' + Math.round(Math.abs(x)).toLocaleString('en-US') + ')' : Math.round(x).toLocaleString('en-US'))
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '')

export async function statementsXlsx(s: Statements, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = s.company
  const fmt = '#,##0;(#,##0);"-"'
  for (const sec of s.sections) {
    const ws = wb.addWorksheet(sec.title.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 6 }] })
    ws.getColumn(1).width = 40; for (let i = 0; i < s.periods.length; i++) ws.getColumn(i + 2).width = 15
    if (logo) { const id = wb.addImage({ buffer: logo.data as unknown as ArrayBuffer, extension: logo.ext }); ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 36 } }) }
    ws.getCell('B1').value = s.company; ws.getCell('B1').font = { bold: true, size: 14 }
    ws.getCell('B2').value = sec.title + ' · ' + s.currency + ' · ' + (s.period_type === 'year' ? 'yearly' : s.period_type === 'quarter' ? 'quarterly' : 'monthly'); ws.getCell('B2').font = { color: { argb: 'FF6B7280' } }
    ws.getCell('B3').value = 'Prepared ' + new Date().toISOString().slice(0, 10) + '. Unaudited management figures.'; ws.getCell('B3').font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
    const head = ws.getRow(6); head.values = ['', ...s.periods]; head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C1A2E' } }; c.alignment = { horizontal: 'right' } }); head.getCell(1).alignment = { horizontal: 'left' }
    for (const r of sec.rows) {
      const row = ws.addRow([(r.kind === 'sub' ? '   ' : '') + r.label, ...r.values.map((x) => (x === null ? null : r.kind === 'pct' ? x / 100 : Math.round(x)))])
      row.eachCell((c, i) => { if (i > 1) c.numFmt = r.kind === 'pct' ? '0.0%' : fmt })
      if (r.kind === 'total') { row.font = { bold: true }; row.eachCell((c) => { c.border = { top: { style: 'thin', color: { argb: 'FF9CA3AF' } } } }) }
      if (r.kind === 'head') row.font = { bold: true, color: { argb: 'FF1C547D' } }
      if (r.kind === 'pct') row.font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    if (sec.note) { ws.addRow([]); const n = ws.addRow(['Comment: ' + sec.note]); n.font = { italic: true }; ws.mergeCells(n.number, 1, n.number, Math.max(2, s.periods.length + 1)); n.alignment = { wrapText: true, vertical: 'top' }; n.height = Math.min(120, 15 * Math.ceil(sec.note.length / 120)) }
  }
  if (s.comments.trim()) {
    const ws = wb.addWorksheet('Comments'); ws.getColumn(1).width = 110
    ws.addRow([s.company + ': management comments']).font = { bold: true, size: 13 }; ws.addRow([])
    for (const p of s.comments.split(/\n{2,}/)) { const r = ws.addRow([p.trim()]); r.alignment = { wrapText: true, vertical: 'top' }; r.height = Math.min(300, 15 * Math.ceil(p.length / 100)) }
  }
  // Finvry's typeface throughout (Excel falls back to a similar sans-serif where it is not installed).
  wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => { c.font = { size: 10.5, ...(c.font ?? {}), name: 'Instrument Sans' } })))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function statementsPdf(s: Statements, logo: { data: Buffer; ext: 'png' | 'jpeg' } | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(s.company + ' financial statements'); pdf.setProducer('Finvry'); pdf.setCreator(clean(s.company))
  pdf.registerFontkit(fontkit)
  const reg = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.regular, 'base64'), { subset: true }), bold = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.semibold, 'base64'), { subset: true }), ital = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.italic, 'base64'), { subset: true })
  let img: PDFImage | null = null
  if (logo) img = await (logo.ext === 'png' ? pdf.embedPng(logo.data) : pdf.embedJpg(logo.data)).catch(() => null)
  const W = 842, H = 595, M = 40, navy = rgb(12 / 255, 26 / 255, 46 / 255), blue = rgb(28 / 255, 84 / 255, 125 / 255), ink = rgb(0.1, 0.11, 0.14), mut = rgb(0.45, 0.47, 0.5), rule = rgb(0.85, 0.87, 0.9), red = rgb(0.7, 0.15, 0.15)
  let page!: PDFPage, y = 0, pageNo = 0
  const header = (title: string) => {
    page = pdf.addPage([W, H]); pageNo++; y = H - M
    if (img) { const h = 30, w = Math.min(160, (img.width / img.height) * h); page.drawImage(img, { x: M, y: y - h, width: w, height: h }) }
    else page.drawText(clean(s.company), { x: M, y: y - 20, size: 16, font: bold, color: navy })
    const right = clean(s.company) + '  ·  ' + s.currency + '  ·  unaudited'
    page.drawText(right, { x: W - M - reg.widthOfTextAtSize(right, 8.5), y: y - 18, size: 8.5, font: reg, color: mut })
    y -= 44; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 26
    page.drawText(clean(title), { x: M, y, size: 17, font: bold, color: navy }); y -= 22
    page.drawText(pageNo + '', { x: W - M - 10, y: 22, size: 8, font: reg, color: mut }); page.drawText('Prepared ' + new Date().toISOString().slice(0, 10) + ' with Finvry', { x: M, y: 22, size: 8, font: reg, color: mut })
  }
  const wrap = (t: string, f: PDFFont, size: number, w: number) => { const out: string[] = []; for (const para of clean(t).split(/\n/)) { let cur = ''; for (const word of para.split(/\s+/).filter(Boolean)) { const n = cur ? cur + ' ' + word : word; if (f.widthOfTextAtSize(n, size) > w && cur) { out.push(cur); cur = word } else cur = n } out.push(cur) } return out }
  const PER = 8
  for (const sec of s.sections) {
    for (let start = 0; start < s.periods.length; start += PER) {
      const cols = s.periods.slice(start, start + PER)
      header(sec.title + (s.periods.length > PER ? ' (' + (start / PER + 1) + ' of ' + Math.ceil(s.periods.length / PER) + ')' : ''))
      const labW = 220, colW = (W - M * 2 - labW) / cols.length
      page.drawRectangle({ x: M, y: y - 6, width: W - M * 2, height: 20, color: navy })
      cols.forEach((p, i) => { const t = clean(p); page.drawText(t, { x: M + labW + colW * (i + 1) - 6 - bold.widthOfTextAtSize(t, 8.5), y: y, size: 8.5, font: bold, color: rgb(1, 1, 1) }) })
      y -= 24
      for (const r of sec.rows) {
        if (y < M + 30) header(sec.title + ' (continued)')
        const f = r.kind === 'total' || r.kind === 'head' ? bold : r.kind === 'pct' ? ital : reg, size = 9
        if (r.kind === 'total') page.drawLine({ start: { x: M + labW, y: y + 11 }, end: { x: W - M, y: y + 11 }, thickness: 0.5, color: rule })
        page.drawText(clean(r.label), { x: M + (r.kind === 'sub' ? 12 : 0), y, size, font: f, color: r.kind === 'head' ? blue : r.kind === 'pct' ? mut : ink })
        r.values.slice(start, start + PER).forEach((x, i) => { const t = fmtN(x, r.kind === 'pct'); if (!t) return; page.drawText(t, { x: M + labW + colW * (i + 1) - 6 - f.widthOfTextAtSize(t, size), y, size, font: f, color: x !== null && x < 0 && ['gross_profit', 'ebitda', 'net_income'].includes(r.key ?? '') ? red : r.kind === 'pct' ? mut : ink }) })
        y -= r.kind === 'total' ? 18 : 15
      }
      if (sec.note && start + PER >= s.periods.length) {
        y -= 8; for (const l of wrap('Comment: ' + sec.note, ital, 9, W - M * 2)) { if (y < M + 20) header(sec.title + ' (continued)'); page.drawText(l, { x: M, y, size: 9, font: ital, color: ink }); y -= 13 }
      }
    }
  }
  if (s.comments.trim()) {
    header('Management comments')
    for (const p of s.comments.split(/\n{2,}/)) { for (const l of wrap(p, reg, 10.5, W - M * 2)) { if (y < M + 20) header('Management comments (continued)'); page.drawText(l, { x: M, y, size: 10.5, font: reg, color: ink }); y -= 15 } y -= 8 }
  }
  return pdf.save()
}
