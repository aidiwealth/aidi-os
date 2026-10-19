// What should we do next: advice from the company's own figures (Financials, and customer revenue when it is there),
// sorted into what needs fixing urgently, what to do next, and what is working. Each item names the team that owns
// it, why (the numbers), how to go about it (concrete steps), the number to watch and its target.
// Rules find the items, so there is always advice grounded in the figures; AI (when on) writes the steps for this
// company and may add an item the figures clearly support. Kept until the figures change. Not professional advice.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { deriveLines, withSecurities, type FinRow } from '~/shared/fin-view'
import { customerFacts } from '~/server/utils/customer-analysis'

export type Team = 'Leadership' | 'Finance' | 'Sales' | 'Marketing' | 'Customer success' | 'Product' | 'Operations'
export const TEAMS: Team[] = ['Leadership', 'Finance', 'Sales', 'Marketing', 'Customer success', 'Product', 'Operations']
export interface AdviceItem { kind: 'urgent' | 'next' | 'working'; team: Team; title: string; why: string; steps: string[]; watch: string; target: string; when: string }
export interface Advice { as_of: string | null; currency: string; items: AdviceItem[]; ai: boolean; sources: string[]; generated_at: string }

type F = Record<string, unknown>
const n = (f: F, k: string) => { const v = f[k]; return typeof v === 'number' && Number.isFinite(v) ? v : null }
const R = (v: number) => Math.round(v).toLocaleString('en-US')

function rules(fin: F | null, cust: F | null, cur: string): AdviceItem[] {
  const out: AdviceItem[] = [], m = (v: number | null) => (v == null ? '—' : cur + ' ' + R(v))
  const add = (x: AdviceItem) => out.push(x)
  if (fin) {
    const runway = n(fin, 'runway_months'), burn = n(fin, 'monthly_burn'), gm = n(fin, 'gross_margin_pct'), gy = n(fin, 'revenue_growth_yoy_pct'), gq = n(fin, 'revenue_growth_qoq_pct')
    const oxg = n(fin, 'opex_growth_qoq_pct'), be = n(fin, 'opex_cut_to_breakeven_monthly'), beUp = n(fin, 'revenue_increase_to_breakeven_pct'), stale = n(fin, 'cash_months_before_latest'), missing = n(fin, 'months_missing')
    const typ = typeof fin.typical_gross_margin_pct === 'string' ? (fin.typical_gross_margin_pct as string).split('-').map(Number) : null
    if (runway !== null && runway < 12) add({ kind: 'urgent', team: 'Leadership', title: 'Extend runway: ' + runway + ' months of cash left', why: 'Cash covers about ' + runway + ' months at ' + m(burn) + ' a month. Raising usually takes 6 to 9 months, so the plan has to start now.', steps: ['Set a target of 18 months of runway and work out the monthly burn that gets there.', be ? 'Find ' + m(be) + ' a month of savings (the gap to break-even), starting with the biggest non-payroll costs.' : 'List every cost over 2% of spend and decide keep, cut or renegotiate.', 'Start fundraising or bridge conversations with current investors this month; prepare the data room.'], watch: 'Runway (months)', target: '18 months or more', when: 'This month' })
    else if (runway !== null && runway >= 18) add({ kind: 'working', team: 'Finance', title: runway + ' months of runway', why: 'Cash covers well over a year at today\'s burn, which gives room to invest in growth.', steps: ['Keep a 12-month floor: decide now what you would cut if runway fell below it.', 'Put spare cash in short-term, low-risk deposits.'], watch: 'Runway (months)', target: 'Stay above 12', when: 'Ongoing' })
    if (stale !== null && stale >= 2 || (missing ?? 0) > 0) add({ kind: 'urgent', team: 'Finance', title: 'Bring the figures up to date', why: (stale !== null && stale >= 2 ? 'Cash was last recorded ' + stale + ' months before the latest figures. ' : '') + ((missing ?? 0) > 0 ? missing + ' month' + (missing === 1 ? ' is' : 's are') + ' missing. ' : '') + 'Advice, runway and investor reports are only as good as the latest figures.', steps: ['Close each month within 10 working days, with the balance sheet (cash) included.', 'Link the management accounts sheet so Financials stay in step.', 'Assign one person to own the monthly close.'], watch: 'Days to close the month', target: '10 working days', when: 'This month' })
    if (gm !== null && typ && gm < typ[0]!) add({ kind: 'urgent', team: 'Product', title: 'Gross margin ' + gm + '% is below the usual ' + typ.join('-') + '%', why: 'Every ' + cur + ' 100 of sales keeps ' + Math.round(gm) + ' after direct costs, less than similar companies. Low margin makes growth expensive.', steps: ['Rank customers and products by margin; find the ones that lose money after direct costs.', 'Reprice or set minimums for the lowest-margin customers at renewal.', 'Renegotiate the biggest direct costs (carriers, hosting, payment fees) with volume commitments.'], watch: 'Gross margin %', target: typ[0] + '% or more', when: 'This quarter' })
    else if (gm !== null && typ && gm >= typ[0]!) add({ kind: 'working', team: 'Product', title: 'Gross margin ' + gm + '% is ' + (gm > typ[1]! ? 'above' : 'in') + ' the usual ' + typ.join('-') + '%', why: 'Direct costs are under control for this kind of business (' + String(fin.business_type) + ').', steps: ['Check margin on every new large deal before signing.'], watch: 'Gross margin %', target: 'Stay within ' + typ.join('-') + '%', when: 'Ongoing' })
    if (gy !== null && gy < 0) add({ kind: 'urgent', team: 'Sales', title: 'Revenue is down ' + Math.abs(gy) + '% on last year', why: 'The last quarter brought in less than the same quarter a year ago.', steps: ['Find where it went: lost customers, customers spending less, or fewer new ones (see Revenue retention).', 'Set a weekly pipeline review with a target for new revenue each month.', 'Win back the largest customers who left or cut back, with an offer tied to a commitment.'], watch: 'Revenue growth on last year', target: 'Back above 0%, then 20%+', when: 'This quarter' })
    else if (gy !== null && gy >= 20) add({ kind: 'working', team: 'Sales', title: 'Revenue up ' + gy + '% on last year', why: 'Strong growth on the same quarter a year ago.', steps: ['Write down which channels and customer types drove it and put more behind them.', 'Make sure hiring and support keep pace so service does not slip.'], watch: 'Revenue growth on last year', target: 'Keep above 20%', when: 'Ongoing' })
    else if (gq !== null && gq < 0) add({ kind: 'next', team: 'Sales', title: 'Revenue fell ' + Math.abs(gq) + '% on the previous quarter', why: gy !== null ? 'Revenue is up ' + gy + '% on last year, but the latest quarter is below the one before.' : 'The latest quarter is below the one before.', steps: ['Check whether it is seasonal (same dip last year?) or a lost customer.', 'Bring forward deals in the pipeline that can close this quarter.'], watch: 'Revenue growth on the quarter', target: 'Positive', when: 'This quarter' })
    if (oxg !== null && gq !== null && oxg > gq + 10 && oxg > 5) add({ kind: 'next', team: 'Finance', title: 'Costs are growing faster than revenue', why: 'Operating costs rose ' + oxg + '% on the quarter while revenue moved ' + gq + '%.', steps: ['Review every cost line that grew more than 10% and confirm it was planned.', 'Set a monthly budget per team and report against it.', 'Tie new hires to revenue milestones.'], watch: 'Operating costs per ' + cur + ' 100 of revenue', target: 'Falling each quarter', when: 'Next 3 months' })
    if (beUp !== null && beUp > 0 && beUp <= 30) add({ kind: 'next', team: 'Leadership', title: 'Break-even is within reach: ' + beUp + '% more revenue', why: 'With costs where they are, about ' + beUp + '% more monthly revenue would cover them' + (be ? ' (or ' + m(be) + ' a month less in costs)' : '') + '.', steps: ['Make break-even a company goal with a date.', 'Split the gap between new revenue and cost savings, owned by named people.'], watch: 'Monthly net income', target: '0 or better', when: 'Next 6 months' })
  }
  if (cust) {
    const nrr = n(cust, 'nrr_12m_pct'), grr = n(cust, 'grr_12m_pct'), churn = n(cust, 'logo_churn_12m_pct'), top1 = n(cust, 'top1_share_pct'), ltvcac = n(cust, 'ltv_to_cac'), gap = n(cust, 'customer_revenue_vs_financials_pct')
    const groups = Array.isArray(cust.groups) ? (cust.groups as { group: string; nrr_pct: number | null; share_pct: number | null; logo_churn_pct: number | null }[]) : []
    const top = Array.isArray(cust.top) ? (cust.top as { name: string; share_pct: number }[]) : []
    if (top1 !== null && top1 > 25 && top[0]) add({ kind: 'urgent', team: 'Leadership', title: top[0].name + ' is ' + top1 + '% of revenue', why: 'Losing or shrinking one customer would cut revenue by ' + (top1 > 33 ? 'over a third' : 'a quarter') + '. Investors and lenders will ask about it.', steps: ['Put a senior owner on ' + top[0].name + ': quarterly business reviews and a renewal plan 6 months before the contract ends.', 'Agree a longer contract or minimum commitment in return for price or service.', 'Set a target for the next 10 customers to grow so the largest falls under 20%.'], watch: 'Largest customer share of revenue', target: 'Below 20%', when: 'This quarter' })
    if (grr !== null && grr < 80 || churn !== null && churn > 25) {
      const worst = [...groups].filter((g) => g.logo_churn_pct !== null && g.group !== 'Not set').sort((a, b) => (b.logo_churn_pct ?? 0) - (a.logo_churn_pct ?? 0))[0]
      add({ kind: 'urgent', team: 'Customer success', title: 'Too many customers leave: ' + (churn ?? '—') + '% in 12 months', why: 'Gross revenue retention is ' + (grr ?? '—') + '%.' + (worst ? ' ' + worst.group + ' loses the most (' + worst.logo_churn_pct + '% of customers).' : '') + ' Every customer lost has to be replaced before the business grows.', steps: ['Call 10 customers who left in the last 3 months and record why.', 'Set up an early warning: customers whose usage or spend fell by a third get a call within a week.', 'Fix onboarding for new customers so they reach first value in their first month.'], watch: 'Gross revenue retention', target: (grr ?? 0) < 80 ? '80%, then 90%' : '90%', when: 'This quarter' })
    }
    if (nrr !== null && nrr >= 100) add({ kind: 'working', team: 'Customer success', title: 'Net revenue retention ' + nrr + '%', why: 'Customers from a year ago pay more today than they did then.', steps: ['Find what the growing customers buy more of and offer it to similar customers.', 'Share these numbers with investors: it is a strong signal.'], watch: 'Net revenue retention', target: '110% or more', when: 'Ongoing' })
    else if (nrr !== null && nrr < 100) add({ kind: 'next', team: 'Sales', title: 'Grow existing customers: net retention ' + nrr + '%', why: 'Customers from a year ago pay less today; expansion does not cover what is lost.', steps: ['Give account managers an expansion target for their top 20 customers.', 'Package a second product or a higher tier for customers who use the most.', 'Review price for customers paying below list.'], watch: 'Net revenue retention', target: '100%, then 110%', when: 'Next 6 months' })
    const best = [...groups].filter((g) => g.nrr_pct !== null && (g.share_pct ?? 0) >= 5 && g.group !== 'Not set').sort((a, b) => (b.nrr_pct ?? 0) - (a.nrr_pct ?? 0))[0]
    if (best && (best.nrr_pct ?? 0) >= 105) add({ kind: 'working', team: 'Marketing', title: best.group + ' customers grow with you (' + best.nrr_pct + '% net retention)', why: best.group + ' is ' + best.share_pct + '% of revenue and keeps growing.', steps: ['Build the ideal customer profile from these customers and aim new marketing at look-alikes.', 'Collect two case studies from this group.'], watch: 'New customers in ' + best.group, target: 'Up each quarter', when: 'Next 3 months' })
    if (ltvcac !== null && ltvcac >= 3) add({ kind: 'working', team: 'Marketing', title: 'Customers are worth ' + ltvcac + '× what they cost to win', why: 'Lifetime value is well above acquisition cost.', steps: ['Test spending more on the channels with the best payback.'], watch: 'LTV to CAC', target: '3× or more', when: 'Ongoing' })
    else if (ltvcac !== null && ltvcac < 3) add({ kind: 'next', team: 'Marketing', title: 'Winning customers costs too much: LTV ' + ltvcac + '× CAC', why: 'A customer is worth less than three times what it costs to win.', steps: ['Cut the channels with the worst payback.', 'Raise prices or minimums for new small customers.'], watch: 'LTV to CAC', target: '3×', when: 'Next 3 months' })
    else if (ltvcac === null) add({ kind: 'next', team: 'Marketing', title: 'Record what each customer costs to win', why: 'Without acquisition cost, you cannot tell which channels pay back.', steps: ['Add an Acquisition cost column to the customer revenue file (marketing and sales spend per new customer).'], watch: 'LTV to CAC', target: '3×', when: 'Next month' })
    if (gap !== null && Math.abs(gap) > 5) add({ kind: 'urgent', team: 'Finance', title: 'Customer revenue and Financials differ by ' + Math.abs(gap) + '%', why: 'The last three months of customer revenue do not match the revenue in Financials, so one of them is wrong.', steps: ['Reconcile one month line by line: invoices, credits, currency conversion.', 'Agree one source of truth for revenue and keep both in step.'], watch: 'Difference', target: 'Under 2%', when: 'This month' })
  }
  return out
}

const Out = z.object({ items: z.array(z.object({ kind: z.enum(['urgent', 'next', 'working']), team: z.enum(TEAMS as [Team, ...Team[]]), title: z.string().max(140), why: z.string().max(400), steps: z.array(z.string().max(260)).min(1).max(4), watch: z.string().max(80), target: z.string().max(60), when: z.string().max(40) })).max(14) })

export async function adviseCompany(subject: string, force = false): Promise<Advice | null> {
  const org = (await currentOrg())!
  const cur = await subjectCurrency(subject), sec = org.settings.cash_with_securities === true
  const model = ((org.settings.business_models as Record<string, string> | undefined) ?? {})[subject] ?? null
  let rows = await loadStatements(subject, 'month', cur)
  if (rows.length < 3) rows = await loadStatements(subject, 'quarter', cur)
  const fr: FinRow[] = rows.map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: withSecurities(deriveLines(r.lines, r.period_type === 'quarter' ? 3 : r.period_type === 'year' ? 12 : 1), sec) }))
  const fin = fr.length >= 3 ? factsOf(fr, model).facts : null
  let cust: F | null = null
  // The company's own customers, or every company's combined for the group.
  if (org.kind === 'company' && (await enabledModules()).has('fin_customers')) {
    cust = await withCustFor(subject, async () => { const cs = await loadCustomers(); if (!cs.length) return null; const cfg = await customerConfig(); return customerFacts('customers', cs, cfg, await financialsRevenue(cfg.currency)) }) as F | null
  }
  if (!fin && !cust) return null
  const currency = fr[fr.length - 1]?.currency ?? cur
  const sources = [fin ? 'Financials' : '', cust ? 'customer revenue' : ''].filter(Boolean)
  const key = 'advice:' + subject, hash = createHash('sha256').update(JSON.stringify({ fin, cust, v: 1 })).digest('hex').slice(0, 40)
  if (!force) { const hit = (await db().query<{ analysis: Advice }>('SELECT analysis FROM financials.analyses WHERE subject = $1 AND hash = $2', [key, hash])).rows[0]; if (hit) return hit.analysis }
  const base = rules(fin, cust, currency)
  let out: Advice = { as_of: (fin?.latest as string | null) ?? (cust?.as_of ? String(cust.as_of) : null), currency, items: base, ai: false, sources, generated_at: new Date().toISOString() }
  if (useRuntimeConfig().anthropicApiKey) {
    try {
      const { output } = await runAiTool({ task: 'company_advice', model: (useRuntimeConfig() as unknown as Record<string, string>).aiModelAnalyst || useRuntimeConfig().aiModelPitchScreen, promptVersion: 'company-advice-v1', inputRef: key,
        system: 'You are an experienced operating partner advising a startup\'s leadership team (many are first-time founders in Africa and other emerging markets; write plainly). From the facts, write what each team should do: kind urgent (fix now, risk to the business), next (do in the next one to two quarters) or working (keep doing). ' +
          'Start from the draft items: keep every one the facts support, sharpen the why with the numbers from the facts, and make the steps concrete for this company (who does what, by when). You may add at most two items, only where the facts clearly show it. ' +
          'Use only numbers that are in the facts, exactly as given; never calculate new totals. Each item has one owning team, 2 to 4 steps, the number to watch and its target. No more than 5 urgent items; most important first. Plain sentences, no jargon.',
        user: JSON.stringify({ currency, financials: fin, customers: cust, draft: base }), toolName: 'record_advice', toolDescription: 'Record the advice by team.', schema: Out, maxTokens: 4000,
        jsonSchema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'team', 'title', 'why', 'steps', 'watch', 'target', 'when'], properties: { kind: { type: 'string', enum: ['urgent', 'next', 'working'] }, team: { type: 'string', enum: TEAMS }, title: { type: 'string' }, why: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, watch: { type: 'string' }, target: { type: 'string' }, when: { type: 'string' } } } } } } })
      if (output.items.length >= Math.min(3, base.length)) out = { ...out, items: output.items, ai: true }
    } catch (e) { console.error('[advice]', (e as Error).message) }
  }
  await db().query('INSERT INTO financials.analyses (subject, hash, analysis) VALUES ($1,$2,$3) ON CONFLICT (organization_id, subject) DO UPDATE SET hash = EXCLUDED.hash, analysis = EXCLUDED.analysis, created_at = now()', [key, hash, JSON.stringify(out)])
  return out
}
