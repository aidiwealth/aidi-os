// Past portfolio reports uploaded as PDFs (investor updates, forwarded emails, fund-utilisation reports): AI reads the
// file and proposes the figures and notes; a person checks them, then they are saved into the company's monthly figures
// (in US dollars, at the rate shown) and founder notes. Corrections a person made earlier are never overwritten.
import { z } from 'zod'
const num = { type: ['number', 'null'] }
const SCHEMA = { type: 'object', additionalProperties: false,
  required: ['company', 'title', 'period_label', 'currency', 'usd_rate', 'periods', 'other_kpis', 'highlights', 'challenges', 'asks', 'has_figures', 'notes'],
  properties: {
    company: { type: ['string', 'null'], description: 'The company the report is about, as named in it.' },
    title: { type: 'string', description: 'Short title, e.g. "Q3 2025 business summary".' },
    period_label: { type: 'string', description: 'The period the report covers, e.g. "Q3 2025", "March 2023", "Dec 2025 - Jan 2026".' },
    currency: { type: 'string', description: 'ISO code of the money figures (USD, NGN, KES...).' },
    usd_rate: { ...num, description: 'Units of that currency per 1 US dollar, ONLY if the report itself shows both (e.g. "N137.97 million ($95k)" gives about 1452). Otherwise null.' },
    periods: { type: 'array', description: 'One entry per period the report gives figures for (several quarters if it compares them). Oldest first.', items: { type: 'object', additionalProperties: false,
      required: ['month', 'months_covered', 'revenue_total', 'net_burn_monthly', 'cash', 'customers', 'headcount', 'gross_margin_pct'],
      properties: {
        month: { type: 'string', description: 'Last month of the period, YYYY-MM.' },
        months_covered: { type: 'integer', description: '1 for a month, 3 for a quarter, 12 for a year.' },
        revenue_total: { ...num, description: 'Revenue for the whole period in the report currency (not GMV, not volume).' },
        net_burn_monthly: { ...num, description: 'Average net cash burn PER MONTH (expenses minus revenue, cash out minus cash in). If the report gives a period total, divide by months covered. 0 if profitable. Null if not stated.' },
        cash: { ...num, description: 'Cash in the bank at period end.' },
        customers: { ...num, description: 'Paying customers / clients / merchants at period end.' },
        headcount: { ...num, description: 'Team size at period end.' },
        gross_margin_pct: { ...num, description: 'Gross margin as a percentage, e.g. 62.' } } } },
    other_kpis: { type: 'array', description: 'Up to 8 other headline numbers (GMV, transaction volume, runway months, users, take rate, funding received, funds spent).', items: { type: 'object', additionalProperties: false, required: ['name', 'value', 'unit', 'period'], properties: { name: { type: 'string' }, value: { type: 'number' }, unit: { type: 'string', description: 'Currency code, %, months, count...' }, period: { type: 'string' } } } },
    highlights: { type: 'string', description: 'Main progress and wins, 2 to 5 short "- " bullets. Empty if none.' },
    challenges: { type: 'string', description: 'Problems, risks, slowdowns, 1 to 4 short "- " bullets. Empty if none.' },
    asks: { type: 'string', description: 'What the founders ask investors for (intros, hires, funding). Empty if none.' },
    has_figures: { type: 'boolean', description: 'False when the file has no figures (for example only a link to the real report).' },
    notes: { type: 'string', description: 'One or two lines for the reviewer: anything assumed or unclear (e.g. "burn given per quarter, divided by 3").' } } }
const Period = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), months_covered: z.number().int().min(1).max(12), revenue_total: z.number().finite().nullable(), net_burn_monthly: z.number().finite().nullable(), cash: z.number().finite().nullable(), customers: z.number().finite().nullable(), headcount: z.number().finite().nullable(), gross_margin_pct: z.number().finite().nullable() })
export const ReportSchema = z.object({ company: z.string().max(200).nullable(), title: z.string().min(1).max(200), period_label: z.string().max(80), currency: z.string().regex(/^[A-Z]{3}$/).catch('USD'), usd_rate: z.number().positive().nullable(),
  periods: z.array(Period).max(16), other_kpis: z.array(z.object({ name: z.string().max(80), value: z.number().finite(), unit: z.string().max(20), period: z.string().max(40) })).max(8),
  highlights: z.string().max(3000), challenges: z.string().max(3000), asks: z.string().max(2000), has_figures: z.boolean(), notes: z.string().max(800) })
export type ExtractedReport = z.infer<typeof ReportSchema>

export async function readReport(pdf: Buffer, company: string, ref: string): Promise<ExtractedReport> {
  const { output } = await runAiTool({ task: 'portfolio_report_read', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'portfolio-report-v1', inputRef: ref,
    system: 'You read a startup\'s investor report for its investor (a venture firm): a PDF of an investor update, a forwarded email, a business summary or a fund-utilisation report. ' +
      'Take only numbers that are written in it; never estimate, extrapolate or fill gaps (null instead). Write full numbers (₦137.97 million → 137970000; $95k → 95000). ' +
      'Revenue is revenue, not GMV, volume or bookings (put those in other_kpis). Burn is per month. Keep the report\'s own currency; give usd_rate only when the report shows the same amount in both currencies. ' +
      'Notes are short, factual and in plain English, in the third person ("The company launched…"). Ignore email headers, signatures and links.',
    user: '', userContent: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } }, { type: 'text', text: 'Read this report for our records on ' + company + '.' }],
    toolName: 'record_report', toolDescription: 'Record what the report says.', jsonSchema: SCHEMA, schema: ReportSchema, maxTokens: 2500 })
  return output
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
