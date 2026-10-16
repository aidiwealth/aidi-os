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
export async function mapWorkbook(grids: Grid[], currency: string, ref: string): Promise<AiMapT> {
  const system = [
    'You map a company\'s financial workbook so its figures can be read from the cells automatically. You never copy numbers: you say where they are (tab, row number, column letter).',
    'Standard lines (use these keys in "to"): ' + LINE_HELP() + '. Anything else worth tracking (customers, ARR, MRR, churn, headcount, burn, runway, gross margin %, revenue in another currency, volumes) uses to="kpi" with a short kpi name, e.g. "ARR", "Customers", "Revenue (NGN)".',
    'Reporting currency is ' + currency + '. Map standard lines only to rows in that currency; rows in another currency become KPIs named with the currency. Costs can be negative or in brackets; map them anyway.',
    'A block is one table: one label column, the period columns, and the rows. Side-by-side tables on one tab are separate blocks (each with its own label column). A balance sheet "as of" a date is a block with one month period ending that date.',
    'Periods: month (period_end = last day of the month), quarter (last day of the quarter), year (fiscal year end; if not stated use 31 Dec). Mark projected=true for E / F / Budget / Forecast / Projected columns, false for A / Actual. LTM or trailing tabs usually hold monthly actuals.',
    'scale: 1000 if the block says figures are in thousands, 1000000 for millions, else 1. pct=true for rows that are percentages.',
    'Leave out subtotals that duplicate a mapped line only if you already mapped the components AND the total line has its own key (e.g. map both opex lines and opex_total if present). Do not map the same standard line twice for the same period from different rows; prefer the most detailed, most recent tab (monthly over quarterly over annual are all fine, as they are different periods).',
    'facts: one-off information that is not a time series (company description, website, share price, shares outstanding, valuation, cap table link, top customers, past or new investors, use of funds), with goes_to naming where it belongs in Finvry: "Company profile", "Cap table", "Fundraising pipeline", "Contacts", "Investor update", "KPI". At most 60.',
    'suggestions: up to 8 figures investors expect that the workbook lacks or hides (e.g. monthly cash and burn, runway, net revenue retention, CAC payback, headcount by team), each with why. tabs: every tab with what it holds and whether you used it.'
  ].join('\n')
  const json = {
    type: 'object', additionalProperties: false, required: ['company', 'reporting_currency', 'fiscal_year_end', 'tabs', 'blocks', 'facts', 'suggestions', 'notes'], properties: {
      company: { type: 'object', additionalProperties: false, required: ['name', 'description', 'website'], properties: { name: { type: 'string' }, description: { type: 'string' }, website: { type: 'string' } } },
      reporting_currency: { type: 'string' }, fiscal_year_end: { type: 'string', description: 'e.g. 31 Dec' },
      tabs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sheet', 'what', 'used'], properties: { sheet: { type: 'string' }, what: { type: 'string' }, used: { type: 'boolean' } } } },
      blocks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sheet', 'title', 'label_col', 'scale', 'periods', 'rows'], properties: {
        sheet: { type: 'string' }, title: { type: 'string' }, label_col: { type: 'string', description: 'Column letter of the row labels' }, scale: { type: 'number' },
        periods: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['col', 'period_type', 'period_end', 'projected'], properties: { col: { type: 'string' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] }, period_end: { type: 'string', description: 'YYYY-MM-DD' }, projected: { type: 'boolean' } } } },
        rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['row', 'label', 'to', 'kpi', 'pct'], properties: { row: { type: 'integer' }, label: { type: 'string', description: 'The label exactly as in the label column' }, to: { type: 'string' }, kpi: { type: 'string' }, pct: { type: 'boolean' } } } } } } },
      facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sheet', 'label', 'value', 'goes_to'], properties: { sheet: { type: 'string' }, label: { type: 'string' }, value: { type: 'string' }, goes_to: { type: 'string' } } } },
      suggestions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['metric', 'why'], properties: { metric: { type: 'string' }, why: { type: 'string' } } } },
      notes: { type: 'string', description: 'Anything the user should know (e.g. figures in two currencies, a tab skipped, checks that fail).' } } }
  const { output } = await runAiTool({ task: 'sheet_map', model: useRuntimeConfig().aiModelSheets || useRuntimeConfig().aiModelPitchScreen, promptVersion: 'sheet-map-v1', inputRef: ref,
    system, user: 'Workbook (row number: column=value):\n\n' + workbookText(grids), toolName: 'map_workbook', toolDescription: 'Say where each figure is in the workbook.', jsonSchema: json, schema: AiMap, maxTokens: 12000 })
  // Keep only keys we know.
  const keys = new Set([...LINE_KEYS, 'kpi'])
  for (const b of output.blocks) b.rows = b.rows.filter((r) => keys.has(r.to) && (r.to !== 'kpi' || (r.kpi || r.label).trim()))
  output.blocks = output.blocks.filter((b) => b.rows.length && b.periods.length)
  return output
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
