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
const MapRowAi = z.object({ row: z.number().int().min(1).max(5000), label: z.string().max(120), to: z.string().max(40), kpi: z.string().max(60).default(''), pct: z.boolean().default(false) })
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
  'Standard lines (use these keys in "to"): ' + LINE_HELP() + '. Anything else worth tracking (customers, ARR, MRR, churn, headcount, burn, runway, gross margin %, revenue in another currency, volumes) uses to="kpi" with a short kpi name, e.g. "ARR", "Customers", "Revenue (NGN)".',
  'Reporting currency is ' + currency + '. Map standard lines only to rows in that currency; rows in another currency become KPIs named with the currency. Costs can be negative or in brackets; map them anyway.',
  'A block is one table: one label column, the period columns, and the rows. Side-by-side tables are separate blocks (each with its own label column). A balance sheet "as of" a date is a block with one month period ending that date.',
  'Periods: month (period_end = last day of the month), quarter (last day of the quarter), year (fiscal year end; if not stated use 31 Dec). projected=true for E / F / Budget / Forecast / Projected columns, false for A / Actual. LTM or trailing tabs usually hold monthly actuals.',
  'scale: 1000 if the block says figures are in thousands, 1000000 for millions, else 1. pct=true for percentage rows. Do not map the same standard line twice for the same period.',
  'If the tab has no time series (charts, notes, peer lists, investor lists), return no blocks and put what matters in facts.',
  'facts: one-off information (company description, website, share price, shares outstanding, valuation, cap table link, top customers, past or new investors, use of funds), with goes_to: "Company profile", "Cap table", "Fundraising pipeline", "Contacts", "Investor update" or "KPI". At most 12 per tab.',
  'suggestions: up to 3 figures investors expect that this tab lacks or hides, each with why. Keep every text short.'
].join('\n')

// Clips whatever the AI returned to what we keep: unknown keys, bad columns and dates are dropped, never fatal.
const t = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
function cleanTab(sheet: string, o: any, maxRow: number) {
  const keys = new Set([...LINE_KEYS, 'kpi'])
  const blocks = arr(o?.blocks).slice(0, 12).map((b) => ({
    sheet, title: t(b?.title, 120) || sheet, label_col: /^[A-Za-z]{1,3}$/.test(t(b?.label_col, 3)) ? t(b?.label_col, 3).toUpperCase() : 'A',
    scale: [1, 1000, 1000000, 1000000000].includes(Number(b?.scale)) ? Number(b.scale) : 1, use: true,
    periods: arr(b?.periods).filter((p) => /^[A-Za-z]{1,3}$/.test(t(p?.col, 3)) && ['month', 'quarter', 'year'].includes(p?.period_type) && /^\d{4}-\d{2}-\d{2}$/.test(t(p?.period_end, 10)))
      .slice(0, 80).map((p) => ({ col: t(p.col, 3).toUpperCase(), period_type: p.period_type as 'month' | 'quarter' | 'year', period_end: t(p.period_end, 10), projected: !!p.projected })),
    rows: arr(b?.rows).filter((r) => Number.isInteger(Number(r?.row)) && Number(r.row) >= 1 && Number(r.row) <= maxRow + 5 && keys.has(t(r?.to, 40)) && (t(r?.to, 40) !== 'kpi' || t(r?.kpi, 60) || t(r?.label, 120)))
      .slice(0, 200).map((r) => ({ row: Number(r.row), label: t(r.label, 120), to: t(r.to, 40), kpi: t(r.kpi, 60), pct: !!r.pct }))
  })).filter((b) => b.periods.length && b.rows.length)
  return { what: t(o?.what, 200), used: !!o?.used || blocks.length > 0, blocks, notes: t(o?.notes, 300), fiscal_year_end: t(o?.fiscal_year_end, 20),
    company: { name: t(o?.company?.name, 200), description: t(o?.company?.description, 600), website: t(o?.company?.website, 200) },
    facts: arr(o?.facts).slice(0, 12).map((f) => ({ sheet, label: t(f?.label, 120), value: t(f?.value, 300), goes_to: t(f?.goes_to, 80) || 'Other' })).filter((f) => f.label && f.value),
    suggestions: arr(o?.suggestions).slice(0, 3).map((x) => ({ metric: t(x?.metric, 80), why: t(x?.why, 240) })).filter((x) => x.metric) }
}
// A tab worth sending to the AI has some figures in it (chart-only and empty tabs are skipped).
const figures = (g: Grid) => g.rows.reduce((n, r) => n + r.filter((c) => typeof c === 'number').length, 0)

// Reads each tab separately and in parallel (a few at a time): faster than one huge request, and one awkward tab cannot
// sink the rest. onTab reports progress.
export async function mapWorkbook(grids: Grid[], currency: string, ref: string, onTab?: (done: number, total: number, sheet: string) => unknown): Promise<AiMapT> {
  const filled = (g: Grid) => g.rows.reduce((n, r) => n + r.filter((c) => c !== null && c !== '').length, 0)
  const work = grids.filter((g) => figures(g) >= 1 && filled(g) >= 4)
  const skipped = grids.filter((g) => !work.includes(g)).map((g) => ({ sheet: g.name, what: 'Nothing to read (chart or empty tab)', used: false }))
  const model = useRuntimeConfig().aiModelSheets || useRuntimeConfig().aiModelPitchScreen
  const results: { sheet: string; out: ReturnType<typeof cleanTab> | null; error: string | null }[] = []
  let done = 0, i = 0
  const one = async (g: Grid) => {
    try {
      const { output } = await runAiTool({ task: 'sheet_map_tab', model, promptVersion: 'sheet-map-v2', inputRef: ref + '#' + g.name.slice(0, 40), system: SYSTEM(currency),
        user: 'Tab "' + g.name + '" (row number: column=value):\n\n' + workbookText([g], 16000, 16000), toolName: 'map_tab', toolDescription: 'Say where each figure in this tab is.', jsonSchema: TAB_JSON, schema: z.any(), maxTokens: 4000 })
      results.push({ sheet: g.name, out: cleanTab(g.name, output, g.rows.length), error: null })
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode) throw err // AI allowance used up: stop and say so
      console.error('[sheets] tab', g.name, (err as Error).message)
      results.push({ sheet: g.name, out: null, error: (err as Error).message })
    }
    done++; await onTab?.(done, work.length, g.name)
  }
  const workers = Array.from({ length: Math.min(4, work.length) }, async () => { while (i < work.length) await one(work[i++]!) })
  await Promise.all(workers)
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

export interface PeriodOut { period_type: 'month' | 'quarter' | 'year'; period_end: string; lines: Record<string, number>; kpis: Record<string, number> }
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
      const cur = out.get(k) ?? { period_type: p.period_type, period_end: pe, lines: {}, kpis: {} }
      for (const r of b.rows) {
        const i = findRow(g, lc, r.row, r.label)
        if (i === null) { if (!missing.includes(b.sheet + ': ' + r.label)) missing.push(b.sheet + ': ' + r.label); continue }
        let v = numAt(g.rows[i]?.[COL(p.col)]); if (v === null) continue
        if (r.pct) { if (Math.abs(v) <= 1.5) v *= 100 } else v *= b.scale
        v = Math.round(v * 100) / 100
        if (r.to === 'kpi') cur.kpis[(r.kpi || r.label).slice(0, 60)] = v
        else if (!(r.to in cur.lines)) cur.lines[r.to] = v
        found++
      }
      if (Object.keys(cur.lines).length || Object.keys(cur.kpis).length) out.set(k, cur)
    }
  }
  return { periods: [...out.values()].sort((a, b) => a.period_end.localeCompare(b.period_end) || a.period_type.localeCompare(b.period_type)), projected, missing, found }
}

// Costs are kept as positive figures, however the sheet shows them.
const COSTS = ['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other', 'opex_total', 'depreciation', 'interest', 'tax']
export async function writePeriods(subject: string, periods: PeriodOut[], currency: string, userId: string | null): Promise<{ written: number; skipped: string[] }> {
  const s = parseSubject(subject); if (s.kind === 'group') throw apiError('invalid', 'Choose a company or entity.')
  await subjectName(subject)
  const col = s.kind === 'entity' ? 'entity_id' : 'company_id'; let written = 0; const skipped: string[] = []
  for (const p of periods) {
    const lines = Object.fromEntries(Object.entries(p.lines).map(([k, v]) => [k, COSTS.includes(k) ? Math.abs(v) : v]))
    const ex = (await db().query<{ id: string; lines: Record<string, number>; kpis: Record<string, number> }>(`SELECT id, lines, kpis FROM financials.statements WHERE ${col} = $1 AND period_type = $2 AND period_end = $3`, [s.id, p.period_type, p.period_end])).rows[0]
    const merged = { ...(ex?.lines ?? {}), ...lines }, mk = { ...(ex?.kpis ?? {}), ...p.kpis }
    if (balanceError(merged)) { skipped.push(p.period_end + ' (' + p.period_type + '): balance sheet does not balance'); continue }
    if (ex) await db().query("UPDATE financials.statements SET lines = $2, kpis = $3, currency = $4, source = 'sheet', updated_at = now() WHERE id = $1", [ex.id, JSON.stringify(merged), JSON.stringify(mk), currency])
    else await db().query(`INSERT INTO financials.statements (${col}, period_type, period_end, currency, lines, kpis, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,'sheet',$7)`, [s.id, p.period_type, p.period_end, currency, JSON.stringify(merged), JSON.stringify(mk), userId])
    written++
  }
  return { written, skipped }
}

// A short view of what will come in, for the review step.
export function previewOf(r: ReturnType<typeof readWithMap>) {
  const by = (t: string) => r.periods.filter((p) => p.period_type === t)
  return { months: by('month').length, quarters: by('quarter').length, years: by('year').length, projected: r.projected, missing: r.missing.slice(0, 20), found: r.found,
    periods: r.periods.slice(-40).map((p) => ({ period_type: p.period_type, period_end: p.period_end, lines: Object.keys(p.lines).length, kpis: Object.keys(p.kpis).length, revenue: p.lines.revenue ?? null, net_income: p.lines.net_income ?? null, cash: p.lines.cash ?? null })) }
}
