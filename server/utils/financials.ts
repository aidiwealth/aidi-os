import { fillCashFlow } from '~/shared/fin-view'
import { consolidate, type Member } from './intercompany'
import { consolidateKpis, type KpiRule } from './kpi-consolidate'
// Standard financial lines, derived figures, and the consolidated (group) view.
export const LINES: { key: string; label: string; section: 'pl' | 'bs' | 'cf' }[] = [
  { key: 'revenue', label: 'Revenue', section: 'pl' }, { key: 'cogs', label: 'Cost of revenue', section: 'pl' }, { key: 'gross_profit', label: 'Gross profit', section: 'pl' },
  { key: 'opex_payroll', label: 'Payroll', section: 'pl' }, { key: 'opex_marketing', label: 'Sales & marketing', section: 'pl' }, { key: 'opex_rnd', label: 'Research & development', section: 'pl' },
  { key: 'opex_ga', label: 'General & administrative', section: 'pl' }, { key: 'opex_other', label: 'Other operating costs', section: 'pl' }, { key: 'opex_total', label: 'Total operating costs', section: 'pl' },
  { key: 'ebitda', label: 'EBITDA', section: 'pl' }, { key: 'depreciation', label: 'Depreciation & amortisation', section: 'pl' }, { key: 'interest', label: 'Interest expense', section: 'pl' },
  { key: 'other_income', label: 'Other income (interest, dividends, gains)', section: 'pl' }, { key: 'tax', label: 'Tax', section: 'pl' }, { key: 'net_income', label: 'Net income', section: 'pl' },
  { key: 'cash', label: 'Cash', section: 'bs' }, { key: 'receivables', label: 'Receivables', section: 'bs' }, { key: 'investments', label: 'Short-term investments (treasury bills, deposits)', section: 'bs' },
  { key: 'long_term_investments', label: 'Long-term investments and stakes', section: 'bs' }, { key: 'other_assets', label: 'Other assets', section: 'bs' }, { key: 'total_assets', label: 'Total assets', section: 'bs' }, { key: 'payables', label: 'Payables', section: 'bs' },
  { key: 'debt', label: 'Debt', section: 'bs' }, { key: 'other_liabilities', label: 'Other liabilities', section: 'bs' }, { key: 'total_liabilities', label: 'Total liabilities', section: 'bs' },
  { key: 'equity', label: 'Equity', section: 'bs' },
  { key: 'operating_cf', label: 'Operating cash flow', section: 'cf' }, { key: 'investing_cf', label: 'Investing cash flow', section: 'cf' }, { key: 'financing_cf', label: 'Financing cash flow', section: 'cf' }
]
export const LINE_KEYS = LINES.map((l) => l.key)
export const DERIVED = [{ key: 'gross_margin', label: 'Gross margin %' }, { key: 'burn', label: 'Monthly burn' }, { key: 'runway', label: 'Runway (months)' }]
type L = Record<string, number | null | undefined>
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const sum = (...v: (number | null)[]) => (v.some((x) => x !== null) ? v.reduce<number>((t, x) => t + (x ?? 0), 0) : null)

export function derive(lines: L, periodType: string): Record<string, number | null> {
  const g = (k: string) => n(lines[k])
  const months = periodType === 'year' ? 12 : periodType === 'quarter' ? 3 : 1
  const gross = g('gross_profit') ?? (g('revenue') !== null ? (g('revenue') ?? 0) - (g('cogs') ?? 0) : null)
  const opex = g('opex_total') ?? sum(g('opex_payroll'), g('opex_marketing'), g('opex_rnd'), g('opex_ga'), g('opex_other'))
  const ebitda = g('ebitda') ?? (gross !== null || opex !== null ? (gross ?? 0) - (opex ?? 0) : null)
  const ocf = g('operating_cf'), ni = g('net_income')
  const burn = ocf !== null ? Math.max(0, -ocf / months) : ni !== null ? Math.max(0, -ni / months) : null
  const cash = g('cash')
  const out: Record<string, number | null> = {}
  for (const k of LINE_KEYS) out[k] = g(k)
  out.gross_profit = gross; out.opex_total = opex; out.ebitda = ebitda
  out.gross_margin = gross !== null && g('revenue') ? Math.round((gross / (g('revenue') as number)) * 1000) / 10 : null
  out.burn = burn === null ? null : Math.round(burn)
  out.runway = burn && cash !== null ? Math.round((cash / burn) * 10) / 10 : null
  return out
}

// A balance sheet must balance (assets = liabilities + equity) when all three totals are given.
export function balanceError(lines: L): string | null {
  const a = n(lines.total_assets), l = n(lines.total_liabilities), e = n(lines.equity)
  if (a === null || l === null || e === null) return null
  const diff = a - (l + e)
  return Math.abs(diff) <= Math.max(1, Math.abs(a) * 0.0005) ? null : 'The balance sheet does not balance: total assets differ from liabilities plus equity by ' + diff.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '.'
}

export function parseSubject(s: string): { kind: 'group' } | { kind: 'entity' | 'company'; id: string } {
  if (s === 'group') return { kind: 'group' }
  const m = s.match(/^(entity|company):([0-9a-f-]{36})$/)
  if (!m) throw apiError('invalid', 'Choose what the figures are for.')
  return { kind: m[1] as 'entity' | 'company', id: m[2]! }
}

export interface FinRow { id: string | null; period_end: string; period_type: string; currency: string; lines: L; kpis: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; document_id: string | null; detail?: Record<string, number>; eliminated?: import('./intercompany').Eliminated }
// Statements for one subject, or the group: all entities plus subsidiary companies, summed per period in one currency.
async function loadStatementsBase(subject: string, periodType: string, currency: string): Promise<FinRow[]> {
  const s = parseSubject(subject)
  if (s.kind !== 'group') {
    const r = await db().query<FinRow>(`SELECT id, to_char(period_end, 'YYYY-MM-DD') AS period_end, period_type, currency, lines, kpis, notes, show_to_lps, source, document_id, detail
      FROM financials.statements WHERE ${s.kind === 'entity' ? 'entity_id' : 'company_id'} = $1 AND period_type = $2 ORDER BY period_end`, [s.id, periodType])
    return r.rows
  }
  // A company with subsidiaries adds them all up and takes out intercompany balances and trading (see intercompany.ts).
  // Other currencies convert at the company's own monthly rate for that period when it has one (fx.monthly), else the latest daily rate.
  const company = (await currentOrg())?.kind === 'company'
  const r = await db().query<{ period_end: string; lines: L; detail: Record<string, number> | null; currency: string; who: string | null; kpis: Record<string, number> | null }>(`SELECT to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.lines, s.detail, s.kpis, s.currency, coalesce(e.name, c.name) AS who FROM financials.statements s
      LEFT JOIN portfolio.companies c ON c.id = s.company_id LEFT JOIN core.entities e ON e.id = s.entity_id WHERE s.period_type = $1 AND ($3 OR s.currency = $2) AND (s.entity_id IS NOT NULL OR c.relationship = 'subsidiary') ORDER BY s.period_end`, [periodType, currency, company])
  const tagged = new Set((await db().query<{ name: string }>('SELECT lower(name) AS name FROM financials.accounts WHERE intercompany').catch(() => ({ rows: [] as { name: string }[] }))).rows.map((x) => x.name))
  const kpiRules = ((await currentOrg())?.settings.kpi_rules ?? {}) as Record<string, KpiRule>
  const by = new Map<string, (Member & { kpis: Record<string, number> | null })[]>(), rates = new Map<string, number | null>()
  for (const x of r.rows) {
    const rk = x.currency + '>' + x.period_end.slice(0, 7)
    if (!rates.has(rk)) rates.set(rk, x.currency === currency ? 1 : await fxRateAt(x.currency, currency, x.period_end))
    const rate = rates.get(rk)
    if (!rate) continue
    const list = by.get(x.period_end) ?? []
    list.push({ lines: x.lines, detail: x.detail, kpis: x.kpis, rate, who: x.who ?? '' })
    by.set(x.period_end, list)
  }
  return [...by.entries()].map(([period_end, members]) => {
    const { lines, eliminated } = consolidate(members, LINE_KEYS, tagged)
    // KPIs: counts added, money KPIs converted then added, ratios (e.g. CAC per new customer) worked out again from the
    // group totals (kpi-consolidate.ts). The eliminations ride on the row (shown under the group figures), not as KPIs.
    const kpis: Record<string, number> = consolidateKpis(members, kpiRules)
    const notes = Math.abs(eliminated.unreconciled) > Math.max(1, Math.abs(n(lines.total_assets) ?? 0) * 0.0005)
      ? 'Intercompany balances do not agree between the companies by ' + eliminated.unreconciled.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ' + currency + '; the difference is taken through group equity.' : null
    return { id: null, period_end, period_type: periodType, currency, lines, kpis, notes, show_to_lps: false, source: 'group', document_id: null, eliminated }
  })
}

// How many units of `to` one unit of `from` is worth for a period: the company's own monthly rate (e.g. the book rates on
// a template's Exchange rates tab) when there is one within three months, else the latest daily rate.
async function fxRateAt(from: string, to: string, periodEnd: string): Promise<number | null> {
  if (from === to) return 1
  const month = periodEnd.slice(0, 7) + '-01'
  const q = await db().query<{ quote: string; per_usd: string }>(`SELECT DISTINCT ON (quote) quote, per_usd::text FROM fx.monthly
      WHERE quote = ANY($1) AND month <= $2::date AND month > $2::date - interval '3 months' ORDER BY quote, month DESC`, [[from, to].filter((c) => c !== 'USD'), month])
  const m = new Map(q.rows.map((x) => [x.quote, Number(x.per_usd)]))
  const a = from === 'USD' ? 1 : m.get(from), b = to === 'USD' ? 1 : m.get(to)
  if (a && b) return b / a
  return fxRate(from, to)
}

export async function subjectName(subject: string): Promise<string> {
  const s = parseSubject(subject)
  if (s.kind === 'group') return (await currentOrg())?.name + ' (group)'
  const r = await db().query<{ name: string }>(`SELECT name FROM ${s.kind === 'entity' ? 'core.entities' : 'portfolio.companies'} WHERE id = $1`, [s.id])
  if (!r.rows[0]) throw apiError('not_found', 'Not found', 404)
  return r.rows[0].name
}

// How the lines that are easy to get wrong are mapped, for every AI that reads figures.
export const INVEST_RULES = 'investments is ONLY short-term, liquid holdings that can be turned into cash within a year (treasury bills, money market, fixed deposits, marketable securities); a row that already says "Cash and marketable securities" is cash. ' +
  'Strategic investments, equity stakes in other companies, investments in associates or subsidiaries, notes receivable and loans given are NEVER cash or investments: use long_term_investments for stakes and long-term holdings, and other_assets for loans and notes receivable. ' +
  'interest is interest EXPENSE only. Interest income, dividend income, FX gains, gains or losses on disposal and other non-operating items go to other_income (income positive, losses negative). ' +
  'equity is TOTAL equity (Total equity, Total stockholders\' or shareholders\' equity, Net assets, Shareholders\' funds), never one part of it such as paid-in capital, share capital or retained earnings; when there is no total, leave equity null and list the parts as categories with line "equity".'
// AI reads an uploaded sheet into the standard lines. Never estimates; the user confirms before saving.
const numN = { type: ['number', 'null'] }
const SCHEMA = { type: 'object', additionalProperties: false, required: ['period_end', 'period_type', 'currency', 'lines', 'kpis', 'notes', 'categories'], properties: {
  period_end: { type: ['string', 'null'], description: 'Last day of the period, YYYY-MM-DD' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] },
  currency: { type: 'string', description: 'ISO currency code, e.g. USD or NGN' },
  lines: { type: 'object', additionalProperties: false, required: LINE_KEYS, properties: Object.fromEntries(LINE_KEYS.map((k) => [k, numN])) },
  kpis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } }, description: 'Non-financial KPIs in the sheet (customers, headcount, AUM...), at most 10' },
  notes: { type: 'string', description: 'One or two lines: which sheet/columns you used, units, anything unclear' },
  categories: { type: 'array', description: 'The company\'s own items for the main period that are not a standard line (e.g. Consultants, Software & Apps, Loans receivable, Paid-in capital, Interest income), each with the standard line it belongs to ("" if none). Still fill the standard line itself with its total.', items: { type: 'object', additionalProperties: false, required: ['name', 'line', 'value'], properties: { name: { type: 'string' }, line: { type: 'string' }, value: { type: 'number' } } } },
  more_periods: { type: 'array', description: 'Every OTHER period the file has figures for (not the one above), oldest first, at most 24. Empty if only one.', items: { type: 'object', additionalProperties: false, required: ['period_end', 'period_type', 'lines', 'kpis'], properties: {
    period_end: { type: 'string', description: 'YYYY-MM-DD' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] },
    lines: { type: 'object', additionalProperties: false, required: LINE_KEYS, properties: Object.fromEntries(LINE_KEYS.map((k) => [k, numN])) },
    kpis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } } },
    categories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'line', 'value'], properties: { name: { type: 'string' }, line: { type: 'string' }, value: { type: 'number' } } } } } } } } }
export async function extractStatement(text: string, wanted: string, inputRef: string, pdf?: Buffer) {
  const { z } = await import('zod')
  const Lines = z.record(z.string(), z.number().finite().nullable()), Kpis = z.array(z.object({ name: z.string().max(60), value: z.number().finite() })).max(10)
  const Cats = z.array(z.object({ name: z.string().max(80), line: z.string().max(40), value: z.number().finite() })).max(40).default([]).transform((a) => a.filter((c) => c.name.trim() && (c.line === '' || LINE_KEYS.includes(c.line))))
  const Out = z.object({ period_end: z.string().nullable(), period_type: z.enum(['month', 'quarter', 'year']), currency: z.string().max(3), lines: Lines, kpis: Kpis, notes: z.string().max(600),
    more_periods: z.array(z.object({ period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period_type: z.enum(['month', 'quarter', 'year']), lines: Lines, kpis: Kpis, categories: Cats })).max(24).default([]), categories: Cats })
  const ask = 'Period wanted: ' + wanted
  const { output } = await runAiTool({ task: 'financials_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'financials-extract-v3', inputRef,
    system: 'You read a financial document and map it to standard lines. It may be a spreadsheet or a PDF: a profit and loss, balance sheet, cash flow, management accounts, a KPI sheet, or a BANK STATEMENT. ' +
      'Only use numbers that appear in it; if a line is not clearly present, return null, never estimate. Costs and expenses are positive numbers; net income, EBITDA and cash flows keep their sign (losses negative). ' +
      INVEST_RULES + ' ' +
      'For a bank statement: cash = the closing balance at the end of each month; operating_cf = money in minus money out for that month; put "Money in" and "Money out" totals in kpis; never treat deposits as revenue. ' +
      'Use the requested period for the main figures (else the latest) and put EVERY other period the document covers in more_periods, so they can all be saved at once. Convert thousands notation to full numbers and apply any stated units (e.g. "in thousands").',
    user: ask + '\n\nSpreadsheet:\n' + text,
    userContent: pdf ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } }, { type: 'text', text: ask }] : undefined,
    toolName: 'record_statement', toolDescription: 'Record the statement mapped to standard lines.', jsonSchema: SCHEMA, schema: Out, maxTokens: 6000 })
  return output
}

// Statements for a subject. Companies with a reporting currency see figures converted at the latest daily rate
// (display only; stored figures are unchanged). Pass { raw: true } for the original currency.
// When the company said yes, periods without a cash flow statement get one worked out from the P&L and balance sheet
// (marked cf_generated; stored figures are unchanged).
export async function loadStatements(subject: string, periodType: string, currency: string, opts: { raw?: boolean } = {}): Promise<(Awaited<ReturnType<typeof loadStatementsBase>>[number] & { cf_generated?: boolean })[]> {
  const base = await loadStatementsBase(subject, periodType, currency)
  const rows = parseSubject(subject).kind !== 'group' && (await cashFlowPolicy(subject)) === true ? fillCashFlow(base) : base
  if (opts.raw || parseSubject(subject).kind === 'group') return rows
  const org = await currentOrg()
  const rep = org?.kind === 'company' ? (org.settings.reporting_currency as string | undefined) : undefined
  if (!rep) return rows
  const out: typeof rows = []
  for (const row of rows) {
    if (row.currency === rep) { out.push(row); continue }
    const k = await fxRate(row.currency, rep)
    if (!k) { out.push(row); continue }
    out.push({ ...row, currency: rep, lines: Object.fromEntries(Object.entries(row.lines).map(([key, v]) => [key, typeof v === 'number' ? Math.round(v * k * 100) / 100 : v])) as typeof row.lines })
  }
  return out
}
// Whether the company asked for a cash flow statement worked out from its P&L and balance sheet: true, false, or null
// (not asked yet). Kept per company or entity.
export async function cashFlowPolicy(subject: string): Promise<boolean | null> {
  const v = ((await currentOrg())?.settings.cf_auto as Record<string, boolean> | undefined)?.[subject]
  return typeof v === 'boolean' ? v : null
}
// Whether this workspace counts marketable securities (treasury bills) with cash (asked once on Financials).
export async function cashPolicy(): Promise<boolean> { return (await currentOrg())?.settings.cash_with_securities === true }
