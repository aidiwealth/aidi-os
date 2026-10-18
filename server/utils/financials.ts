// Standard financial lines, derived figures, and the consolidated (group) view.
export const LINES: { key: string; label: string; section: 'pl' | 'bs' | 'cf' }[] = [
  { key: 'revenue', label: 'Revenue', section: 'pl' }, { key: 'cogs', label: 'Cost of revenue', section: 'pl' }, { key: 'gross_profit', label: 'Gross profit', section: 'pl' },
  { key: 'opex_payroll', label: 'Payroll', section: 'pl' }, { key: 'opex_marketing', label: 'Sales & marketing', section: 'pl' }, { key: 'opex_rnd', label: 'Research & development', section: 'pl' },
  { key: 'opex_ga', label: 'General & administrative', section: 'pl' }, { key: 'opex_other', label: 'Other operating costs', section: 'pl' }, { key: 'opex_total', label: 'Total operating costs', section: 'pl' },
  { key: 'ebitda', label: 'EBITDA', section: 'pl' }, { key: 'depreciation', label: 'Depreciation & amortisation', section: 'pl' }, { key: 'interest', label: 'Interest', section: 'pl' },
  { key: 'tax', label: 'Tax', section: 'pl' }, { key: 'net_income', label: 'Net income', section: 'pl' },
  { key: 'cash', label: 'Cash', section: 'bs' }, { key: 'receivables', label: 'Receivables', section: 'bs' }, { key: 'investments', label: 'Investments (fair value)', section: 'bs' },
  { key: 'other_assets', label: 'Other assets', section: 'bs' }, { key: 'total_assets', label: 'Total assets', section: 'bs' }, { key: 'payables', label: 'Payables', section: 'bs' },
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

export interface FinRow { id: string | null; period_end: string; period_type: string; currency: string; lines: L; kpis: Record<string, number>; notes: string | null; show_to_lps: boolean; source: string; document_id: string | null }
// Statements for one subject, or the group: all entities plus subsidiary companies, summed per period in one currency.
async function loadStatementsBase(subject: string, periodType: string, currency: string): Promise<FinRow[]> {
  const s = parseSubject(subject)
  if (s.kind !== 'group') {
    const r = await db().query<FinRow>(`SELECT id, to_char(period_end, 'YYYY-MM-DD') AS period_end, period_type, currency, lines, kpis, notes, show_to_lps, source, document_id
      FROM financials.statements WHERE ${s.kind === 'entity' ? 'entity_id' : 'company_id'} = $1 AND period_type = $2 ORDER BY period_end`, [s.id, periodType])
    return r.rows
  }
  // A company with subsidiaries adds them all up, converting other currencies at the latest daily rate.
  const company = (await currentOrg())?.kind === 'company'
  const r = await db().query<{ period_end: string; lines: L; currency: string }>(`SELECT to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.lines, s.currency FROM financials.statements s
      LEFT JOIN portfolio.companies c ON c.id = s.company_id WHERE s.period_type = $1 AND ($3 OR s.currency = $2) AND (s.entity_id IS NOT NULL OR c.relationship = 'subsidiary') ORDER BY s.period_end`, [periodType, currency, company])
  const by = new Map<string, L>()
  for (const x of r.rows) {
    const k0 = x.currency === currency ? 1 : await fxRate(x.currency, currency)
    if (!k0) continue
    const t = by.get(x.period_end) ?? {}
    for (const k of LINE_KEYS) { const v = n(x.lines[k]); if (v !== null) t[k] = (n(t[k]) ?? 0) + v * k0 }
    by.set(x.period_end, t)
  }
  return [...by.entries()].map(([period_end, lines]) => ({ id: null, period_end, period_type: periodType, currency, lines, kpis: {}, notes: null, show_to_lps: false, source: 'group', document_id: null }))
}

export async function subjectName(subject: string): Promise<string> {
  const s = parseSubject(subject)
  if (s.kind === 'group') return (await currentOrg())?.name + ' (group)'
  const r = await db().query<{ name: string }>(`SELECT name FROM ${s.kind === 'entity' ? 'core.entities' : 'portfolio.companies'} WHERE id = $1`, [s.id])
  if (!r.rows[0]) throw apiError('not_found', 'Not found', 404)
  return r.rows[0].name
}

// AI reads an uploaded sheet into the standard lines. Never estimates; the user confirms before saving.
const numN = { type: ['number', 'null'] }
const SCHEMA = { type: 'object', additionalProperties: false, required: ['period_end', 'period_type', 'currency', 'lines', 'kpis', 'notes'], properties: {
  period_end: { type: ['string', 'null'], description: 'Last day of the period, YYYY-MM-DD' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] },
  currency: { type: 'string', description: 'ISO currency code, e.g. USD or NGN' },
  lines: { type: 'object', additionalProperties: false, required: LINE_KEYS, properties: Object.fromEntries(LINE_KEYS.map((k) => [k, numN])) },
  kpis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } }, description: 'Non-financial KPIs in the sheet (customers, headcount, AUM...), at most 10' },
  notes: { type: 'string', description: 'One or two lines: which sheet/columns you used, units, anything unclear' },
  more_periods: { type: 'array', description: 'Every OTHER period the file has figures for (not the one above), oldest first, at most 24. Empty if only one.', items: { type: 'object', additionalProperties: false, required: ['period_end', 'period_type', 'lines', 'kpis'], properties: {
    period_end: { type: 'string', description: 'YYYY-MM-DD' }, period_type: { type: 'string', enum: ['month', 'quarter', 'year'] },
    lines: { type: 'object', additionalProperties: false, required: LINE_KEYS, properties: Object.fromEntries(LINE_KEYS.map((k) => [k, numN])) },
    kpis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } } } } } } } }
export async function extractStatement(text: string, wanted: string, inputRef: string, pdf?: Buffer) {
  const { z } = await import('zod')
  const Lines = z.record(z.string(), z.number().finite().nullable()), Kpis = z.array(z.object({ name: z.string().max(60), value: z.number().finite() })).max(10)
  const Out = z.object({ period_end: z.string().nullable(), period_type: z.enum(['month', 'quarter', 'year']), currency: z.string().max(3), lines: Lines, kpis: Kpis, notes: z.string().max(600),
    more_periods: z.array(z.object({ period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period_type: z.enum(['month', 'quarter', 'year']), lines: Lines, kpis: Kpis })).max(24).default([]) })
  const ask = 'Period wanted: ' + wanted
  const { output } = await runAiTool({ task: 'financials_extract', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'financials-extract-v2', inputRef,
    system: 'You read a financial document and map it to standard lines. It may be a spreadsheet or a PDF: a profit and loss, balance sheet, cash flow, management accounts, a KPI sheet, or a BANK STATEMENT. ' +
      'Only use numbers that appear in it; if a line is not clearly present, return null, never estimate. Costs and expenses are positive numbers; net income, EBITDA and cash flows keep their sign (losses negative). ' +
      'For a bank statement: cash = the closing balance at the end of each month; operating_cf = money in minus money out for that month; put "Money in" and "Money out" totals in kpis; never treat deposits as revenue. ' +
      'Use the requested period for the main figures (else the latest) and put EVERY other period the document covers in more_periods, so they can all be saved at once. Convert thousands notation to full numbers and apply any stated units (e.g. "in thousands").',
    user: ask + '\n\nSpreadsheet:\n' + text,
    userContent: pdf ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } }, { type: 'text', text: ask }] : undefined,
    toolName: 'record_statement', toolDescription: 'Record the statement mapped to standard lines.', jsonSchema: SCHEMA, schema: Out, maxTokens: 6000 })
  return output
}

// Statements for a subject. Companies with a reporting currency see figures converted at the latest daily rate
// (display only; stored figures are unchanged). Pass { raw: true } for the original currency.
export async function loadStatements(subject: string, periodType: string, currency: string, opts: { raw?: boolean } = {}): Promise<Awaited<ReturnType<typeof loadStatementsBase>>> {
  const rows = await loadStatementsBase(subject, periodType, currency)
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
// Whether this workspace counts marketable securities (treasury bills) with cash (asked once on Financials).
export async function cashPolicy(): Promise<boolean> { return (await currentOrg())?.settings.cash_with_securities === true }
