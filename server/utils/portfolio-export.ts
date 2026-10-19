// The portfolio report: every company (or one), its position, its latest figures, its figures period by period and the
// founder's latest notes, as Excel or PDF on Aidi letterhead (Aidi navy and blue, Garamond, the Aidi logo).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

export interface ExpPeriod { period: string; months: number; values: Record<string, number | null> }
export interface ExpCompany {
  id: string; name: string; relationship: string; holder: string | null; founder: string
  position: { cost: number; recorded: number | null; implied: number | null; currency: string; latest: string | null } | null
  periods: ExpPeriod[]; notes: { period: string; highlights: string | null; challenges: string | null; asks: string | null } | null
  latest: ExpPeriod | null; runway: number | null; growth: number | null
}
const KEYS = ['revenue', 'gross_margin', 'net_burn', 'cash', 'customers', 'headcount'] as const
const HEAD: Record<string, string> = { revenue: 'Revenue', gross_margin: 'Gross margin', net_burn: 'Net burn / month', cash: 'Cash', customers: 'Customers', headcount: 'Headcount' }
const REL: Record<string, string> = { investment: 'Investment', subsidiary: 'Subsidiary', affiliate: 'Affiliate', managed: 'Managed' }
export const periodName = (p: string, months: number) => { const d = new Date(p.slice(0, 7) + '-01T00:00:00Z'); return months === 3 ? 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear() : months === 12 ? 'FY' + d.getUTCFullYear() : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }

export async function portfolioExportData(companyId?: string): Promise<ExpCompany[]> {
  const cs = (await db().query<{ id: string; name: string; relationship: string; holder: string | null; founder_name: string }>(
    `SELECT c.id, c.name, c.relationship, he.name AS holder, c.founder_name FROM portfolio.companies c LEFT JOIN core.entities he ON he.id = c.holding_entity_id WHERE ${companyId ? 'c.id = $1' : 'c.active'} ORDER BY c.name`, companyId ? [companyId] : [])).rows
  const out: ExpCompany[] = []
  for (const c of cs) {
    const v = (await db().query<{ period: string; metric: string; months: number; v: string | null }>(
      "SELECT to_char(period, 'YYYY-MM-DD') AS period, metric, months, coalesce(override_value, founder_value)::text AS v FROM portfolio.metric_values WHERE company_id = $1 ORDER BY period", [c.id])).rows
    const by = new Map<string, ExpPeriod>()
    for (const r of v) { const p = by.get(r.period) ?? { period: r.period, months: 1, values: {} }; p.months = Math.max(p.months, Number(r.months) || 1); p.values[r.metric] = r.v === null ? null : Number(r.v); by.set(r.period, p) }
    const periods = [...by.values()].sort((a, b) => a.period.localeCompare(b.period))
    const latest = periods[periods.length - 1] ?? null
    const last = (k: string) => { for (let i = periods.length - 1; i >= 0; i--) { const x = periods[i]!.values[k]; if (x != null) return x } return null }
    const cash = last('cash'), burn = last('net_burn')
    const withRev = periods.filter((p) => p.values.revenue != null), a = withRev[withRev.length - 1], b = withRev[withRev.length - 2]
    const growth = a && b && a.months === b.months && b.values.revenue ? (a.values.revenue! / b.values.revenue! - 1) * 100 : null
    let position: ExpCompany['position'] = null
    try { const p = await positionOf(c.id); if (p.holdings.length) position = { cost: p.cost, recorded: p.recorded, implied: p.implied, currency: p.currency, latest: p.latest?.label ?? null } } catch { /* no holdings */ }
    const n = (await db().query<{ period: string; highlights: string | null; challenges: string | null; asks: string | null }>("SELECT to_char(period, 'YYYY-MM-DD') AS period, highlights, challenges, asks FROM portfolio.updates WHERE company_id = $1 ORDER BY period DESC LIMIT 1", [c.id])).rows[0] ?? null
    out.push({ id: c.id, name: c.name, relationship: REL[c.relationship] ?? c.relationship, holder: c.holder, founder: c.founder_name, position, periods, notes: n, latest, runway: cash != null && burn ? Math.round((cash / burn) * 10) / 10 : null, growth: growth == null ? null : Math.round(growth * 10) / 10 })
  }
  return out
}

const money = (v: number | null | undefined, cur = 'USD') => (v == null ? '–' : (v < 0 ? '-' : '') + (cur === 'USD' ? '$' : cur + ' ') + Math.round(Math.abs(v)).toLocaleString('en-US'))
const fmtV = (k: string, v: number | null | undefined) => (v == null ? '–' : k === 'gross_margin' ? Math.round(v * 10) / 10 + '%' : k === 'customers' || k === 'headcount' ? Math.round(v).toLocaleString('en-US') : money(v))

export async function portfolioXlsx(list: ExpCompany[], title: string): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook(); wb.creator = 'Aidi'
  const F = { name: 'Garamond', size: 11 }, NAVY = 'FF0C1A2E', BLUE = 'FF1C547D', MUT = 'FF6E737B', TINT = 'FFEEF4F9'
  const lg = LOGO_PNG.aidi, img = wb.addImage({ base64: lg.b64, extension: 'png' })
  const top = (ws: import('exceljs').Worksheet, h: string, sub: string) => {
    ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: lg.w * 0.5, height: lg.h * 0.5 } })
    ws.getRow(1).height = 32; ws.getCell('C1').value = h; ws.getCell('C1').font = { ...F, size: 16, bold: true, color: { argb: NAVY } }
    ws.getCell('C2').value = sub; ws.getCell('C2').font = { ...F, color: { argb: MUT } }
  }
  const head = (r: import('exceljs').Row) => { r.font = { ...F, bold: true, color: { argb: 'FFFFFFFF' } }; r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } } }) }
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  if (list.length > 1) {
    const s = wb.addWorksheet('Summary'); top(s, title, 'As of ' + today + ' · US dollars unless shown')
    const cols = ['Company', 'Relationship', 'Held by', 'Cost', 'Recorded value', 'Value on latest round', 'Latest figures', 'Revenue', 'Growth', 'Net burn / month', 'Cash', 'Runway (months)']
    cols.forEach((_, i) => { s.getColumn(i + 1).width = i === 0 ? 30 : 16 })
    head(s.getRow(5)); s.getRow(5).values = cols; head(s.getRow(5))
    list.forEach((c, i) => {
      const r = s.getRow(6 + i), L = c.latest
      r.values = [c.name, c.relationship, c.holder ?? '', c.position?.cost ?? null, c.position?.recorded ?? null, c.position?.implied ?? null, L ? periodName(L.period, L.months) : '', L?.values.revenue ?? null, c.growth == null ? null : c.growth / 100, L?.values.net_burn ?? null, L?.values.cash ?? null, c.runway]
      r.font = F; [4, 5, 6, 8, 10, 11].forEach((k) => { r.getCell(k).numFmt = '#,##0' }); r.getCell(9).numFmt = '0.0%'; r.getCell(12).numFmt = '0.0'
      if (i % 2) r.eachCell({ includeEmpty: true }, (x) => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINT } } })
    })
    s.views = [{ state: 'frozen', ySplit: 5 }]
  }
  const used = new Set<string>()
  for (const c of list) {
    let nm = c.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Company'; let k = 2; while (used.has(nm.toLowerCase())) nm = nm.slice(0, 25) + ' ' + k++; used.add(nm.toLowerCase())
    const s = wb.addWorksheet(nm); top(s, c.name, [c.relationship, c.holder ? 'held by ' + c.holder : '', c.founder].filter(Boolean).join(' · ') + ' · as of ' + today)
    s.getColumn(1).width = 22; for (let i = 2; i <= 8; i++) s.getColumn(i).width = 16
    let r = 5
    if (c.position) {
      s.getCell('A' + r).value = 'Our position'; s.getCell('A' + r).font = { ...F, bold: true, color: { argb: NAVY } }; r++
      for (const [l, v] of [['Cost', c.position.cost], ['Recorded value', c.position.recorded], ['Value on the latest round', c.position.implied]] as const) { s.getCell('A' + r).value = l; s.getCell('B' + r).value = v; s.getCell('B' + r).numFmt = '#,##0'; s.getRow(r).font = F; r++ }
      if (c.position.latest) { s.getCell('A' + r).value = 'Latest round'; s.getCell('B' + r).value = c.position.latest; s.getRow(r).font = F; r++ }
      r++
    }
    s.getCell('A' + r).value = 'Figures as reported (US dollars)'; s.getCell('A' + r).font = { ...F, bold: true, color: { argb: NAVY } }; r++
    const hr = s.getRow(r); hr.values = ['Period', ...KEYS.map((k) => HEAD[k]!)]; head(hr); r++
    for (const p of [...c.periods].reverse()) {
      const row = s.getRow(r); row.values = [periodName(p.period, p.months), ...KEYS.map((k) => p.values[k] ?? null)]; row.font = F
      KEYS.forEach((k, i) => { row.getCell(i + 2).numFmt = k === 'gross_margin' ? '0.0"%"' : '#,##0' }); r++
    }
    if (!c.periods.length) { s.getCell('A' + r).value = 'No figures yet.'; s.getCell('A' + r).font = { ...F, color: { argb: MUT } }; r++ }
    if (c.notes) {
      r++; s.getCell('A' + r).value = 'Latest notes · ' + periodName(c.notes.period, 1); s.getCell('A' + r).font = { ...F, bold: true, color: { argb: NAVY } }; r++
      for (const [l, t] of [['Highlights', c.notes.highlights], ['Challenges', c.notes.challenges], ['Asks', c.notes.asks]] as const) { if (!t) continue; s.getCell('A' + r).value = l; s.getCell('A' + r).font = { ...F, bold: true, color: { argb: BLUE } }; s.mergeCells('B' + r + ':H' + r); const x = s.getCell('B' + r); x.value = t; x.font = F; x.alignment = { wrapText: true, vertical: 'top' }; s.getRow(r).height = Math.min(300, 16 * Math.ceil(t.length / 110)); r++ }
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const NAVY = rgb(12 / 255, 26 / 255, 46 / 255), BLUE = rgb(28 / 255, 84 / 255, 125 / 255), TINT = rgb(238 / 255, 244 / 255, 249 / 255), MUT = rgb(0.4, 0.43, 0.48), INK = rgb(0.1, 0.12, 0.16), RULE = rgb(0.86, 0.88, 0.9)
const clean = (s: string) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/[^\x20-\x7E -ÿ\n]/g, '')

export async function portfolioPdf(list: ExpCompany[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
  pdf.setTitle(clean(title)); pdf.setProducer('Aidi OS'); pdf.setCreator('Aidi')
  const reg = await pdf.embedFont(Buffer.from(GARAMOND_TTF.regular, 'base64'), { subset: true })
  const bold = await pdf.embedFont(Buffer.from(GARAMOND_TTF.semibold, 'base64'), { subset: true })
  const lg = LOGO_PNG.aidi, logo = await pdf.embedPng(Buffer.from(lg.b64, 'base64'))
  const W = 842, H = 595, M = 44 // landscape A4: the tables are wide
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  let page: PDFPage, y = 0
  const text = (t: string, x: number, yy: number, size = 10, font: PDFFont = reg, color = INK) => page.drawText(clean(t), { x, y: yy, size, font, color })
  const right = (t: string, xr: number, yy: number, size = 10, font: PDFFont = reg, color = INK) => text(t, xr - font.widthOfTextAtSize(clean(t), size), yy, size, font, color)
  const fit = (t: string, w: number, size: number, font: PDFFont = reg) => { let s = clean(t); while (s.length > 1 && font.widthOfTextAtSize(s, size) > w) s = s.slice(0, -2) + '…'; return s }
  const wrap = (t: string, w: number, size: number) => { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const word of para.split(/\s+/)) { const tryL = line ? line + ' ' + word : word; if (reg.widthOfTextAtSize(tryL, size) > w && line) { out.push(line); line = word } else line = tryL } if (line) out.push(line) } return out }
  const newPage = (h: string) => {
    page = pdf.addPage([W, H]); const lh = 22, lw = lh * lg.w / lg.h
    page.drawImage(logo, { x: M, y: H - M - lh + 4, width: lw, height: lh })
    right(h, W - M, H - M - 4, 10, bold, NAVY); right(title + ' · ' + today, W - M, H - M - 17, 9, reg, MUT)
    page.drawRectangle({ x: M, y: H - M - 30, width: W - 2 * M, height: 1, color: RULE }); y = H - M - 56
  }
  const room = (need: string, h: number) => { if (y - h < M + 20) newPage(need) }
  const table = (cols: { h: string; w: number; r?: boolean }[], rows: string[][], ctx: string) => {
    const x0 = M, rowH = 17
    const header = () => { page.drawRectangle({ x: x0, y: y - 5, width: W - 2 * M, height: rowH, color: NAVY }); let x = x0 + 6; for (const c of cols) { if (c.r) right(c.h, x + c.w - 10, y, 9, bold, rgb(1, 1, 1)); else text(fit(c.h, c.w - 8, 9, bold), x, y, 9, bold, rgb(1, 1, 1)); x += c.w } y -= rowH }
    header()
    rows.forEach((r, i) => {
      if (y < M + 24) { newPage(ctx); header() }
      if (i % 2) page.drawRectangle({ x: x0, y: y - 5, width: W - 2 * M, height: rowH, color: TINT })
      let x = x0 + 6; r.forEach((v, j) => { const c = cols[j]!; if (c.r) right(v, x + c.w - 10, y, 9.5); else text(fit(v, c.w - 8, 9.5, j ? reg : bold), x, y, 9.5, j ? reg : bold, j ? INK : NAVY); x += c.w }); y -= rowH
    })
    y -= 8
  }
  // Cover and summary.
  newPage('Portfolio')
  text(title, M, y, 26, bold, NAVY); y -= 22; text('As of ' + today + ' · ' + list.length + ' compan' + (list.length === 1 ? 'y' : 'ies') + ' · US dollars unless shown', M, y, 11, reg, BLUE); y -= 28
  if (list.length > 1) {
    const span = (W - 2 * M) / 100
    table([{ h: 'Company', w: 20 * span }, { h: 'Held by', w: 13 * span }, { h: 'Cost', w: 9 * span, r: true }, { h: 'Value (latest round)', w: 11 * span, r: true }, { h: 'Latest', w: 8 * span }, { h: 'Revenue', w: 10 * span, r: true }, { h: 'Growth', w: 7 * span, r: true }, { h: 'Burn / month', w: 9 * span, r: true }, { h: 'Cash', w: 8 * span, r: true }, { h: 'Runway', w: 5 * span, r: true }],
      list.map((c) => [c.name, c.holder ?? '–', c.position ? money(c.position.cost, c.position.currency) : '–', c.position?.implied != null ? money(c.position.implied, c.position.currency) : c.position?.recorded != null ? money(c.position.recorded, c.position.currency) : '–', c.latest ? periodName(c.latest.period, c.latest.months) : '–', fmtV('revenue', c.latest?.values.revenue), c.growth == null ? '–' : (c.growth >= 0 ? '+' : '') + c.growth + '%', fmtV('net_burn', c.latest?.values.net_burn), fmtV('cash', c.latest?.values.cash), c.runway == null ? '–' : c.runway + ' mo']), 'Portfolio summary')
  }
  for (const c of list) {
    if (list.length > 1) newPage(c.name)
    text(c.name, M, y, 20, bold, NAVY); y -= 16
    text([c.relationship, c.holder ? 'held by ' + c.holder : '', c.founder].filter(Boolean).join(' · '), M, y, 10.5, reg, BLUE); y -= 26
    // Key figures in a row of tiles.
    const L = c.latest, tiles: [string, string, string][] = [
      ['Revenue' + (L ? ' · ' + periodName(L.period, L.months) : ''), fmtV('revenue', L?.values.revenue), c.growth == null ? '' : (c.growth >= 0 ? '+' : '') + c.growth + '% on the period before'],
      ['Net burn / month', fmtV('net_burn', L?.values.net_burn), ''], ['Cash', fmtV('cash', L?.values.cash), c.runway == null ? '' : c.runway + ' months of runway'],
      ['Customers', fmtV('customers', L?.values.customers), ''], ['Gross margin', fmtV('gross_margin', L?.values.gross_margin), '']]
    if (c.position) tiles.push(['Our cost', money(c.position.cost, c.position.currency), c.position.implied != null ? 'Worth ' + money(c.position.implied, c.position.currency) + ' on the latest round' : c.position.recorded != null ? 'Recorded at ' + money(c.position.recorded, c.position.currency) : ''])
    const tw = (W - 2 * M - (tiles.length - 1) * 8) / tiles.length
    tiles.forEach(([l, v, s], i) => { const x = M + i * (tw + 8); page.drawRectangle({ x, y: y - 42, width: tw, height: 58, borderColor: RULE, borderWidth: 1 }); text(fit(l, tw - 16, 8.5), x + 8, y + 2, 8.5, reg, MUT); text(fit(v, tw - 16, 15, bold), x + 8, y - 17, 15, bold, NAVY); if (s) text(fit(s, tw - 16, 8), x + 8, y - 33, 8, reg, BLUE) })
    y -= 66
    if (c.periods.length) {
      text('Figures as reported', M, y, 12, bold, NAVY); y -= 16
      const span = (W - 2 * M) / 100
      table([{ h: 'Period', w: 16 * span }, ...KEYS.map((k) => ({ h: HEAD[k]!, w: 14 * span, r: true }))], [...c.periods].reverse().slice(0, 18).map((p) => [periodName(p.period, p.months), ...KEYS.map((k) => fmtV(k, p.values[k]))]), c.name)
    } else { text('No figures reported yet.', M, y, 10.5, reg, MUT); y -= 20 }
    if (c.notes && (c.notes.highlights || c.notes.challenges || c.notes.asks)) {
      room(c.name, 60); text('Latest notes · ' + periodName(c.notes.period, 1), M, y, 12, bold, NAVY); y -= 16
      for (const [l, t] of [['Highlights', c.notes.highlights], ['Challenges', c.notes.challenges], ['Asks', c.notes.asks]] as const) {
        if (!t) continue
        const lines = wrap(t, W - 2 * M - 90, 10).slice(0, 14)
        room(c.name, 14 * Math.min(lines.length, 4) + 8)
        text(l, M, y, 10, bold, BLUE)
        for (const ln of lines) { if (y < M + 20) newPage(c.name); text(ln, M + 90, y, 10); y -= 13 }
        y -= 6
      }
    }
  }
  pdf.getPages().forEach((p, i, a) => p.drawText(clean('Aidi · ' + title + ' · Page ' + (i + 1) + ' of ' + a.length + ' · Confidential'), { x: M, y: 22, size: 8, font: reg, color: MUT }))
  return await pdf.save()
}
