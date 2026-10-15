// Past portfolio reports uploaded as PDFs (investor updates, forwarded emails, fund-utilisation reports): AI reads the
// file and proposes the figures and notes; a person checks them, then they are saved into the company's monthly figures
// (in US dollars, at the rate shown) and founder notes. Corrections a person made earlier are never overwritten.
import { z } from 'zod'
// The AI reports each amount exactly as printed (number, scale word, currency, and the US-dollar figure when the report
// prints one alongside); the server does the scaling and currency conversion, so "₦361.14m ($263k)", "$8.4m" or
// "N11.65 billion" can never be mis-scaled, and reports that mix naira and dollars come out in one currency.
const MONEY = { type: ['object', 'null'], additionalProperties: false, required: ['amount', 'scale', 'currency', 'usd_amount', 'usd_scale'], properties: {
  amount: { type: 'number', description: 'The number as printed, without its scale word: "N361.14m" → 361.14; "$352,944.41" → 352944.41.' },
  scale: { type: 'string', enum: ['unit', 'thousand', 'million', 'billion'], description: 'k/K/thousand → thousand; m/M/mn/million → million; b/bn/billion → billion; otherwise unit.' },
  currency: { type: 'string', description: 'Currency of this amount as printed: NGN for ₦/N/naira, USD for $, KES, GHS, ZAR, GBP, EUR…' },
  usd_amount: { type: ['number', 'null'], description: 'Only if the report prints the US-dollar equivalent right next to it, e.g. "(\u0024263k)" → 263. Otherwise null.' },
  usd_scale: { type: ['string', 'null'], enum: ['unit', 'thousand', 'million', 'billion', null] } } }
const NUM = { type: ['number', 'null'] }
const SCHEMA = { type: 'object', additionalProperties: false,
  required: ['company', 'title', 'period_label', 'periods', 'other_kpis', 'highlights', 'challenges', 'asks', 'has_figures', 'notes'],
  properties: {
    company: { type: ['string', 'null'], description: 'The company the report is about, as named in it.' },
    title: { type: 'string', description: 'Short title, e.g. "Q2 2026 update".' },
    period_label: { type: 'string', description: 'The period the report covers, e.g. "Q2 2026".' },
    periods: { type: 'array', description: 'One entry per period the report gives figures for: every quarter or month in its tables AND charts (e.g. five quarters of revenue in a chart). Oldest first.', items: { type: 'object', additionalProperties: false,
      required: ['month', 'months_covered', 'revenue_total', 'net_burn_monthly', 'cash', 'customers', 'headcount', 'gross_margin_pct'],
      properties: {
        month: { type: 'string', description: 'Last month of the period, YYYY-MM (Q1 → March, Q2 → June, Q3 → September, Q4 → December).' },
        months_covered: { type: 'integer', description: '1 for a month, 3 for a quarter, 12 for a year.' },
        revenue_total: { ...MONEY, description: 'Revenue for the whole period (not GMV, volume, spend or bookings).' },
        net_burn_monthly: { ...MONEY, description: 'Average net cash burn PER MONTH. If the report gives "average monthly net burn", use it as is. If only a period total, give the total and say so in notes. Not total spend. Null if not stated.' },
        cash: { ...MONEY, description: 'Cash balance at period end.' },
        customers: { ...NUM, description: 'Paying customers / merchants / subscribers at period end, full number.' },
        headcount: { ...NUM, description: 'Team size at period end.' },
        gross_margin_pct: { ...NUM, description: 'Gross margin %, e.g. 62.' } } } },
    other_kpis: { type: 'array', description: 'Up to 8 other headline numbers: runway (months), total spend, average monthly spend, one-off spend, GMV, commerce processed, growth rates, subscribers.', items: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'scale', 'unit', 'period'],
      properties: { name: { type: 'string' }, amount: { type: 'number', description: 'As printed, without the scale word.' }, scale: { type: 'string', enum: ['unit', 'thousand', 'million', 'billion'] }, unit: { type: 'string', description: 'Currency code, %, months, count…' }, period: { type: 'string' } } } },
    highlights: { type: 'string', description: 'Main progress and wins, 2 to 5 short "- " bullets, keeping the report\'s own figures and currency symbols. Empty if none.' },
    challenges: { type: 'string', description: 'Problems, risks, slowdowns, 1 to 4 short "- " bullets. Empty if none.' },
    asks: { type: 'string', description: 'What the founders ask investors for (intros, hires, funding). Empty if none.' },
    has_figures: { type: 'boolean', description: 'False when the file has no figures (for example only a link to the real report).' },
    notes: { type: 'string', description: 'One or two lines for the reviewer: anything assumed or unclear.' } } }
const Scale = z.enum(['unit', 'thousand', 'million', 'billion']).catch('unit')
const Money = z.object({ amount: z.number().finite(), scale: Scale, currency: z.string().trim().toUpperCase().catch('USD'), usd_amount: z.number().finite().nullable().catch(null), usd_scale: Scale.nullable().catch(null) }).nullable().catch(null)
const RawSchema = z.object({ company: z.string().max(200).nullable().catch(null), title: z.string().min(1).max(200).catch('Report'), period_label: z.string().max(80).catch(''),
  periods: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), months_covered: z.number().int().min(1).max(12).catch(1), revenue_total: Money, net_burn_monthly: Money, cash: Money, customers: z.number().finite().nullable().catch(null), headcount: z.number().finite().nullable().catch(null), gross_margin_pct: z.number().finite().nullable().catch(null) })).max(24),
  other_kpis: z.array(z.object({ name: z.string().max(80), amount: z.number().finite(), scale: Scale, unit: z.string().max(20), period: z.string().max(40).catch('') })).max(8).catch([]),
  highlights: z.string().max(3000).catch(''), challenges: z.string().max(3000).catch(''), asks: z.string().max(2000).catch(''), has_figures: z.boolean().catch(true), notes: z.string().max(800).catch('') })
type Raw = z.infer<typeof RawSchema>
const MULT = { unit: 1, thousand: 1e3, million: 1e6, billion: 1e9 } as const
const CUR: Record<string, string> = { '₦': 'NGN', N: 'NGN', NAIRA: 'NGN', $: 'USD', US$: 'USD', DOLLAR: 'USD', KSH: 'KES', 'GH₵': 'GHS', R: 'ZAR', '£': 'GBP', '€': 'EUR' }
const code = (c: string) => { const u = c.trim().toUpperCase(); return /^[A-Z]{3}$/.test(u) ? u : CUR[u] ?? CUR[c.trim()] ?? 'USD' }
// One currency for the whole report: US dollars when any amount is in dollars (or printed with a dollar figure),
// otherwise the report's own currency. Rates come from amounts the report prints in both currencies, else today's rate.
export async function normalise(r: Raw): Promise<ExtractedReport> {
  const all = r.periods.flatMap((p) => [p.revenue_total, p.net_burn_monthly, p.cash]).filter((m): m is NonNullable<typeof m> => !!m)
  const curs = new Set(all.map((m) => code(m.currency)))
  const target = curs.has('USD') || all.some((m) => m.usd_amount !== null) || curs.size > 1 ? 'USD' : [...curs][0] ?? 'USD'
  const pairs: Record<string, number[]> = {}
  for (const m of all) if (m.usd_amount && code(m.currency) !== 'USD') (pairs[code(m.currency)] ??= []).push((m.amount * MULT[m.scale]) / (m.usd_amount * MULT[m.usd_scale ?? m.scale]))
  const rates: Record<string, { rate: number; src: string }> = {}
  for (const c of curs) if (c !== target) {
    const ps = pairs[c]
    if (ps?.length) rates[c] = { rate: ps.reduce((a, b) => a + b, 0) / ps.length, src: 'report' }
    else { const k = target === 'USD' ? await fxRate('USD', c) : await fxRate(target, c); if (k) rates[c] = { rate: k, src: 'today' } }
  }
  const notes: string[] = r.notes ? [r.notes] : []
  const conv = (m: Raw['periods'][number]['revenue_total']): number | null => {
    if (!m) return null
    const c = code(m.currency), full = m.amount * MULT[m.scale]
    if (c === target) return Math.round(full * 100) / 100
    if (target === 'USD' && m.usd_amount !== null) return Math.round(m.usd_amount * MULT[m.usd_scale ?? m.scale] * 100) / 100
    const k = rates[c]; return k ? Math.round(full / k.rate * 100) / 100 : null
  }
  for (const [c, k] of Object.entries(rates)) notes.push(c + ' amounts converted to ' + target + ' at ' + (Math.round(k.rate * 100) / 100).toLocaleString('en-US') + ' ' + c + ' per ' + target + (k.src === 'report' ? ', the rate implied by the report\'s own paired figures.' : ', today\'s rate (the report gives none).'))
  for (const c of curs) if (c !== target && !rates[c]) notes.push('No exchange rate for ' + c + '; its amounts were left blank. Enter them by hand.')
  return { company: r.company, title: r.title, period_label: r.period_label, currency: target, usd_rate: null,
    periods: r.periods.map((p) => ({ month: p.month, months_covered: p.months_covered, revenue_total: conv(p.revenue_total), net_burn_monthly: conv(p.net_burn_monthly), cash: conv(p.cash), customers: p.customers === null ? null : Math.round(p.customers), headcount: p.headcount === null ? null : Math.round(p.headcount), gross_margin_pct: p.gross_margin_pct })),
    other_kpis: r.other_kpis.map((k) => ({ name: k.name, value: k.amount * MULT[k.scale], unit: /^([A-Za-z]{3}|[₦$£€]|US\$)$/.test(k.unit.trim()) ? code(k.unit) : k.unit, period: k.period })),
    highlights: r.highlights, challenges: r.challenges, asks: r.asks, has_figures: r.has_figures, notes: notes.join(' ').slice(0, 800) }
}
const Period = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), months_covered: z.number().int().min(1).max(12), revenue_total: z.number().finite().nullable(), net_burn_monthly: z.number().finite().nullable(), cash: z.number().finite().nullable(), customers: z.number().finite().nullable(), headcount: z.number().finite().nullable(), gross_margin_pct: z.number().finite().nullable() })
export const ReportSchema = z.object({ company: z.string().max(200).nullable(), title: z.string().min(1).max(200), period_label: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/).catch('USD'), usd_rate: z.number().positive().nullable(),
  periods: z.array(Period).max(16), other_kpis: z.array(z.object({ name: z.string().max(80), value: z.number().finite(), unit: z.string().max(20), period: z.string().max(40) })).max(8),
  highlights: z.string().max(3000), challenges: z.string().max(3000), asks: z.string().max(2000), has_figures: z.boolean(), notes: z.string().max(800) })
export type ExtractedReport = z.infer<typeof ReportSchema>

export async function readReport(pdf: Buffer, company: string, ref: string): Promise<ExtractedReport> {
  const { output } = await runAiTool({ task: 'portfolio_report_read', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'portfolio-report-v2', inputRef: ref,
    system: 'You read a startup\'s investor report for its investor (a venture firm): an investor update, a forwarded email, a business summary or a fund-utilisation report. Pages may be images of tables and charts: read them carefully. ' +
      'Take only numbers that are written in it (tables, chart labels, text); never estimate, extrapolate or fill gaps (null instead). Record every amount exactly as printed: the number, its scale word (k, m, bn) and its currency. Do not multiply or convert yourself. ' +
      'Reports often mix currencies (for example revenue in naira with a dollar figure in brackets, and spend, burn and cash in dollars): give each amount its own currency, and the dollar figure in usd_amount when one is printed next to it. ' +
      'Revenue is revenue, not GMV, commerce processed or spend (put those in other_kpis). Burn is per month: use "average monthly net burn" figures as they are. Runway goes in other_kpis in months. ' +
      'Notes are short, factual and in plain English, in the third person. Ignore email headers, signatures and links.',
    user: '', userContent: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } }, { type: 'text', text: 'Read this report for our records on ' + company + '.' }],
    toolName: 'record_report', toolDescription: 'Record what the report says.', jsonSchema: SCHEMA, schema: RawSchema, maxTokens: 4000 })
  return normalise(output)
}

// Monthly figures in US dollars from what a person approved: period revenue spread evenly over its months, burn per
// month for each month, cash / customers / headcount / margin at the period's last month.
export function toMonthly(r: ExtractedReport, rate: number): { period: string; metric: string; value: number }[] {
  const out = new Map<string, number>()
  const usd = (v: number) => Math.round((v / rate) * 100) / 100
  for (const p of r.periods) {
    const end = new Date(p.month + '-01T00:00:00Z'), months: string[] = []
    for (let i = p.months_covered - 1; i >= 0; i--) { const d = new Date(end); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 10)) }
    const last = months[months.length - 1]!
    if (p.revenue_total !== null) for (const m of months) out.set(m + '|revenue', usd(p.revenue_total / p.months_covered))
    if (p.net_burn_monthly !== null) for (const m of months) out.set(m + '|net_burn', usd(Math.max(0, p.net_burn_monthly)))
    if (p.cash !== null) out.set(last + '|cash', usd(p.cash))
    if (p.customers !== null) out.set(last + '|customers', Math.round(p.customers))
    if (p.headcount !== null) out.set(last + '|headcount', Math.round(p.headcount))
    if (p.gross_margin_pct !== null) out.set(last + '|gross_margin', Math.round(p.gross_margin_pct * 10) / 10)
  }
  return [...out.entries()].map(([k, value]) => { const [period, metric] = k.split('|') as [string, string]; return { period, metric, value } })
}
