import { checkRow, checkRows } from '~/shared/fin-view'
// Linked workbooks read with AI: for financial models too complex for "months across one row" (many tabs, years or
// quarters, actuals beside projections, side-by-side tables, two currencies). The AI reads the workbook once and
// returns a map: which tab, row and column holds which figure for which period. Figures are then always read from
// the cells by code, never typed by the AI, so a sync gives the same answer every time and costs nothing; rows that
// move are found again by their label. "Read again with AI" redoes the map when the layout changes.
import { z } from 'zod'
import type { Cell, Grid } from './sheet-links'

const COL = (s: string) => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
const LETTER = (i: number) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim()

const Period = z.object({ col: z.string().regex(/^[A-Za-z]{1,3}$/), period_type: z.enum(['month', 'quarter', 'year']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), projected: z.boolean() })
const MapRowAi = z.object({ row: z.number().int().min(1).max(5000), label: z.string().max(120), to: z.string().max(140), kpi: z.string().max(60).default(''), pct: z.boolean().default(false) })
const Block = z.object({ sheet: z.string().max(120), title: z.string().max(120), label_col: z.string().regex(/^[A-Za-z]{1,3}$/), scale: z.number().positive().max(1e9).default(1), periods: z.array(Period).max(80), rows: z.array(MapRowAi).max(200), use: z.boolean().default(true) })
export const AiMap = z.object({
  company: z.object({ name: z.string().max(200), description: z.string().max(600), website: z.string().max(200) }),
  reporting_currency: z.string().regex(/^[A-Z]{3}$/), fiscal_year_end: z.string().max(20),
  tabs: z.array(z.object({ sheet: z.string().max(120), what: z.string().max(200), used: z.boolean() })).max(40),
  blocks: z.array(Block).max(40),
  facts: z.array(z.object({ sheet: z.string().max(120), label: z.string().max(120), value: z.string().max(300), goes_to: z.string().max(80) })).max(60),
  suggestions: z.array(z.object({ metric: z.string().max(80), why: z.string().max(240) })).max(15),
  notes: z.string().max(800) })
export type AiMapT = z.infer<typeof AiMap>

// The workbook as text the AI can point at: each non-empty cell with its column letter, row by row.
export function workbookText(grids: Grid[], perTab = 9000, total = 110000): string {
  const out: string[] = []
  for (const g of grids) {
    const lines: string[] = ['## Tab: ' + g.name]
    let size = 0
    g.rows.forEach((r, i) => {
      if (size > perTab) return
      const cells = r.map((c, j) => (c === null || c === '' ? '' : LETTER(j) + '=' + (typeof c === 'number' ? (Math.abs(c) >= 1e5 || Number.isInteger(c) ? String(Math.round(c)) : String(Math.round(c * 10000) / 10000)) : String(c).replace(/\s+/g, ' ').slice(0, 70)))).filter(Boolean)
      if (!cells.length) return
      const line = (i + 1) + ': ' + cells.join(' | ')
      size += line.length; lines.push(line)
    })
    if (lines.length === 1) lines.push('(no cells)')
    if (size > perTab) lines.push('… (tab continues)')
    out.push(lines.join('\n'))
  }
  return out.join('\n\n').slice(0, total)
}

const LINE_HELP = () => LINES.map((l) => l.key + ' (' + l.label + ')').join(', ')
const TAB_JSON = {
  type: 'object', additionalProperties: false, required: ['what', 'used', 'blocks', 'facts', 'suggestions', 'company', 'fiscal_year_end', 'notes'], properties: {
    what: { type: 'string', description: 'What this tab holds, in a few words.' }, used: { type: 'boolean', description: 'True if it has figures worth bringing in.' },
    company: { type: 'object', additionalProperties: false, required: ['name', 'description', 'website'], properties: { name: { type: 'string' }, description: { type: 'string' }, website: { type: 'string' } } },
    fiscal_year_end: { type: 'string', description: 'e.g. 31 Dec, or empty' },
    blocks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'label_col', 'scale', 'periods', 'rows'], properties: {
      title: { type: 'string' }, label_col: { type: 'string', description: 'Column letter of the row labels' }, scale: { type: 'number' },
      periods: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['col', 'period_type', 'period_end', 'projected'], properties: { col: { type: 'string' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] }, period_end: { type: 'string', description: 'YYYY-MM-DD' }, projected: { type: 'boolean' } } } },
      rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['row', 'label', 'to', 'kpi', 'pct'], properties: { row: { type: 'integer' }, label: { type: 'string', description: 'The label exactly as in the label column' }, to: { type: 'string' }, kpi: { type: 'string' }, pct: { type: 'boolean' } } } } } } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'value', 'goes_to'], properties: { label: { type: 'string' }, value: { type: 'string' }, goes_to: { type: 'string' } } } },
    suggestions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['metric', 'why'], properties: { metric: { type: 'string' }, why: { type: 'string' } } } },
    notes: { type: 'string' } } }
const SYSTEM = (currency: string) => [
  'You map one tab of a company\'s financial workbook so its figures can be read from the cells automatically. You never copy numbers: you say where they are (row number, column letter).',
  'Standard lines (use these keys in "to"): ' + LINE_HELP() + '. A row that is the company\'s own item belonging to a standard line (e.g. Consultants, Software & Apps, Technology expenses, Charges & fees under other operating costs; Loans receivable, Notes receivable, Prepaid carrier credit, Property & equipment under other assets; Accrued expenses, Taxes payable, Customer prepayments under other liabilities; Paid-in capital, Treasury stock, Retained earnings, Reserves under equity; Interest or dividend income, FX gains under other income) uses to="cat:<line key>:<the row label>" (or "cat::<label>" when it belongs to no line). These are kept as the company\'s own categories and added into that line only when the tab does not give the line itself, so map the total rows to the standard line too. Anything else worth tracking (customers, ARR, MRR, churn, headcount, burn, runway, gross margin %, revenue in another currency, volumes) uses to="kpi" with a short kpi name, e.g. "ARR", "Customers", "Revenue (NGN)".',
  INVEST_RULES + ' Several cost rows (e.g. eight expense rows) can each go to a category under the same line; every one of them is kept.',
  'Reporting currency is ' + currency + '. Map standard lines only to rows in that currency; rows in another currency become KPIs named with the currency. Costs can be negative or in brackets; map them anyway.',
  'A block is one table: one label column, the period columns, and the rows. Side-by-side tables are separate blocks (each with its own label column). A balance sheet "as of" a date is a block with one month period ending that date.',
  'Periods: month (period_end = last day of the month), quarter (last day of the quarter), year (fiscal year end; if not stated use 31 Dec). projected=true for E / F / Budget / Forecast / Projected columns, false for A / Actual. LTM or trailing tabs usually hold monthly actuals.',
  'scale: 1000 if the block says figures are in thousands, 1000000 for millions, else 1. pct=true for percentage rows. Do not map two different rows to the same standard line for the same period; use a category for each part instead, and map the total row to the line.',
  'Subtotals: a row that adds up the rows above it inside a section (Total current assets, Total non-current assets, Total fixed assets, Total other assets, Total current liabilities, Total long-term liabilities, Total bank accounts, a section total of operating expenses when a grand total follows) is NEVER mapped to a standard line or a category; map it to="kpi" with its label, or leave it out. Map total_assets only to the grand total of all assets (the last assets total before liabilities start), total_liabilities only to the grand total of all liabilities, and equity only to total equity. Never map a total row to other_assets, other_liabilities, an opex line or any cat:.',
  'If the tab has no time series (charts, notes, peer lists, investor lists), return no blocks and put what matters in facts.',
  'facts: one-off information (company description, website, share price, shares outstanding, valuation, cap table link, top customers, past or new investors, use of funds), with goes_to: "Company profile", "Cap table", "Fundraising pipeline", "Contacts", "Investor update" or "KPI". At most 12 per tab.',
  'suggestions: up to 3 figures investors expect that this tab lacks or hides, each with why. Keep every text short.'
].join('\n')

// Clips whatever the AI returned to what we keep: unknown keys, bad columns and dates are dropped, never fatal.
const t = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
function cleanTab(sheet: string, o: any, maxRow: number) {
  const keys = new Set([...LINE_KEYS, 'kpi']), okTo = (x: string) => keys.has(x) || !!catOf(x)
  const blocks = arr(o?.blocks).slice(0, 12).map((b) => ({
    sheet, title: t(b?.title, 120) || sheet, label_col: /^[A-Za-z]{1,3}$/.test(t(b?.label_col, 3)) ? t(b?.label_col, 3).toUpperCase() : 'A',
    scale: [1, 1000, 1000000, 1000000000].includes(Number(b?.scale)) ? Number(b.scale) : 1, use: true,
    periods: arr(b?.periods).filter((p) => /^[A-Za-z]{1,3}$/.test(t(p?.col, 3)) && ['month', 'quarter', 'year'].includes(p?.period_type) && /^\d{4}-\d{2}-\d{2}$/.test(t(p?.period_end, 10)))
      .slice(0, 80).map((p) => ({ col: t(p.col, 3).toUpperCase(), period_type: p.period_type as 'month' | 'quarter' | 'year', period_end: t(p.period_end, 10), projected: !!p.projected })),
    rows: arr(b?.rows).filter((r) => Number.isInteger(Number(r?.row)) && Number(r.row) >= 1 && Number(r.row) <= maxRow + 5 && okTo(t(r?.to, 140)) && (t(r?.to, 140) !== 'kpi' || t(r?.kpi, 60) || t(r?.label, 120)))
      .slice(0, 200).map((r) => ({ row: Number(r.row), label: t(r.label, 120), to: t(r.to, 140), kpi: t(r.kpi, 60), pct: !!r.pct }))
  })).filter((b) => b.periods.length && b.rows.length)
  return { what: t(o?.what, 200), used: !!o?.used || blocks.length > 0, blocks, notes: t(o?.notes, 300), fiscal_year_end: t(o?.fiscal_year_end, 20),
    company: { name: t(o?.company?.name, 200), description: t(o?.company?.description, 600), website: t(o?.company?.website, 200) },
    facts: arr(o?.facts).slice(0, 12).map((f) => ({ sheet, label: t(f?.label, 120), value: t(f?.value, 300), goes_to: t(f?.goes_to, 80) || 'Other' })).filter((f) => f.label && f.value),
    suggestions: arr(o?.suggestions).slice(0, 3).map((x) => ({ metric: t(x?.metric, 80), why: t(x?.why, 240) })).filter((x) => x.metric) }
}
// A tab worth sending to the AI has some figures in it (chart-only and empty tabs are skipped).
const figures = (g: Grid) => g.rows.reduce((n, r) => n + r.filter((c) => typeof c === 'number').length, 0)

// One tab read by the AI. feedback (on a retry) lists the add-up checks the previous map failed.
const PROMPT_VERSION = 'sheet-map-v4'
export async function mapTab(g: Grid, currency: string, ref: string, feedback = '') {
  const model = useRuntimeConfig().aiModelSheets || useRuntimeConfig().aiModelPitchScreen
  const { output } = await runAiTool({ task: 'sheet_map_tab', model, promptVersion: PROMPT_VERSION, inputRef: ref + '#' + g.name.slice(0, 40), system: SYSTEM(currency),
    user: 'Tab "' + g.name + '" (row number: column=value):\n\n' + workbookText([g], 16000, 16000) + (feedback ? '\n\n' + feedback : ''), toolName: 'map_tab', toolDescription: 'Say where each figure in this tab is.', jsonSchema: TAB_JSON, schema: z.any(), maxTokens: 4000 })
  return cleanTab(g.name, output, g.rows.length)
}
// Reads each tab separately and in parallel (a few at a time): faster than one huge request, and one awkward tab cannot
// sink the rest. onTab reports progress.
export async function mapWorkbook(grids: Grid[], currency: string, ref: string, onTab?: (done: number, total: number, sheet: string) => unknown): Promise<AiMapT> {
  const filled = (g: Grid) => g.rows.reduce((n, r) => n + r.filter((c) => c !== null && c !== '').length, 0)
  const work = grids.filter((g) => figures(g) >= 1 && filled(g) >= 4)
  const skipped = grids.filter((g) => !work.includes(g)).map((g) => ({ sheet: g.name, what: 'Nothing to read (chart or empty tab)', used: false }))
  const results: { sheet: string; out: ReturnType<typeof cleanTab> | null; error: string | null }[] = []
  let done = 0, i = 0
  const one = async (g: Grid) => {
    try {
      results.push({ sheet: g.name, out: await mapTab(g, currency, ref), error: null })
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode) throw err // AI allowance used up: stop and say so
      console.error('[sheets] tab', g.name, (err as Error).message)
      results.push({ sheet: g.name, out: null, error: (err as Error).message })
    }
    done++; await onTab?.(done, work.length, g.name)
  }
  const workers = Array.from({ length: Math.min(4, work.length) }, async () => { while (i < work.length) await one(work[i++]!) })
  await Promise.all(workers)
  // A tab that failed (a slow or busy model) is tried once more, one at a time, so a year of figures is not left out.
  const again = results.filter((r) => !r.out).map((r) => r.sheet)
  for (const sheet of again) {
    const g = work.find((x) => x.name === sheet)!
    try { const out = await mapTab(g, currency, ref); const k = results.findIndex((r) => r.sheet === sheet); results[k] = { sheet, out, error: null } }
    catch (err) { if ((err as { statusCode?: number }).statusCode) throw err; console.error('[sheets] tab retry', sheet, (err as Error).message) }
  }
  const ok = results.filter((r) => r.out)
  if (work.length && !ok.length) throw Object.assign(new Error('every tab failed: ' + (results[0]?.error ?? '')), { stage: 'ai' })
  const order = (s: string) => grids.findIndex((g) => g.name === s)
  ok.sort((a, b) => order(a.sheet) - order(b.sheet))
  const co = ok.map((r) => r.out!.company).find((c) => c.name || c.description) ?? { name: '', description: '', website: '' }
  const seen = new Set<string>(), suggestions = ok.flatMap((r) => r.out!.suggestions).filter((x) => { const k = x.metric.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 8)
  const failed = results.filter((r) => !r.out).map((r) => r.sheet)
  return {
    company: co, reporting_currency: currency, fiscal_year_end: ok.map((r) => r.out!.fiscal_year_end).find(Boolean) ?? '',
    tabs: [...ok.map((r) => ({ sheet: r.sheet, what: r.out!.what || 'Tab', used: r.out!.used })), ...failed.map((s) => ({ sheet: s, what: 'Could not be read this time', used: false })), ...skipped].sort((a, b) => order(a.sheet) - order(b.sheet)).slice(0, 40),
    blocks: ok.flatMap((r) => r.out!.blocks).slice(0, 40),
    facts: ok.flatMap((r) => r.out!.facts).slice(0, 60), suggestions,
    notes: [failed.length ? 'Not read this time: ' + failed.join(', ') + ' (use Read again to retry).' : '', ...ok.map((r) => r.out!.notes).filter(Boolean).slice(0, 3)].filter(Boolean).join(' ').slice(0, 800) }
}

// Why a read failed, in plain words, with what to do instead.
export function explainSheetError(err: unknown, stage: string): { message: string; advice: string[] } {
  const e = err as { data?: { error?: { code?: string; message?: string } }; statusCode?: number; message?: string; name?: string }
  const code = e.data?.error?.code ?? '', msg = e.data?.error?.message ?? ''
  const upload = 'Or download it (in Google Sheets: File → Download → Microsoft Excel) and use "Upload the file instead" here; it is read the same way.'
  if (code === 'gsheet_private' || code === 'sheet_private') return { message: 'We could not open the sheet: it is not shared with "Anyone with the link".', advice: ['In Google Sheets: Share → General access → Anyone with the link → Viewer, then try again.', upload] }
  if (code === 'too_large') return { message: 'The file is larger than 15 MB.', advice: ['Make a copy with just the financial tabs (File → Make a copy, delete chart and image tabs) and link that.', upload] }
  if (code === 'sheet_unreadable') return { message: 'The file opened but could not be read as a spreadsheet (pivot tables, add-ons or protected ranges can cause this).', advice: ['Make a copy of the sheet and link the copy, or remove pivot tables from it.', upload, 'Or use "Choose rows myself" on one tab with months across.'] }
  if (code === 'invalid') return { message: msg || 'That link is not a spreadsheet link.', advice: ['Paste the link from Share → Copy link in Google Sheets, Excel online or Dropbox.'] }
  if (code === 'ai_limit' || code === 'ai_off' || e.statusCode === 429) return { message: msg || 'The AI allowance is used up for now.', advice: ['Wait for the allowance to reset or add AI credits in Settings → AI usage.', 'Or use "Choose rows myself" (no AI needed).'] }
  if (code === 'fetch_timeout' && /reach/i.test(msg)) return { message: 'We could not reach Google Sheets from Finvry just now.', advice: ['Try again in a minute.', upload] }
  if (code === 'fetch_timeout' || stage === 'fetch' || e.name === 'TimeoutError' || /timeout|aborted|fetch failed|ECONN|ENOTFOUND/i.test(e.message ?? '')) return { message: 'Google (or the file host) did not send the file in time.', advice: ['Try again in a minute; large workbooks can be slow to export.', 'Link a copy with only the financial tabs.', upload] }
  if (stage === 'parse') return { message: 'The file arrived but could not be opened.', advice: ['Make a copy of the sheet and link the copy.', upload] }
  if (code === 'empty' || stage === 'empty') return { message: msg || 'No figures were found in the workbook.', advice: ['Check the link points to the workbook with the financials.', 'Or use "Choose rows myself" on a tab with months across one heading row.'] }
  return { message: 'The AI could not map this workbook just now.', advice: ['Try again; each tab is read separately, so a retry often gets the rest.', 'Or use "Choose rows myself" on the main P&L tab.', upload] }
}

const lastDay = (d: string) => { const x = new Date(d.slice(0, 7) + '-01T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return x.toISOString().slice(0, 10) }
function numAt(c: Cell | undefined): number | null {
  if (c === null || c === undefined) return null
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  let s = c.replace(/[\s,$€£₦¥]|USD|NGN|EUR|GBP/gi, ''); const neg = /^\(.*\)$/.test(s) || s.startsWith('-'); s = s.replace(/[()%]/g, '').replace(/^-/, '')
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) * (neg ? -1 : 1) : null
}
// Finds a mapped row: where the AI said, or (if rows moved) the row in that label column with the same label.
function findRow(g: Grid, labelCol: number, row: number, label: string): number | null {
  const want = norm(label), at = (i: number) => { const c = g.rows[i]?.[labelCol]; return typeof c === 'string' ? norm(c) : '' }
  const here = at(row - 1)
  if (want && here && (here === want || here.startsWith(want) || (want.startsWith(here) && here.length > 3))) return row - 1
  for (let i = 0; i < g.rows.length; i++) if (at(i) === want) return i
  return null
}

export interface PeriodOut { period_type: 'month' | 'quarter' | 'year'; period_end: string; lines: Record<string, number>; kpis: Record<string, number>; detail?: Record<string, number> }
// Reads the figures the map points at. Projected and unfinished periods are left out of the actuals and counted.
export function readWithMap(grids: Grid[], map: AiMapT, today = new Date().toISOString().slice(0, 10)): { periods: PeriodOut[]; projected: number; missing: string[]; found: number } {
  const out = new Map<string, PeriodOut>(); const missing: string[] = []; let projected = 0, found = 0
  for (const b of map.blocks) {
    if (b.use === false) continue
    const g = grids.find((x) => x.name === b.sheet) ?? grids.find((x) => norm(x.name) === norm(b.sheet))
    if (!g) { missing.push('Tab "' + b.sheet + '" not found'); continue }
    const lc = COL(b.label_col)
    for (const p of b.periods) {
      const pe = lastDay(p.period_end)
      if (p.projected || pe > lastDay(today)) { projected++; continue }
      const k = p.period_type + ':' + pe
      const cur = out.get(k) ?? { period_type: p.period_type, period_end: pe, lines: {}, kpis: {}, detail: {} }
      for (const r of b.rows) {
        const i = findRow(g, lc, r.row, r.label)
        if (i === null) { if (!missing.includes(b.sheet + ': ' + r.label)) missing.push(b.sheet + ': ' + r.label); continue }
        let v = numAt(g.rows[i]?.[COL(p.col)]); if (v === null) continue
        if (r.pct) { if (Math.abs(v) <= 1.5) v *= 100 } else v *= b.scale
        v = Math.round(v * 100) / 100
        if (r.to === 'kpi') cur.kpis[(r.kpi || r.label).slice(0, 60)] = v
        else if (isCat(r.to)) addFigure({}, cur.detail!, r.to, v)
        else if (!(r.to in cur.lines)) cur.lines[r.to] = v
        found++
      }
      if (Object.keys(cur.lines).length || Object.keys(cur.kpis).length || Object.keys(cur.detail!).length) out.set(k, cur)
    }
  }
  // Months not filled in yet (formula columns showing 0) are not brought in as real zero figures.
  for (const [k, p] of [...out.entries()]) if (blankPeriod(p) === 'all') out.delete(k)
  // The company's own categories fill their standard line when the tab does not give it.
  for (const p of out.values()) if (p.detail && Object.keys(p.detail).length) foldCategories(p.lines, p.detail)
  return { periods: [...out.values()].sort((a, b) => a.period_end.localeCompare(b.period_end) || a.period_type.localeCompare(b.period_type)), projected, missing, found }
}

// Costs are kept as positive figures, however the sheet shows them.
const COSTS = ['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'depreciation', 'interest', 'tax']
export async function writePeriods(subject: string, periods: PeriodOut[], currency: string, userId: string | null): Promise<{ written: number; skipped: string[] }> {
  const s = parseSubject(subject); if (s.kind === 'group') throw apiError('invalid', 'Choose a company or entity.')
  await subjectName(subject)
  const col = s.kind === 'entity' ? 'entity_id' : 'company_id'; let written = 0; const skipped: string[] = []
  // New categories go into the chart of accounts.
  await ensureAccounts([...new Set(periods.flatMap((p) => Object.keys(p.detail ?? {})))].map((k) => ({ parent: k.slice(0, k.indexOf('|')), name: k.slice(k.indexOf('|') + 1) })))
  for (const p of periods) {
    const lines = Object.fromEntries(Object.entries(p.lines).map(([k, v]) => [k, COSTS.includes(k) ? Math.abs(v) : v]))
    const held = holdBadBalanceSheet({ period_end: p.period_end, period_type: p.period_type, lines, detail: p.detail })
    if (held) skipped.push(held)
    const ex = (await db().query<{ id: string; lines: Record<string, number>; kpis: Record<string, number>; detail: Record<string, number>; source: string }>(`SELECT id, lines, kpis, detail, source FROM financials.statements WHERE ${col} = $1 AND period_type = $2 AND period_end = $3`, [s.id, p.period_type, p.period_end])).rows[0]
    const { lines: merged, detail: md } = mergeStatement(ex, lines, p.detail ?? {}, held ? ['bs'] : []), mk = { ...(ex?.kpis ?? {}), ...p.kpis }
    if (balanceError(merged)) { skipped.push(p.period_end + ' (' + p.period_type + '): balance sheet does not balance'); continue }
    if (ex) await db().query("UPDATE financials.statements SET lines = $2, kpis = $3, currency = $4, detail = $5, source = 'sheet', updated_at = now() WHERE id = $1", [ex.id, JSON.stringify(merged), JSON.stringify(mk), currency, JSON.stringify(md)])
    else await db().query(`INSERT INTO financials.statements (${col}, period_type, period_end, currency, lines, kpis, detail, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,'sheet',$8)`, [s.id, p.period_type, p.period_end, currency, JSON.stringify(merged), JSON.stringify(mk), JSON.stringify(md), userId])
    written++
  }
  return { written, skipped: summariseSkipped(skipped) }
}

// A short view of what will come in, for the review step.
export function previewOf(r: ReturnType<typeof readWithMap>) {
  const by = (t: string) => r.periods.filter((p) => p.period_type === t)
  // Where the sheet's own totals do not add up (flagged, not changed: the founder decides).
  const today = new Date().toISOString().slice(0, 10)
  const checks = (['month', 'quarter', 'year'] as const).flatMap((t) => checkRows(by(t).filter((p) => p.period_end <= today).map((p) => ({ period_end: p.period_end, period_type: p.period_type, currency: '', lines: p.lines, kpis: p.kpis, derived: {} })))).slice(-40)
  return { checks, months: by('month').length, quarters: by('quarter').length, years: by('year').length, projected: r.projected, missing: r.missing.slice(0, 20), found: r.found,
    periods: r.periods.slice(-40).map((p) => ({ period_type: p.period_type, period_end: p.period_end, lines: Object.keys(p.lines).length, kpis: Object.keys(p.kpis).length, revenue: p.lines.revenue ?? null, net_income: p.lines.net_income ?? null, cash: p.lines.cash ?? null, total_assets: p.lines.total_assets ?? null, total_liabilities: p.lines.total_liabilities ?? null, equity: p.lines.equity ?? null })) }
}

// ---- Guarding a map against subtotals ------------------------------------------------------------------------
// Whatever the AI returns, code checks it before anything is saved: a row that adds up the rows above it (a section
// subtotal such as Total current assets) can only feed a total line or a KPI, never a part line (cash, other assets,
// other liabilities, an operating cost line) or a category, because its parts are already counted. Labels are checked
// too: total assets or total liabilities can never be a "current" or "non-current" subtotal.
const PART_LINES = new Set(['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets', 'payables', 'debt', 'other_liabilities', 'cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other'])
const SUB_LABEL = /\b(current|non current|noncurrent|fixed|long term|longterm|other assets|bank accounts)\b/
const TOTAL_LABEL = /^(sub ?)?total\b|\b(sub ?)?total$/
const OWN: Record<string, RegExp> = { cash: /\b(cash|bank)/, receivables: /receivable|debtors/, payables: /payable|creditors/, debt: /\b(loan|debt|borrowing)/ }
const GRAND = ['total_assets', 'total_liabilities', 'equity']
const GRAND_SYN: Record<string, string[]> = { total_assets: ['total assets'], total_liabilities: ['total liabilities'], equity: ['total equity', 'total shareholders equity', 'total stockholders equity', 'total members equity', 'net assets', 'total shareholders funds', 'shareholders funds'] }
// Rows (0-based) that equal, in every period column with a figure, the sum of a run of two or more rows directly above
// them; the run stops at a row with no figures (a section heading or a blank line).
export function subtotalRows(g: Grid, cols: number[]): Set<number> {
  const out = new Set<number>(), val = (i: number, c: number) => numAt(g.rows[i]?.[c])
  for (let i = 1; i < g.rows.length; i++) {
    const own = cols.map((c) => val(i, c))
    if (own.filter((v) => v !== null && v !== 0).length < 2) continue
    let n = 0
    for (let start = i - 1; start >= 0 && n < 25; start--) {
      if (!cols.some((c) => val(start, c) !== null)) break
      if (++n < 2) continue
      const ok = cols.every((c, k) => {
        const tv = own[k]; if (tv === null || tv === undefined) return true
        let sum = 0; for (let r = start; r < i; r++) sum += val(r, c) ?? 0
        return Math.abs(sum - tv) <= Math.max(1, Math.abs(tv) * 0.001)
      })
      if (ok) { out.add(i); break }
    }
  }
  return out
}
export function guardMap(grids: Grid[], map0: AiMapT): { map: AiMapT; changed: string[] } {
  const map: AiMapT = JSON.parse(JSON.stringify(map0)), changed: string[] = []
  // Each month column's date is taken from its own heading (Jan '25, 2025-01, an Excel date) when it has one, so a
  // tab is never filed under the wrong year.
  for (const b of map.blocks) {
    const g = grids.find((x) => x.name === b.sheet) ?? grids.find((x) => norm(x.name) === norm(b.sheet)); if (!g) continue
    const first = Math.min(...b.rows.map((r) => r.row - 1), g.rows.length)
    for (const p of b.periods) {
      if (p.period_type !== 'month') continue
      const c = COL(p.col); let head: string | null = null
      for (let i = Math.min(first, 40) - 1; i >= 0 && !head; i--) head = monthOf(g.rows[i]?.[c] ?? null)
      if (head && head !== p.period_end.slice(0, 7)) { changed.push(b.sheet + ' column ' + p.col + ' dated ' + head + ' (was ' + p.period_end.slice(0, 7) + ')'); p.period_end = lastDay(head + '-01') }
    }
  }
  for (const b of map.blocks) {
    const g = grids.find((x) => x.name === b.sheet) ?? grids.find((x) => norm(x.name) === norm(b.sheet)); if (!g) continue
    const subs = subtotalRows(g, b.periods.filter((p) => !p.projected).map((p) => COL(p.col)))
    const lc = COL(b.label_col)
    for (const r of b.rows) {
      const n = norm(r.label), isPart = PART_LINES.has(r.to) || isCat(r.to)
      const i = findRow(g, lc, r.row, r.label)
      // A total of the line's own accounts is fine (Total bank accounts as cash, Total accounts receivable).
      const own = OWN[r.to]?.test(n) ?? false
      const bad = (i !== null && subs.has(i) && isPart && !own)
        || ((r.to === 'total_assets' || r.to === 'total_liabilities') && SUB_LABEL.test(n))
        || (TOTAL_LABEL.test(n) && isPart && !own)
      if (bad) { changed.push(r.label + ' (was ' + r.to + ')'); r.to = 'kpi'; r.kpi = r.label.slice(0, 60) }
    }
  }
  // The grand totals the AI left out (or that were subtotals) come from the row whose label says so.
  for (const b of map.blocks) {
    const g = grids.find((x) => x.name === b.sheet) ?? grids.find((x) => norm(x.name) === norm(b.sheet)); if (!g) continue
    const missing = GRAND.filter((k) => !b.rows.some((r) => r.to === k))
    if (!missing.length || !b.rows.some((r) => isBs(r.to) || r.to === 'kpi')) continue
    const lc = COL(b.label_col)
    g.rows.forEach((row, i) => {
      const l = row[lc]; if (typeof l !== 'string') return
      const k = missing.find((x) => GRAND_SYN[x]!.includes(norm(l)))
      if (k && b.periods.some((p) => numAt(row[COL(p.col)]) !== null) && !b.rows.some((r) => r.to === k)) { b.rows.push({ row: i + 1, label: l.trim().slice(0, 120), to: k, kpi: '', pct: false }); changed.push(l.trim() + ' (added as ' + k + ')') }
    })
  }
  if (changed.length) map.notes = (map.notes + ' Checked and corrected: ' + changed.join('; ') + '.').trim().slice(0, 800)
  return { map, changed }
}

// ---- Checking a map before it is saved -----------------------------------------------------------------------
const BS_CHECKS = ['Total assets', 'Total liabilities', 'Balance sheet']
// The balance sheet add-up checks a map fails on actual periods up to today.
export function bsFailures(grids: Grid[], map: AiMapT): { count: number; first: string[] } {
  const cs = previewOf(readWithMap(grids, map)).checks.filter((c) => BS_CHECKS.includes(c.what))
  return { count: cs.length, first: cs.slice(0, 5).map((c) => c.period_end.slice(0, 7) + ' ' + c.what + ': ' + c.detail) }
}
const BS_KEYS = new Set(LINES_BS())
function LINES_BS() { return ['cash', 'receivables', 'investments', 'long_term_investments', 'other_assets', 'total_assets', 'payables', 'debt', 'other_liabilities', 'total_liabilities', 'equity'] }
const isBs = (to: string) => BS_KEYS.has(to) || (isCat(to) && BS_KEYS.has(to.slice(4, to.indexOf(':', 4))))
// The same blocks with their balance sheet rows chosen by the row-by-row mapper (labels and sections, no AI).
export function rowsMapFor(grids: Grid[], map: AiMapT): AiMapT {
  const out: AiMapT = JSON.parse(JSON.stringify(map))
  for (const b of out.blocks) {
    const g = grids.find((x) => x.name === b.sheet) ?? grids.find((x) => norm(x.name) === norm(b.sheet)); if (!g) continue
    const lc = COL(b.label_col), cols = b.periods.map((p) => COL(p.col))
    const rows: { i: number; label: string; values: Record<string, number> }[] = []
    g.rows.forEach((row, i) => { const l = row[lc]; if (typeof l !== 'string' || !l.trim()) return; const values: Record<string, number> = {}; b.periods.forEach((p, k) => { const v = numAt(row[cols[k]!]); if (v !== null) values[p.period_end.slice(0, 7)] = v }); if (Object.keys(values).length) rows.push({ i, label: l.trim(), values }) })
    const sug = suggestMapping(rows.map((r) => ({ label: r.label, values: r.values })), 'financials')
    const bsRows = sug.map((x, k) => ({ x, r: rows[k]! })).filter(({ x }) => x.to && isBs(x.to)).map(({ x, r }) => ({ row: r.i + 1, label: r.label.slice(0, 120), to: x.to, kpi: '', pct: false }))
    if (!bsRows.length) continue
    b.rows = [...b.rows.filter((r) => !isBs(r.to)), ...bsRows].slice(0, 200)
  }
  return out
}
// A map is checked before it is kept: the guarded AI map, then (if its balance sheet does not add up) the row-by-row
// mapper on the same tabs, then one AI retry that is told which checks failed. The map with the fewest failures is
// kept (the AI map on a tie); what was repaired and what still fails is written in its notes for the review screen.
export async function repairMap(grids: Grid[], map0: AiMapT, retry?: (sheet: string, feedback: string) => Promise<AiMapT['blocks'] | null>): Promise<{ map: AiMapT; failures: number; how: string }> {
  const g0 = guardMap(grids, map0)
  let best = g0.map, score = bsFailures(grids, best), how = g0.changed.length ? 'guarded' : 'ai'
  if (score.count) {
    const alt = rowsMapFor(grids, best), s2 = bsFailures(grids, alt)
    if (s2.count < score.count) { best = alt; score = s2; how = 'rows' }
  }
  if (score.count && retry) {
    const tabs = [...new Set(best.blocks.filter((b) => b.rows.some((r) => isBs(r.to))).map((b) => b.sheet))].slice(0, 3)
    const feedback = 'Your previous map fails these add-up checks: ' + score.first.join(' | ') + '. Fix the map: subtotals inside a section must not map to standard lines or categories; total_assets is the grand total of all assets only.'
    let alt: AiMapT = JSON.parse(JSON.stringify(best))
    for (const sheet of tabs) {
      const blocks = await retry(sheet, feedback).catch(() => null)
      if (blocks?.length) alt = { ...alt, blocks: [...alt.blocks.filter((b) => b.sheet !== sheet), ...blocks] }
    }
    alt = guardMap(grids, alt).map
    const s3 = bsFailures(grids, alt)
    if (s3.count < score.count) { best = alt; score = s3; how = 'retry' }
  }
  const note = how === 'rows' ? 'Balance sheet rows chosen by label because the AI reading did not add up.' : how === 'retry' ? 'Balance sheet read again after the first reading did not add up.' : ''
  const left = score.count ? ' ' + score.count + ' balance sheet check' + (score.count === 1 ? '' : 's') + ' still fail; those months\' balance sheets are held back.' : ''
  if (note || left) best = { ...best, notes: (best.notes + ' ' + note + left).trim().slice(0, 800) }
  return { map: best, failures: score.count, how }
}

// ---- What a sync may write ----------------------------------------------------------------------------------
const BS_LIST = LINES_BS()
// A period whose asset or liability lines do not add up keeps its profit and loss and KPIs, but its balance sheet is
// held back (with the reason) instead of being saved wrong.
export function holdBadBalanceSheet(p: { period_end: string; period_type: string; lines: Record<string, number>; detail?: Record<string, number> }): string | null {
  const fails = checkRow({ period_end: p.period_end, period_type: p.period_type, lines: p.lines }).filter((c) => c.what === 'Total assets' || c.what === 'Total liabilities')
  if (!fails.length) return null
  for (const k of BS_LIST) delete p.lines[k]
  for (const k of Object.keys(p.detail ?? {})) if (BS_KEYS.has(k.slice(0, k.indexOf('|')))) delete p.detail![k]
  const mon = new Date(p.period_end + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return mon + ': balance sheet held back (' + fails[0]!.detail.replace(/\.$/, '') + '). A subtotal may be mapped as a line; read the sheet again with AI or choose the rows.'
}
// Many months held back for the same reason read as one line: how many, which months, and the first reason.
export function summariseSkipped(skipped: string[]): string[] {
  const held = skipped.filter((x) => x.includes('balance sheet held back')), rest = skipped.filter((x) => !x.includes('balance sheet held back'))
  if (held.length <= 2) return skipped
  const mon = (x: string) => x.slice(0, x.indexOf(':'))
  return [...rest, 'balance sheet held back for ' + held.length + ' months (' + mon(held[0]!) + ' to ' + mon(held[held.length - 1]!) + ')' + held[0]!.slice(held[0]!.indexOf(' (')).replace(/\. A subtotal.*$/, '') + '. A row may be mapped to the wrong line: read the sheet again with AI or choose the rows']
}
// Template columns for months not filled in yet (formulas showing 0): a balance sheet that is all zero or blank is
// dropped, and a period with no figure other than zero is skipped entirely.
export function blankPeriod(p: { lines: Record<string, number>; kpis?: Record<string, number>; detail?: Record<string, number> }): 'all' | 'bs' | null {
  const vals = [...Object.values(p.lines), ...Object.values(p.kpis ?? {}), ...Object.values(p.detail ?? {})]
  if (!vals.some((v) => v !== 0)) return 'all'
  const bs = [...BS_LIST.map((k) => p.lines[k]).filter((v) => v !== undefined), ...Object.entries(p.detail ?? {}).filter(([k]) => BS_KEYS.has(k.slice(0, k.indexOf('|')))).map(([, v]) => v)]
  if (bs.length && !bs.some((v) => v !== 0)) { for (const k of BS_LIST) delete p.lines[k]; for (const k of Object.keys(p.detail ?? {})) if (BS_KEYS.has(k.slice(0, k.indexOf('|')))) delete p.detail![k]; return 'bs' }
  return null
}

// ---- Add figures from a spreadsheet ---------------------------------------------------------------------------
// A spreadsheet dropped into "Add figures" (or a Google Sheet pasted there) is read the same way as a linked sheet:
// the Finvry template, or any tab with months across and line names down a column, by fixed rules with no AI. Every period is returned, the asked-for (or latest)
// month first, ready for the founder to check and save. null when nothing could be read this way.
export async function spreadsheetProposal(buf: Buffer, ext: 'xlsx' | 'csv', currency: string, ref: string, wanted: string) {
  const grids = await readGrids(buf, ext, AI_GRID)
  const tmpl = templateMap(grids, currency)
  // No AI for figures: the template, or any tab with months across and line names down a column, read by fixed rules.
  const map = tmpl ?? namesMap(grids, currency)
  if (!map) return null
  const r = readWithMap(grids, map)
  const ps = r.periods.filter((p) => Object.keys(p.lines).length || Object.keys(p.kpis).length)
  if (!ps.length) return null
  const want = /^\d{4}-\d{2}/.test(wanted) ? wanted.slice(0, 7) : ''
  const months = ps.filter((p) => p.period_type === 'month')
  const main = (want && ps.find((p) => p.period_end.slice(0, 7) === want)) || months[months.length - 1] || ps[ps.length - 1]!
  const cats = (d?: Record<string, number>) => Object.entries(d ?? {}).map(([k, value]) => ({ name: k.slice(k.indexOf('|') + 1), line: k.slice(0, k.indexOf('|')), value }))
  const one = (p: PeriodOut) => ({ period_end: p.period_end, period_type: p.period_type, lines: p.lines as Record<string, number | null>, kpis: p.kpis, categories: cats(p.detail) })
  return { ...one(main), currency, more_periods: ps.filter((p) => p !== main).map(one),
    notes: (tmpl ? 'Finvry template: read exactly by its line names, with no AI.' : 'Read by line names from your cells, with no AI. Check any line that did not come in.') + ' ' + ps.length + ' period' + (ps.length === 1 ? '' : 's') + ' found' + (r.projected ? '; ' + r.projected + ' projected or unfinished left out' : '') + '.' + (map.notes && !tmpl ? ' ' + map.notes : '') }
}
