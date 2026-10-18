// Live-linked spreadsheets: a Google Sheets, OneDrive / SharePoint (Excel online) or Dropbox share link is read on a
// schedule and the rows the user chose feed Financials (monthly statements and KPIs) or a forecast (given months).
// Months run across the columns and line names down a column, the way most management accounts are laid out.
// Reading is plain parsing (no AI) so a sync gives the same answer every time; the mapping is kept by row name, so
// rows can move in the sheet without breaking the link.
import type ExcelJS from 'exceljs'
import type { Cat } from './accounts'
import { FIXED_KEYS } from '~/shared/forecast'
import { AiMap, readWithMap, writePeriods, previewOf } from './sheet-ai'

export type Cell = string | number | null
export interface Grid { name: string; rows: Cell[][]; formulas?: number } // formulas: share of filled cells that are formulas (derived tabs)
export interface Layout { sheet: string; months: string[]; rows: { label: string; values: Record<string, number> }[] }
export interface MapRow { label: string; to: string } // to: a line key, 'kpi' (a custom metric named after the row) or ''

const MAX_ROWS = 400, MAX_COLS = 80
const ALLOWED = /(^|\.)(docs\.google\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|dropbox\.com|dropboxusercontent\.com)$/i

// Turns a share link into a download. Only the spreadsheet services above, over HTTPS.
export async function fetchLinkedSheet(url: string): Promise<{ buf: Buffer; ext: 'xlsx' | 'csv'; provider: string }> {
  let u: URL
  try { u = new URL(url.trim()) } catch { throw apiError('invalid', 'Paste the full share link to the sheet.') }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) throw apiError('invalid', 'Use a share link from Google Sheets, Excel online (OneDrive or SharePoint) or Dropbox.')
  if (/docs\.google\.com$/i.test(u.hostname)) return { buf: await fetchGoogleSheet(u.toString()), ext: 'xlsx', provider: 'Google Sheets' }
  let dl: string, provider = 'Excel online'
  if (/dropbox/i.test(u.hostname)) { u.searchParams.set('dl', '1'); dl = u.toString(); provider = 'Dropbox' }
  else if (/sharepoint\.com$/i.test(u.hostname)) { u.searchParams.set('download', '1'); dl = u.toString() }
  else dl = 'https://api.onedrive.com/v1.0/shares/u!' + Buffer.from(u.toString()).toString('base64url') + '/root/content'
  const res = await fetch(dl, { redirect: 'follow', signal: AbortSignal.timeout(20000) }).catch(() => null)
  const ct = res?.headers.get('content-type') ?? ''
  if (!res || !res.ok || ct.includes('text/html')) throw apiError('sheet_private', 'We could not open that file. Share it so anyone with the link can view it, then try again.', 400)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 15 * 1024 * 1024) throw apiError('too_large', 'That file is too large (15 MB maximum).', 413)
  if (buf.subarray(0, 2).toString() === 'PK') return { buf, ext: 'xlsx', provider }
  if (/<html|<!doctype/i.test(buf.subarray(0, 200).toString())) throw apiError('sheet_private', 'We could not open that file. Share it so anyone with the link can view it, then try again.', 400)
  return { buf, ext: 'csv', provider }
}

function cellVal(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v.trim() || null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return null
  if (typeof v === 'object') {
    if ('result' in v) return cellVal((v as { result: ExcelJS.CellValue }).result)
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim() || null
    // A link cell: its address when the shown text is just "Open link" or similar, else the text.
    if ('hyperlink' in v && typeof (v as { hyperlink?: unknown }).hyperlink === 'string') { const tx = String((v as { text?: unknown }).text ?? '').trim(); return /^(open|link|open link|website|here|view|click)?$/i.test(tx) || !tx ? String((v as { hyperlink: string }).hyperlink) : tx }
    if ('text' in v) return String((v as { text: unknown }).text).trim() || null
  }
  return null
}
function csvRows(text: string): Cell[][] {
  const out: Cell[][] = []
  for (const line of text.split(/\r?\n/).slice(0, MAX_ROWS)) {
    const cells: string[] = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) { const ch = line[i]!; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch } else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = '' } else cur += ch }
    cells.push(cur); out.push(cells.slice(0, MAX_COLS).map((c) => c.trim() || null))
  }
  return out
}
export async function readGrids(buf: Buffer, ext: 'xlsx' | 'csv', lim: { tabs?: number; rows?: number; cols?: number } = {}): Promise<Grid[]> {
  if (ext === 'csv') return [{ name: 'Sheet1', rows: csvRows(buf.toString('utf8')) }]
  // Streamed: large workbooks (tens of thousands of formula rows) read in seconds rather than minutes.
  const { default: Excel } = await import('exceljs')
  const { Readable } = await import('node:stream')
  const maxR = lim.rows ?? MAX_ROWS, maxC = lim.cols ?? MAX_COLS, maxT = lim.tabs ?? 12
  const out: Grid[] = []
  try {
    const rd = new Excel.stream.xlsx.WorkbookReader(Readable.from(buf), { worksheets: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'cache', entries: 'emit' })
    for await (const ws of rd as unknown as AsyncIterable<AsyncIterable<{ number: number; values: unknown }> & { name?: string; id?: number }>) {
      if (out.length >= maxT) break
      const rows: Cell[][] = []; let filled = 0, fx = 0
      for await (const row of ws) {
        if (row.number > maxR) continue
        while (rows.length < row.number - 1) rows.push([])
        const vals = Array.isArray(row.values) ? (row.values as ExcelJS.CellValue[]).slice(1, maxC + 1) : []
        const cells: Cell[] = []
        for (let c = 0; c < vals.length; c++) { const v = vals[c]; if (row.number <= 300 && v !== null && v !== undefined) { filled++; if (typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v)) fx++ } cells.push(cellVal(v ?? null)) }
        rows.push(cells)
      }
      const w = Math.max(0, ...rows.map((r) => r.length))
      out.push({ name: String(ws.name ?? 'Sheet' + (out.length + 1)), rows: rows.map((r) => (r.length < w ? [...r, ...Array(w - r.length).fill(null)] : r)), formulas: filled ? fx / filled : 0 })
    }
  } catch (e) { console.error('[sheets] load', (e as Error).message); throw apiError('sheet_unreadable', 'That workbook could not be opened. Save a copy without pivot tables or add-ons and try again.', 422) }
  return out
}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const ym = (y: number, m: number) => (y < 100 ? 2000 + y : y) + '-' + String(m).padStart(2, '0')
// A column heading as a month (YYYY-MM): dates, "Jan 2026", "January-26", "2026-01", "01/2026", Excel date serials.
export function monthOf(c: Cell): string | null {
  if (c === null) return null
  if (typeof c === 'number') { if (c > 36000 && c < 73000 && Number.isInteger(c)) { const d = new Date(Date.UTC(1899, 11, 30) + c * 86400000); return d.toISOString().slice(0, 7) } return null }
  const s = c.toLowerCase().replace(/\s+/g, ' ').trim()
  let m = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(s); if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? ym(+m[1]!, +m[2]!) : null
  m = /^([a-z]{3,9})\.?[ \-/']*(\d{2}|\d{4})$/.exec(s); if (m) { const i = MON.indexOf(m[1]!.slice(0, 3)); return i >= 0 ? ym(+m[2]!, i + 1) : null }
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s); if (m && +m[1]! >= 1 && +m[1]! <= 12) return ym(+m[2]!, +m[1]!)
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) { const a = +m[1]!, b = +m[2]!; const mm = a > 12 ? b : a; return mm >= 1 && mm <= 12 ? ym(+m[3]!, mm) : null }
  return null
}
export function numOf(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  if (!c) return null
  let s = c.replace(/[\s,$€£₦¥]|USD|NGN|EUR|GBP/gi, '')
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[()]/g, '').replace(/^-/, '')
  const pct = s.endsWith('%'); if (pct) s = s.slice(0, -1)
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s) * (neg ? -1 : 1); return pct ? n : n
}

// Finds the heading row with the most months, the label column to its left, and every row with figures.
export function layoutOf(g: Grid): Layout | null {
  let best = -1, bestCols: { col: number; month: string }[] = []
  g.rows.slice(0, 40).forEach((row, i) => {
    const cols = row.map((c, col) => ({ col, month: monthOf(c) })).filter((x): x is { col: number; month: string } => !!x.month)
    if (cols.length > bestCols.length) { best = i; bestCols = cols }
  })
  if (best < 0 || bestCols.length < 2) return null
  const seen = new Set<string>(); bestCols = bestCols.filter((x) => (seen.has(x.month) ? false : (seen.add(x.month), true)))
  const first = Math.min(...bestCols.map((x) => x.col)), body = g.rows.slice(best + 1)
  let labelCol = -1, most = 0
  for (let c = 0; c < first; c++) { const n = body.filter((r) => typeof r[c] === 'string' && numOf(r[c]!) === null).length; if (n > most) { most = n; labelCol = c } }
  if (labelCol < 0) return null
  const rows: Layout['rows'] = [], used = new Set<string>()
  for (const r of body) {
    const label = typeof r[labelCol] === 'string' ? (r[labelCol] as string).slice(0, 80) : ''
    if (!label) continue
    const values: Record<string, number> = {}
    for (const { col, month } of bestCols) { const n = numOf(r[col] ?? null); if (n !== null) values[month] = Math.round(n * 100) / 100 }
    if (!Object.keys(values).length) continue
    let key = label, i = 2; while (used.has(norm(key))) key = label + ' (' + i++ + ')'
    used.add(norm(key)); rows.push({ label: key, values })
  }
  return rows.length ? { sheet: g.name, months: bestCols.map((x) => x.month).sort(), rows } : null
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()

export function layouts(grids: Grid[]): Layout[] { return grids.map(layoutOf).filter((x): x is Layout => !!x) }

// Where each row goes: line keys for Financials, given-month keys for a forecast.
export const TARGET_KEYS = {
  financials: () => [...LINES.map((l) => ({ key: l.key, label: l.label })), { key: 'kpi', label: 'Custom metric (KPI)' }],
  forecast: () => FIXED_KEYS.map((k) => ({ key: k.key, label: k.label })) }
const SYN: Record<string, string[]> = {
  revenue: ['revenue', 'total revenue', 'net revenue', 'sales', 'net sales', 'turnover', 'total income', 'income'],
  cogs: ['cost of revenue', 'cost of sales', 'cogs', 'cost of goods sold', 'direct costs'],
  gross_profit: ['gross profit', 'gross margin'], opex_payroll: ['payroll', 'salaries', 'salaries and wages', 'staff costs', 'wages', 'personnel'],
  opex_marketing: ['sales and marketing', 'sales marketing', 'sales and marketing expenses', 'sales marketing expenses', 'marketing', 'marketing expenses', 'advertising'], opex_rnd: ['research and development', 'r d', 'product and engineering', 'engineering'],
  opex_ga: ['general and administrative', 'general administrative', 'g a', 'admin', 'administrative expenses', 'general admin'], opex_other: ['other operating costs', 'other expenses', 'other opex'],
  opex_total: ['total operating costs', 'total operating expenses', 'total opex', 'total expenses', 'operating expenses'], ebitda: ['ebitda'],
  depreciation: ['depreciation', 'depreciation and amortisation', 'depreciation and amortization', 'd a'], interest: ['interest', 'interest expense', 'finance costs', 'interest paid'],
  other_income: ['other income', 'interest income', 'finance income', 'investment income', 'dividend income', 'non operating income', 'other income expense', 'other gains'],
  tax: ['tax', 'taxes', 'income tax'], net_income: ['net income', 'net profit', 'profit after tax', 'net profit loss', 'net loss', 'profit loss'],
  cash: ['cash', 'cash balance', 'closing cash', 'cash at bank', 'cash and cash equivalents', 'cash cash equivalents', 'ending cash', 'cash and marketable securities', 'cash marketable securities', 'cash and short term investments'],
  receivables: ['receivables', 'accounts receivable', 'trade receivables', 'debtors', 'receivables and prepayments', 'receivables prepayments'],
  investments: ['short term investments', 'treasury bills', 't bills', 'marketable securities', 'money market', 'fixed deposits'],
  long_term_investments: ['investments', 'long term investments', 'strategic investments', 'equity investments', 'investments in associates', 'investment in associates', 'investments in subsidiaries'],
  total_assets: ['total assets'], payables: ['payables', 'accounts payable', 'trade payables', 'creditors'], debt: ['debt', 'loans', 'borrowings', 'debt and finance leases', 'debt finance leases'], total_liabilities: ['total liabilities'],
  equity: ['equity', 'total equity', 'shareholders equity', 'shareholder equity', 'stockholders equity', 'stockholder equity', 'total shareholders equity', 'total stockholders equity', 'members equity', 'total members equity', 'net assets', 'shareholders funds', 'total shareholders funds', 'owners equity'], operating_cf: ['operating cash flow', 'net cash from operating activities', 'cash from operations'],
  investing_cf: ['investing cash flow', 'net cash from investing activities'], financing_cf: ['financing cash flow', 'net cash from financing activities'] }
const FC_FROM_LINE: Record<string, string> = { revenue: 'revenue', cogs: 'cogs', opex_payroll: 'payroll', opex_marketing: 'marketing', opex_rnd: 'rnd', opex_ga: 'ga', opex_other: 'other', tax: 'tax' }
const FC_SYN: Record<string, string[]> = { customers: ['customers', 'paying customers', 'active customers', 'clients'], headcount: ['headcount', 'employees', 'fte', 'team size'], funding: ['funding', 'funding raised', 'equity raised', 'investment received'] }
// Financials also fill gaps. An unknown row inside a section goes into a category under that section's line: between the
// operating cost lines and their total, under other operating costs; among the assets, other assets; among the
// liabilities, other liabilities; under the liabilities total, equity. Several rows can share a line (they are added up),
// and the parts of equity become categories, so a missing equity total is their sum and never one part of it.
const EQ_PART = /(paid in|share capital|capital stock|common stock|preferred stock|additional paid|share premium|retained|accumulated deficit|deficit|reserve|treasury|unreali[sz]ed|comprehensive|drawings|contributions)/
const INCOME_ROW = /^(income|other income|interest|dividend)s?\b.*(dividend|interest)|^(interest|dividend)s? (income|earned|received)|^gains?\b|exchange (rate )?(gain|difference)/
const OPENS: Record<string, string> = { opex_payroll: 'opex_other', opex_marketing: 'opex_other', opex_rnd: 'opex_other', opex_ga: 'opex_other', opex_other: 'opex_other', cash: 'other_assets', receivables: 'other_assets', investments: 'other_assets', long_term_investments: 'other_assets', payables: 'other_liabilities', debt: 'other_liabilities', other_liabilities: 'other_liabilities', total_liabilities: 'equity' }
const CLOSES: Record<string, string[]> = { opex_other: ['opex_total', 'ebitda', 'net_income'], other_assets: ['total_assets', 'payables'], other_liabilities: ['total_liabilities', 'equity'], equity: ['equity'] }
export function suggestMapping(rows: Layout['rows'], target: 'financials' | 'forecast'): MapRow[] {
  const taken = new Set<string>()
  let sect = ''
  return rows.map((r) => {
    const n = norm(r.label); let to = ''
    for (const [key, words] of Object.entries(SYN)) { const k = target === 'forecast' ? FC_FROM_LINE[key] : key; if (k && !taken.has(k) && words.includes(n)) { to = k; break } }
    if (!to && target === 'forecast') for (const [key, words] of Object.entries(FC_SYN)) if (!taken.has(key) && words.includes(n)) { to = key; break }
    if (target === 'financials') {
      const label = r.label.trim().replace(/\s+/g, ' ').slice(0, 80), total = /^total\b|\btotal$|ebitda|\bebit\b|gross profit|net (income|profit|loss)|margin|ratio|balance check/.test(n)
      if (!to && !taken.has('other_income') && INCOME_ROW.test(n)) to = 'other_income'
      else if (!to && !total && n && (sect || EQ_PART.test(n))) to = 'cat:' + (sect || 'equity') + ':' + label
      if (sect && CLOSES[sect]!.includes(to)) sect = ''
      if (OPENS[to] && !(to === 'total_liabilities' && taken.has('equity'))) sect = OPENS[to]!
    }
    if (to && !to.startsWith('cat:')) taken.add(to)
    return { label: r.label, to }
  })
}

// Costs are kept as positive figures, however the sheet shows them (minus signs or brackets): see addFigure.
const lastDay = (m: string) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
export interface LinkRow { id: string; name: string; url: string; target: 'financials' | 'forecast'; subject: string | null; forecast_id: string | null; currency: string; sheet: string | null; mapping: MapRow[]; mode?: 'rows' | 'ai'; ai_map?: unknown }

// Reads the sheet and writes the chosen rows. Financials: months up to this one, merged into each month's statement
// (lines from the sheet replace those lines only). Forecast: the months become given months in that forecast.
export async function syncLink(l: LinkRow, userId: string | null): Promise<{ months: number; skipped: string[] }> {
  try {
    if (l.mode === 'ai') return await syncAiLink(l, userId)
    const { buf, ext } = await fetchLinkedSheet(l.url)
    const all = layouts(await readGrids(buf, ext))
    const lay = all.find((x) => x.sheet === l.sheet) ?? all[0]
    if (!lay) throw apiError('empty', 'No months found across the columns of that sheet.', 422)
    const byLabel = new Map(lay.rows.map((r) => [norm(r.label), r]))
    const chosen = l.mapping.filter((m) => m.to).map((m) => ({ ...m, row: byLabel.get(norm(m.label)) })).filter((m) => m.row)
    if (!chosen.length) throw apiError('empty', 'None of the chosen rows were found in the sheet. Edit the link to choose rows again.', 422)
    const skipped: string[] = []; let months = 0
    if (l.target === 'financials') {
      const s = parseSubject(l.subject ?? ''); if (s.kind === 'group') throw apiError('invalid', 'Choose a company or entity.')
      await subjectName(l.subject!)
      const col = s.kind === 'entity' ? 'entity_id' : 'company_id', thisMonth = new Date().toISOString().slice(0, 7)
      await ensureAccounts(chosen.map((c) => catOf(c.to)).filter((x): x is Cat => !!x))
      for (const m of lay.months.filter((x) => x <= thisMonth)) {
        // Rows to the same line are added together; the company's own categories fill their line when it is not given.
        const lines: Record<string, number> = {}, kpis: Record<string, number> = {}, detail: Record<string, number> = {}
        for (const c of chosen) { const v = c.row!.values[m]; if (v === undefined) continue; if (c.to === 'kpi') kpis[c.label.slice(0, 60)] = v; else addFigure(lines, detail, c.to, v) }
        foldCategories(lines, detail)
        if (!Object.keys(lines).length && !Object.keys(kpis).length && !Object.keys(detail).length) continue
        const pe = lastDay(m)
        const ex = (await db().query<{ id: string; lines: Record<string, number>; kpis: Record<string, number>; detail: Record<string, number>; source: string }>(`SELECT id, lines, kpis, detail, source FROM financials.statements WHERE ${col} = $1 AND period_type = 'month' AND period_end = $2`, [s.id, pe])).rows[0]
        const { lines: merged, detail: md } = mergeStatement(ex, lines, detail)
        if (balanceError(merged)) { skipped.push(m + ': balance sheet does not balance'); continue }
        const mk = { ...(ex?.kpis ?? {}), ...kpis }
        if (ex) await db().query("UPDATE financials.statements SET lines = $2, kpis = $3, currency = $4, detail = $5, source = 'sheet', updated_at = now() WHERE id = $1", [ex.id, JSON.stringify(merged), JSON.stringify(mk), l.currency, JSON.stringify(md)])
        else await db().query(`INSERT INTO financials.statements (${col}, period_type, period_end, currency, lines, kpis, detail, source, created_by) VALUES ($1,'month',$2,$3,$4,$5,$6,'sheet',$7)`, [s.id, pe, l.currency, JSON.stringify(merged), JSON.stringify(mk), JSON.stringify(md), userId])
        months++
      }
    } else {
      const f = (await db().query<{ assumptions: Record<string, any> }>('SELECT assumptions FROM financials.forecasts WHERE id = $1', [l.forecast_id])).rows[0]
      if (!f) throw apiError('not_found', 'That forecast was deleted.', 404)
      const a = f.assumptions, fixed: Record<string, Record<string, any>> = a.fixed ?? {}, COSTS = ['marketing', 'rnd', 'ga', 'other']
      for (const m of lay.months) {
        const fm: Record<string, any> = { ...(fixed[m] ?? {}) }; let any = false
        for (const c of chosen) { const v = c.row!.values[m]; if (v === undefined) continue; any = true; if (COSTS.includes(c.to)) fm.costs = { ...(fm.costs ?? {}), [c.to]: Math.abs(v) }; else fm[c.to] = ['revenue', 'customers', 'headcount', 'items', 'funding'].includes(c.to) ? v : Math.abs(v) }
        if (any) { fixed[m] = fm; months++ }
      }
      a.fixed = fixed
      a.source = { file: 'Linked sheet: ' + l.name, imported_at: new Date().toISOString(), lines: chosen.map((c) => ({ label: c.label, maps_to: c.to })) }
      await db().query('UPDATE financials.forecasts SET assumptions = $2, updated_at = now() WHERE id = $1', [l.forecast_id, JSON.stringify(a)])
    }
    await db().query('UPDATE financials.sheet_links SET last_synced_at = now(), last_error = NULL, last_result = $2 WHERE id = $1', [l.id, JSON.stringify({ months, skipped, sheet: lay.sheet })])
    return { months, skipped }
  } catch (err) {
    const msg = (err as { data?: { error?: { message?: string } }; statusMessage?: string }).data?.error?.message ?? (err as { statusMessage?: string }).statusMessage ?? 'Could not read the sheet.'
    await db().query('UPDATE financials.sheet_links SET last_error = $2, last_synced_at = now() WHERE id = $1', [l.id, String(msg).slice(0, 300)]).catch(() => {})
    throw err
  }
}
export const LINK_COLS = 'id, name, url, target, subject, forecast_id, currency, sheet, mapping, mode, ai_map'

// A workbook linked with AI: read the cells its map points at (no AI call) and write every actual period.
export const AI_GRID = { tabs: 30, rows: 700, cols: 60 }
async function syncAiLink(l: LinkRow, userId: string | null): Promise<{ months: number; skipped: string[] }> {
  const map = AiMap.safeParse(l.ai_map)
  if (!map.success) throw apiError('invalid', 'Read the workbook again with AI to refresh this link.', 422)
  const { buf, ext } = await fetchLinkedSheet(l.url)
  const r = readWithMap(await readGrids(buf, ext, AI_GRID), map.data)
  if (!r.periods.length) throw apiError('empty', 'No figures found where they used to be. Use "Read again with AI" on this link.', 422)
  const w = await writePeriods(l.subject ?? '', r.periods, l.currency, userId)
  const lost = r.missing.length
  await db().query('UPDATE financials.sheet_links SET last_synced_at = now(), last_error = $3, last_result = $2 WHERE id = $1',
    [l.id, JSON.stringify({ ...previewOf(r), months: w.written, skipped: w.skipped }), lost > 3 ? lost + ' mapped rows were not found; the layout may have changed. Use "Read again with AI".' : null])
  return { months: w.written, skipped: w.skipped }
}
