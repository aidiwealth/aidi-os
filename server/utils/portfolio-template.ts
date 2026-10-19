// The Aidi portfolio report template: the format portfolio companies report in, so their figures are read exactly,
// with no AI. Same shape as the Finvry templates: the mark in A1, the currency in B3, the months across row 4 and the
// figures down column A by name; a Notes tab for highlights, challenges and asks. A quarter is reported on its last
// month with "Months covered" set to 3.
import type { Grid } from './sheet-links'
import type { ExtractedReport } from './portfolio-reports'

export const PORTFOLIO_MARK = 'Aidi portfolio report template'
const ROWS: { label: string; key: keyof Omit<ExtractedReport['periods'][number], 'month'> | 'covered'; note: string; fmt: string }[] = [
  { label: 'Months covered', key: 'covered', note: '1 for a month. For a quarter, report it on its last month and put 3.', fmt: '0' },
  { label: 'Revenue', key: 'revenue_total', note: 'Revenue recognised in the period (a quarter: the quarter total). Not GMV or payments processed.', fmt: '#,##0' },
  { label: 'Gross margin (%)', key: 'gross_margin_pct', note: 'As a percentage, e.g. 62.', fmt: '0.0' },
  { label: 'Net burn per month', key: 'net_burn_monthly', note: 'Cash out minus cash in, per month (a quarter: the monthly average). 0 if cash-flow positive.', fmt: '#,##0' },
  { label: 'Cash at the end', key: 'cash', note: 'Cash in the bank at the end of the period.', fmt: '#,##0' },
  { label: 'Paying customers', key: 'customers', note: 'At the end of the period.', fmt: '#,##0' },
  { label: 'Headcount', key: 'headcount', note: 'Full-time equivalents at the end of the period.', fmt: '#,##0' }]

export async function portfolioTemplateWorkbook(o: { company?: string; currency?: string; months?: number } = {}): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Aidi'
  const F = { name: 'Garamond', size: 11 }, NAVY = 'FF0C1A2E', BLUE = 'FF2F5EA8', MUT = 'FF6E737B'
  const now = new Date(), n = o.months ?? 6
  const months = Array.from({ length: n }, (_, k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n + k, 1)))
  const ws = wb.addWorksheet('Figures', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  ws.getColumn(1).width = 34; months.forEach((_, k) => { ws.getColumn(k + 2).width = 14 })
  ws.getCell('A1').value = PORTFOLIO_MARK + ' · v1'; ws.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
  ws.getCell('A2').value = (o.company ? o.company + ': ' : '') + 'one column per month, figures in the currency below. Leave a cell empty when you do not have the figure. Keep the line names as they are.'
  ws.getCell('A2').font = { ...F, color: { argb: MUT } }
  ws.getCell('A3').value = 'Currency'; ws.getCell('A3').font = { ...F, bold: true }
  ws.getCell('B3').value = o.currency ?? 'USD'; ws.getCell('B3').font = { ...F, bold: true, color: { argb: BLUE } }
  ws.getCell('B3').note = 'ISO code: USD, NGN, KES, GHS, GBP, EUR…'
  const hr = ws.getRow(4); hr.getCell(1).value = 'Line'
  months.forEach((d, k) => { const c = hr.getCell(k + 2); c.value = d; c.numFmt = 'mmm yyyy' })
  hr.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } })
  ROWS.forEach((r, i) => { const row = ws.getRow(5 + i); row.getCell(1).value = r.label; row.getCell(1).note = r.note; row.font = F; months.forEach((_, k) => { const c = row.getCell(k + 2); c.numFmt = r.fmt; if (r.key === 'covered') c.value = 1 }) })
  const k0 = 5 + ROWS.length + 1
  ws.getCell('A' + k0).value = 'Other figures'; ws.getCell('A' + k0).font = { ...F, bold: true, color: { argb: NAVY } }
  for (const [i, t] of ['KPI: Gross transaction value', 'KPI: Runway (months)', 'KPI: '].entries()) { const c = ws.getCell('A' + (k0 + 1 + i)); c.value = t; c.font = F; c.note = 'Any other figure, one per row, starting with "KPI:".' }
  const nt = wb.addWorksheet('Notes', { views: [{ showGridLines: false }] }); nt.getColumn(1).width = 18; nt.getColumn(2).width = 100
  nt.getCell('A1').value = PORTFOLIO_MARK + ' · notes'; nt.getCell('A1').font = { ...F, bold: true, color: { argb: NAVY } }
  nt.getCell('A2').value = 'For the latest month or quarter. Plain sentences; a few lines each.'; nt.getCell('A2').font = { ...F, color: { argb: MUT } }
  for (const [i, h] of ['Highlights', 'Challenges', 'Asks'].entries()) { const r = nt.getRow(4 + i * 2); r.getCell(1).value = h; r.getCell(1).font = { ...F, bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; r.height = 60; r.getCell(2).font = F }
  const g = wb.addWorksheet('How to use', { views: [{ showGridLines: false }] }); g.getColumn(1).width = 4; g.getColumn(2).width = 100
  const line = (t: string, s: { bold?: boolean; size?: number; color?: string } = {}) => { const q = g.addRow(['', t]); q.getCell(2).font = { ...F, bold: s.bold, size: s.size ?? 11, color: s.color ? { argb: s.color } : undefined }; q.getCell(2).alignment = { wrapText: true, vertical: 'top' } }
  g.addRow([]); line('Aidi portfolio report', { bold: true, size: 16, color: NAVY })
  line('Report in this format and your figures are read exactly as you enter them. Return the file as Excel (.xlsx).', { color: MUT }); g.addRow([])
  for (const [h, t] of [
    ['1. Months across', 'One column per month, the newest on the right. Add columns for later months. Quarterly reporters: use the last month of the quarter and set "Months covered" to 3.'],
    ['2. One currency', 'All amounts in the currency in cell B3 of Figures. Use full numbers (1250000, not 1.25m).'],
    ['3. What each line means', ROWS.map((r) => r.label + ': ' + r.note).join(' ')],
    ['4. Other figures', 'Anything else you track (volumes, GMV, runway…) one per row starting with "KPI:".'],
    ['5. Notes', 'Highlights, challenges and asks for the latest period go on the Notes tab.']]) { line(h, { bold: true }); line(t); g.addRow([]) }
  const lg = LOGO_PNG.aidi, img = wb.addImage({ base64: lg.b64, extension: 'png' })
  g.addImage(img, { tl: { col: 1, row: 22 }, ext: { width: lg.w * 0.6, height: lg.h * 0.6 } })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()
// A filled template, read by its line names. Null when the file is not the template.
export function readPortfolioTemplate(grids: Grid[], company: string): ExtractedReport | null {
  const g = grids.find((x) => typeof x.rows[0]?.[0] === 'string' && (x.rows[0]![0] as string).trim().startsWith(PORTFOLIO_MARK) && !/notes/i.test(x.rows[0]![0] as string)) ?? null
  if (!g) return null
  const cur = String(g.rows[2]?.[1] ?? 'USD').trim().toUpperCase()
  const head = g.rows[3] ?? [], cols = head.map((c, j) => ({ j, m: j ? monthOf(c) : null })).filter((x): x is { j: number; m: string } => !!x.m)
  const by = new Map<string, (string | number | null)[]>(), kpis: ExtractedReport['other_kpis'] = []
  for (const r of g.rows.slice(4)) { const l = typeof r[0] === 'string' ? r[0].trim() : ''; if (l) by.set(norm(l), r as (string | number | null)[]) }
  const val = (row: (string | number | null)[] | undefined, j: number) => (row ? numOf(row[j] ?? null) : null)
  const periods: ExtractedReport['periods'] = []
  for (const { j, m } of cols) {
    const p: ExtractedReport['periods'][number] = { month: m, months_covered: 1, revenue_total: null, net_burn_monthly: null, cash: null, customers: null, headcount: null, gross_margin_pct: null }
    let any = false
    for (const r of ROWS) { const v = val(by.get(norm(r.label)), j); if (v === null) continue; if (r.key === 'covered') p.months_covered = Math.max(1, Math.min(12, Math.round(v))); else { (p as unknown as Record<string, number>)[r.key] = r.key === 'net_burn_monthly' ? Math.abs(v) : v; any = true } }
    if (any) periods.push(p)
  }
  const last = periods[periods.length - 1]
  for (const [k, row] of by) {
    if (!k.startsWith('kpi ')) continue
    const name = String(row[0]).replace(/^kpi\s*:\s*/i, '').trim(); if (!name) continue
    for (let i = cols.length - 1; i >= 0; i--) { const v = val(row, cols[i]!.j); if (v !== null) { kpis.push({ name: name.slice(0, 80), value: v, unit: '', period: cols[i]!.m }); break } }
  }
  const nt = grids.find((x) => x !== g && typeof x.rows[0]?.[0] === 'string' && (x.rows[0]![0] as string).trim().startsWith(PORTFOLIO_MARK))
  const note = (h: string) => { const r = nt?.rows.find((x) => typeof x[0] === 'string' && norm(x[0]) === norm(h)); return r && typeof r[1] === 'string' ? r[1].trim().slice(0, 3000) : '' }
  const label = last ? new Date(last.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  return { company, title: company + (label ? ' report, ' + label : ' report'), period_label: label, currency: /^[A-Z]{3}$/.test(cur) ? cur : 'USD', usd_rate: null, periods: periods.slice(-16), other_kpis: kpis.slice(0, 8),
    highlights: note('Highlights'), challenges: note('Challenges'), asks: note('Asks').slice(0, 2000), has_figures: periods.length > 0, notes: 'Read from the Aidi portfolio report template, with no AI.' }
}
