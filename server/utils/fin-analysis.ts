// What a founder's own figures say: growth, margins, costs against revenue, burn and runway, and what to take to the
// executive team and the CFO. The facts are worked out here; AI writes them up (and is skipped when it is off). The
// result is kept until the figures change.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { burnReview, checkRows, deriveLines, type FinRow } from '~/shared/fin-view'

export interface Insight { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }
export interface Flag { for: 'Executive team' | 'CFO' | 'Board'; item: string; why: string }
export interface Analysis { headline: string; insights: Insight[]; flags: Flag[]; facts: Record<string, number | string | null>; checks: number; ai: boolean; as_of: string; period: string; currency: string }

const pct = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10)
const sumK = (rows: FinRow[], k: string) => { const v = rows.map((r) => r.derived[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, x) => a + x, 0) : null }
const avg = (rows: FinRow[], k: string) => { const v = rows.map((r) => r.derived[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null }
const lastKnown = (rows: FinRow[], k: string) => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i]!.derived[k]; if (typeof v === 'number') return { v, at: rows[i]!.period_end } } return null }

export function factsOf(raw: FinRow[]): { facts: Record<string, number | string | null>; rules: Insight[]; flags: Flag[]; period: string } {
  const today = new Date().toISOString().slice(0, 10)
  const rows = raw.filter((r) => r.period_end <= today).map((r) => ({ ...r, derived: r.derived ?? deriveLines(r.lines, r.period_type === 'year' ? 12 : r.period_type === 'quarter' ? 3 : 1) }))
  const per = rows[0]?.period_type === 'quarter' ? 3 : rows[0]?.period_type === 'year' ? 12 : 1
  const n = Math.max(1, Math.round(3 / per)) // a quarter's worth of periods
  const last = rows.slice(-n), prior = rows.slice(-2 * n, -n), yearAgo = rows.slice(-Math.round(12 / per) - n, -Math.round(12 / per))
  const ttm = rows.slice(-Math.round(12 / per))
  const rev3 = sumK(last, 'revenue'), revP = sumK(prior, 'revenue'), revY = sumK(yearAgo, 'revenue')
  const gm3 = avg(last, 'gross_margin'), gmP = avg(prior, 'gross_margin')
  const ox3 = sumK(last, 'opex_total'), oxP = sumK(prior, 'opex_total')
  const cogs3 = sumK(last, 'cogs'), cogsP = sumK(prior, 'cogs')
  const ni3 = sumK(last, 'net_income'), niTtm = sumK(ttm, 'net_income')
  // Burn and runway checked three ways on monthly figures (cash flow, change in cash, net loss); else the average.
  const br = per === 1 ? burnReview(rows) : null
  const cash = lastKnown(rows, 'cash'), burn = br && br.burn !== null ? br.burn : avg(last, 'burn')
  const runway = cash && burn ? Math.round((cash.v / burn) * 10) / 10 : null
  const lossPeriods = ttm.filter((r) => (r.derived.net_income ?? 0) < 0).length
  const payroll3 = sumK(last, 'opex_payroll')
  const facts: Record<string, number | string | null> = {
    periods: rows.length, period_type: rows[0]?.period_type ?? 'month', latest: rows[rows.length - 1]?.period_end ?? null,
    revenue_last_quarter: rev3, revenue_growth_qoq_pct: pct(rev3, revP), revenue_growth_yoy_pct: pct(rev3, revY), revenue_ttm: sumK(ttm, 'revenue'),
    gross_margin_pct: gm3 === null ? null : Math.round(gm3 * 10) / 10, gross_margin_change_pts: gm3 !== null && gmP !== null ? Math.round((gm3 - gmP) * 10) / 10 : null,
    cost_of_revenue_growth_pct: pct(cogs3, cogsP), opex_growth_qoq_pct: pct(ox3, oxP), opex_to_revenue_pct: ox3 !== null && rev3 ? Math.round((ox3 / rev3) * 1000) / 10 : null,
    payroll_to_revenue_pct: payroll3 !== null && rev3 ? Math.round((payroll3 / rev3) * 1000) / 10 : null,
    net_income_last_quarter: ni3, net_income_ttm: niTtm, loss_periods_last_12m: lossPeriods, monthly_burn: burn === null ? null : Math.round(burn),
    cash: cash?.v ?? null, cash_as_of: cash?.at ?? null, runway_months: runway, burn_basis: br?.basis || null, burn_methods: br ? JSON.stringify(br.methods.map((m) => ({ method: m.label, monthly: m.value === null ? null : Math.round(m.value) }))) : null, burn_check_issues: br && br.issues.length ? br.issues.join(' ') : null, ebitda_margin_pct: (() => { const e = sumK(last, 'ebitda'); return e !== null && rev3 ? Math.round((e / rev3) * 1000) / 10 : null })()
  }
  // Plain rules, so there is something useful even without AI.
  const rules: Insight[] = [], flags: Flag[] = []
  const g = facts.revenue_growth_qoq_pct as number | null, gy = facts.revenue_growth_yoy_pct as number | null
  if (g !== null) rules.push({ title: g >= 0 ? 'Revenue up ' + g + '% on the quarter before' : 'Revenue down ' + Math.abs(g) + '% on the quarter before', detail: gy !== null ? 'Year on year: ' + (gy >= 0 ? '+' : '') + gy + '%.' : 'Not enough history for a year-on-year view.', tone: g >= 5 ? 'good' : g >= -2 ? 'watch' : 'risk' })
  const gmc = facts.gross_margin_change_pts as number | null
  if (gm3 !== null) rules.push({ title: 'Gross margin ' + Math.round(gm3) + '%' + (gmc !== null ? (gmc >= 0 ? ', up ' : ', down ') + Math.abs(gmc) + ' points' : ''), detail: gm3 < 30 ? 'Low for a software business: most of each dollar of revenue goes to cost of revenue.' : (gmc ?? 0) < -3 ? 'Slipping: cost of revenue is taking a bigger share of each sale than the quarter before.' : gm3 < 50 ? 'Moderate: about ' + Math.round(gm3) + ' cents of each dollar is left to cover operating costs.' : 'Healthy room to cover operating costs.', tone: gm3 < 30 || (gmc ?? 0) < -3 ? 'risk' : gm3 < 50 ? 'watch' : 'good' })
  const cg = facts.cost_of_revenue_growth_pct as number | null
  if (cg !== null && g !== null && cg - g > 5) { rules.push({ title: 'Cost of revenue growing faster than revenue', detail: 'Cost of revenue ' + (cg >= 0 ? '+' : '') + cg + '% against revenue ' + (g >= 0 ? '+' : '') + g + '% on the quarter.', tone: 'risk' }); flags.push({ for: 'CFO', item: 'Unit costs: cost of revenue is outgrowing revenue', why: 'Margins shrink with every sale; check supplier rates, pricing and the mix of customers.' }) }
  if (runway !== null) { rules.push({ title: runway >= 24 ? 'Over two years of runway' : runway + ' months of runway', detail: 'Cash ' + Math.round(cash!.v).toLocaleString('en-US') + ' at ' + cash!.at + ', burning about ' + Math.round(burn!).toLocaleString('en-US') + ' a month.', tone: runway < 9 ? 'risk' : runway < 15 ? 'watch' : 'good' }); if (runway < 15) flags.push({ for: 'Executive team', item: 'Runway of ' + runway + ' months', why: 'Fundraising usually takes 6–9 months; decide now whether to raise, cut burn or reach break-even.' }) }
  if (lossPeriods >= Math.round(9 / per) && (niTtm ?? 0) < 0) flags.push({ for: 'Board', item: 'Losses in ' + lossPeriods + ' of the last ' + ttm.length + ' periods', why: 'Agree the path to break-even and the milestones that would change it.' })
  const ox = facts.opex_growth_qoq_pct as number | null
  if (ox !== null && g !== null && ox - g > 10) flags.push({ for: 'Executive team', item: 'Operating costs up ' + ox + '% while revenue moved ' + g + '%', why: 'Check which teams added cost and whether it is ahead of revenue on purpose.' })
  if (!cash || (rows.length && cash.at < rows[rows.length - 1]!.period_end)) flags.push({ for: 'CFO', item: cash ? 'Cash last reported at ' + cash.at : 'No cash balance in the figures', why: 'Without a current cash figure, runway and burn cannot be trusted; add the balance sheet for recent months.' })
  if (br && br.status === 'check' && br.issues.some((x) => /disagree|Cash went up|Profitable on paper/.test(x))) flags.unshift({ for: 'CFO', item: 'Check burn and runway', why: br.issues.filter((x) => /disagree|Cash went up|Profitable on paper/.test(x))[0]! })
  // Always four key points: fill with losses and operating costs when the rules above give fewer.
  const fmtN = (v: number | null) => (v === null ? 'n/a' : Math.round(v).toLocaleString('en-US'))
  const extra: Insight[] = []
  if (niTtm !== null && niTtm < 0 && ttm.length) extra.push({ title: 'Lost money in ' + lossPeriods + ' of the last ' + ttm.length + ' periods', detail: 'Net income last quarter ' + fmtN(ni3) + '; last 12 months ' + fmtN(niTtm) + '.', tone: lossPeriods >= ttm.length * 0.75 ? 'risk' : 'watch' })
  else if (niTtm !== null && niTtm > 0) extra.push({ title: 'Profitable over the last 12 months', detail: 'Net income ' + fmtN(niTtm) + (ni3 !== null ? '; last quarter ' + fmtN(ni3) : '') + '.', tone: 'good' })
  const oxr = facts.opex_to_revenue_pct as number | null, prr = facts.payroll_to_revenue_pct as number | null
  if (oxr !== null) extra.push({ title: 'Operating expenses ' + oxr + '% of revenue', detail: (prr !== null ? 'Payroll alone is ' + prr + '% of revenue. ' : '') + (ox !== null ? 'Operating expenses ' + (ox >= 0 ? 'up ' : 'down ') + Math.abs(ox) + '% on the quarter' + (g !== null ? ' against revenue ' + (g >= 0 ? '+' : '') + g + '%' : '') + '.' : ''), tone: oxr > 100 ? 'risk' : oxr > 60 ? 'watch' : 'good' })
  if (burn !== null && runway === null) extra.push({ title: 'Burning about ' + fmtN(burn) + ' a month', detail: 'Add a current cash balance to see runway.', tone: 'watch' })
  for (const x of extra) if (rules.length < 4) rules.push(x)
  const order = { risk: 0, watch: 1, good: 2 } as const
  rules.sort((a, b) => order[a.tone] - order[b.tone])
  return { facts, rules: rules.slice(0, 4), flags, period: rows.length ? rows[0]!.period_end + ' to ' + rows[rows.length - 1]!.period_end : '' }
}

const Out = z.object({ headline: z.string(), insights: z.array(z.object({ title: z.string(), detail: z.string(), tone: z.enum(['good', 'watch', 'risk']) })), flags: z.array(z.object({ for: z.enum(['Executive team', 'CFO', 'Board']), item: z.string(), why: z.string() })) })
export async function analyseFinancials(subject: string, rows: FinRow[], currency: string, company: string, force = false): Promise<Analysis> {
  const { facts, rules, flags, period } = factsOf(rows)
  const checks = checkRows(rows).filter((c) => c.severity === 'error').length
  const hash = createHash('sha256').update(JSON.stringify({ facts, checks, v: 5 })).digest('hex').slice(0, 40)
  if (!force) {
    const hit = (await db().query<{ analysis: Analysis }>('SELECT analysis FROM financials.analyses WHERE subject = $1 AND hash = $2', [subject, hash])).rows[0]
    if (hit) return hit.analysis
  }
  // Without AI: one line that joins growth, profit and runway.
  const f = facts as Record<string, number | null>
  const parts = [f.revenue_growth_qoq_pct != null ? 'Revenue ' + (f.revenue_growth_qoq_pct >= 0 ? 'up ' : 'down ') + Math.abs(f.revenue_growth_qoq_pct) + '% on the quarter' : '',
    (f.loss_periods_last_12m ?? 0) > 0 ? 'losses in ' + f.loss_periods_last_12m + ' of the last ' + Math.min(12, rows.length) + ' months' : (f.net_income_ttm ?? 0) > 0 ? 'profitable over the last year' : '',
    f.runway_months != null ? (f.runway_months >= 24 ? 'over two years of runway' : f.runway_months + ' months of runway') : ''].filter(Boolean)
  const head = parts.length ? parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Add a few months of figures to see the analysis.'
  const base: Analysis = { headline: head, insights: rules, flags, facts, checks, ai: false, as_of: new Date().toISOString(), period, currency }
  let out = base
  if (rows.length >= 3 && useRuntimeConfig().anthropicApiKey) {
    try {
      const { output } = await runAiTool({ task: 'fin_analysis', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'fin-analysis-v1', inputRef: subject,
        system: 'You are a seasoned startup CFO reviewing a founder\'s own management accounts. Use only the facts given (amounts in ' + currency + '). Write for a busy founder: plain words, specific numbers, no jargon, no filler, no praise for its own sake. ' +
          'Give a one-sentence headline; exactly 4 key insights, the most important first (what is going well, what to watch, what is a risk), each with the numbers behind it; and 2 to 6 flags: things to raise with the executive team, the CFO or the board, each with why it matters. ' +
          'Check burn and runway: burn_methods gives monthly burn worked out three ways and burn_check_issues lists disagreements; if they disagree or runway rests on stale cash, say which figure to trust and raise it as a CFO flag. If the facts point to a data problem (missing cash, totals that do not add up), say so as a CFO flag. Never invent figures.',
        user: 'Company: ' + company + '\nPeriod: ' + period + '\nFacts: ' + JSON.stringify(facts) + '\nArithmetic errors found in the figures: ' + checks + '\nRule-based notes so far: ' + JSON.stringify({ insights: rules, flags }),
        toolName: 'record_analysis', toolDescription: 'Record the analysis.', jsonSchema: { type: 'object', additionalProperties: false, required: ['headline', 'insights', 'flags'], properties: {
          headline: { type: 'string' }, insights: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'detail', 'tone'], properties: { title: { type: 'string' }, detail: { type: 'string' }, tone: { type: 'string', enum: ['good', 'watch', 'risk'] } } } },
          flags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['for', 'item', 'why'], properties: { for: { type: 'string', enum: ['Executive team', 'CFO', 'Board'] }, item: { type: 'string' }, why: { type: 'string' } } } } } },
        schema: Out, maxTokens: 2000 })
      out = { ...base, headline: output.headline.slice(0, 300), insights: [...output.insights.slice(0, 4).map((x) => ({ ...x, title: x.title.slice(0, 160), detail: x.detail.slice(0, 500) })), ...rules].slice(0, 4), flags: output.flags.slice(0, 6).map((x) => ({ ...x, item: x.item.slice(0, 200), why: x.why.slice(0, 400) })), ai: true }
    } catch (e) { console.error('[fin-analysis]', (e as Error).message) }
  }
  await db().query('INSERT INTO financials.analyses (subject, hash, analysis) VALUES ($1,$2,$3) ON CONFLICT (organization_id, subject) DO UPDATE SET hash = EXCLUDED.hash, analysis = EXCLUDED.analysis, created_at = now()', [subject, hash, JSON.stringify(out)])
  return out
}
