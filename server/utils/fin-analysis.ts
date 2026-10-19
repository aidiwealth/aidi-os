// What a founder's own figures say: growth, margins, costs against revenue, burn and runway, and what to take to the
// executive team and the CFO. The facts are worked out here; AI writes them up (and is skipped when it is off). The
// result is kept until the figures change.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { burnReview, checkRows, deriveLines, type FinRow } from '~/shared/fin-view'
import { modelOf } from '~/shared/business-models'

export interface Insight { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }
export interface Flag { for: 'Executive team' | 'CFO' | 'Board'; item: string; why: string }
export interface Analysis { headline: string; insights: Insight[]; flags: Flag[]; facts: Record<string, number | string | null>; checks: number; ai: boolean; as_of: string; period: string; currency: string }

const pct = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10)
const sumK = (rows: FinRow[], k: string) => { const v = rows.map((r) => r.derived[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, x) => a + x, 0) : null }
const avg = (rows: FinRow[], k: string) => { const v = rows.map((r) => r.derived[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null }
const lastKnown = (rows: FinRow[], k: string) => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i]!.derived[k]; if (typeof v === 'number') return { v, at: rows[i]!.period_end } } return null }

export function factsOf(raw: FinRow[], model?: string | null): { facts: Record<string, number | string | null>; rules: Insight[]; flags: Flag[]; period: string } {
  const today = new Date().toISOString().slice(0, 10)
  const rows = raw.filter((r) => r.period_end <= today).map((r) => ({ ...r, derived: r.derived ?? deriveLines(r.lines, r.period_type === 'year' ? 12 : r.period_type === 'quarter' ? 3 : 1) }))
  const per = rows[0]?.period_type === 'quarter' ? 3 : rows[0]?.period_type === 'year' ? 12 : 1
  // Windows by date, not by position, so a missing month or year never shifts "a year ago" onto the wrong period:
  // the last quarter (or year), the one before, the same window a year earlier, and the last 12 months.
  const mi = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1
  const L = Math.max(3, per), end = rows.length ? mi(rows[rows.length - 1]!.period_end) : 0
  const within = (a: number, b: number) => rows.filter((r) => mi(r.period_end) >= a && mi(r.period_end) <= b)
  const last = within(end - L + 1, end), prior = within(end - 2 * L + 1, end - L), yearAgo = within(end - 12 - L + 1, end - 12)
  const ttm = within(end - 11, end)
  // A comparison window counts only when it is complete (the same number of periods as the latest one).
  const rev3 = sumK(last, 'revenue'), revP = prior.length === last.length ? sumK(prior, 'revenue') : null, revY = yearAgo.length === last.length ? sumK(yearAgo, 'revenue') : null
  const gm3 = avg(last, 'gross_margin'), gmP = avg(prior, 'gross_margin')
  const ox3 = sumK(last, 'opex_total'), oxP = sumK(prior, 'opex_total')
  const cogs3 = sumK(last, 'cogs'), cogsP = sumK(prior, 'cogs')
  const ni3 = sumK(last, 'net_income'), niTtm = sumK(ttm, 'net_income')
  // Burn and runway checked three ways on monthly figures (cash flow, change in cash, net loss); else the average.
  const br = per === 1 ? burnReview(rows) : null
  const cash = lastKnown(rows, 'cash'), burn = br && br.burn !== null ? br.burn : avg(last, 'burn')
  // Runway only from a cash balance within two months of the latest figures.
  const cashFresh = !!cash && end - mi(cash.at) < 2
  const runway = cash && cashFresh && burn ? Math.round((cash.v / burn) * 10) / 10 : null
  const lossPeriods = ttm.filter((r) => (r.derived.net_income ?? 0) < 0).length
  const payroll3 = sumK(last, 'opex_payroll')
  // Break-even, worked out here so the write-up never does its own arithmetic: monthly averages over the last quarter.
  const bm = modelOf(model)
  const mo = (v: number | null) => (v === null || !last.length ? null : v / (last.length * per))
  const gpM = mo(sumK(last, 'gross_profit')), oxM = mo(ox3), revM = mo(rev3), oiM = mo(sumK(last, 'other_income'))
  const beRev = oxM !== null && gm3 !== null && gm3 > 0 ? (oxM - (oiM ?? 0)) / (gm3 / 100) : null
  const shortfall = gpM !== null && oxM !== null ? oxM - gpM - (oiM ?? 0) : null
  const facts: Record<string, number | string | null> = {
    periods: rows.length, period_type: rows[0]?.period_type ?? 'month', latest: rows[rows.length - 1]?.period_end ?? null,
    revenue_last_quarter: rev3, revenue_growth_qoq_pct: pct(rev3, revP), revenue_growth_yoy_pct: pct(rev3, revY), revenue_ttm: sumK(ttm, 'revenue'),
    gross_margin_pct: gm3 === null ? null : Math.round(gm3 * 10) / 10, gross_margin_change_pts: gm3 !== null && gmP !== null ? Math.round((gm3 - gmP) * 10) / 10 : null,
    cost_of_revenue_growth_pct: pct(cogs3, cogsP), opex_growth_qoq_pct: pct(ox3, oxP), opex_to_revenue_pct: ox3 !== null && rev3 ? Math.round((ox3 / rev3) * 1000) / 10 : null,
    payroll_to_revenue_pct: payroll3 !== null && rev3 ? Math.round((payroll3 / rev3) * 1000) / 10 : null,
    net_income_last_quarter: ni3, net_income_ttm: niTtm, loss_periods_last_12m: lossPeriods, monthly_burn: burn === null ? null : Math.round(burn),
    cash: cash?.v ?? null, cash_as_of: cash?.at ?? null, cash_months_before_latest: cash ? end - mi(cash.at) : null, months_missing: (() => { const ms = rows.filter((r) => r.period_type === 'month').map((r) => mi(r.period_end)); let k = 0; for (let j = 1; j < ms.length; j++) k += Math.max(0, ms[j]! - ms[j - 1]! - 1); return k })(), runway_months: runway, burn_basis: br?.basis || null, burn_methods: br ? JSON.stringify(br.methods.map((m) => ({ method: m.label, monthly: m.value === null ? null : Math.round(m.value) }))) : null, burn_check_issues: br && br.issues.length ? br.issues.join(' ') : null, burn_notes: br && br.notes.length ? br.notes.join(' ') : null, burn_if_bills_paid: br?.runway_at_loss ? br.loss_burn : null, runway_if_bills_paid_months: br?.runway_at_loss ?? null,
    business_type: bm?.label ?? 'not set', typical_gross_margin_pct: bm?.gm ? bm.gm[0] + '-' + bm.gm[1] : null, typical_margin_why: bm?.why || null,
    revenue_monthly: revM === null ? null : Math.round(revM), gross_profit_monthly: gpM === null ? null : Math.round(gpM), opex_monthly: oxM === null ? null : Math.round(oxM), other_income_monthly: oiM === null ? null : Math.round(oiM),
    gross_profit_covers_opex_pct: gpM !== null && oxM ? Math.round((gpM / oxM) * 100) : null, breakeven_revenue_monthly: beRev === null ? null : Math.round(beRev),
    revenue_increase_to_breakeven_pct: beRev !== null && revM && shortfall !== null && shortfall > 0 ? Math.round(((beRev - revM) / revM) * 1000) / 10 : null, opex_cut_to_breakeven_monthly: shortfall !== null && shortfall > 0 ? Math.round(shortfall) : null, ebitda_margin_pct: (() => { const e = sumK(last, 'ebitda'); return e !== null && rev3 ? Math.round((e / rev3) * 1000) / 10 : null })()
  }
  // Plain rules, so there is something useful even without AI.
  const rules: Insight[] = [], flags: Flag[] = []
  const g = facts.revenue_growth_qoq_pct as number | null, gy = facts.revenue_growth_yoy_pct as number | null
  if (g !== null) rules.push({ title: g >= 0 ? 'Revenue up ' + g + '% on the quarter before' : 'Revenue down ' + Math.abs(g) + '% on the quarter before', detail: gy !== null ? 'Year on year: ' + (gy >= 0 ? '+' : '') + gy + '%.' : 'Not enough history for a year-on-year view.', tone: g >= 5 ? 'good' : g >= -2 ? 'watch' : 'risk' })
  const gmc = facts.gross_margin_change_pts as number | null
  if (gm3 !== null) {
    // Judged against similar businesses: a messaging or telecom company keeps far less of each sale than software.
    const r = bm?.gm, gmR = Math.round(gm3), slip = (gmc ?? 0) < -3
    const title = 'Gross margin ' + gmR + '%' + (gmc !== null ? (gmc >= 0 ? ', up ' : ', down ') + Math.abs(gmc) + ' points' : '')
    if (r) rules.push({ title, detail: (gm3 < r[0] ? 'Below the usual ' + r[0] + '–' + r[1] + '% for ' + bm!.short + ' companies' : gm3 > r[1] ? 'Above the usual ' + r[0] + '–' + r[1] + '% for ' + bm!.short + ' companies' : 'Within the usual ' + r[0] + '–' + r[1] + '% for ' + bm!.short + ' companies') + ' (' + bm!.why + ').' + (slip ? ' Slipping: cost of revenue is taking a bigger share of each sale than the quarter before.' : ''), tone: gm3 < r[0] || slip ? 'risk' : gm3 < (r[0] + r[1]) / 2 ? 'watch' : 'good' })
    else rules.push({ title, detail: (slip ? 'Slipping: cost of revenue is taking a bigger share of each sale than the quarter before. ' : '') + 'About ' + gmR + ' cents of each dollar of revenue is left to cover operating costs. Set your business type to compare this with similar companies.', tone: slip ? 'risk' : gm3 < 20 ? 'watch' : gm3 < 50 ? 'watch' : 'good' })
  }
  const cg = facts.cost_of_revenue_growth_pct as number | null
  if (cg !== null && g !== null && cg - g > 5) { rules.push({ title: 'Cost of revenue growing faster than revenue', detail: 'Cost of revenue ' + (cg >= 0 ? '+' : '') + cg + '% against revenue ' + (g >= 0 ? '+' : '') + g + '% on the quarter.', tone: 'risk' }); flags.push({ for: 'CFO', item: 'Unit costs: cost of revenue is outgrowing revenue', why: 'Margins shrink with every sale; check supplier rates, pricing and the mix of customers.' }) }
  // When unpaid bills or similar keep cash burn below the loss, the lower runway (at the loss rate) sets the tone.
  const rwLow = br?.runway_at_loss ?? runway, top = br?.notes.length ? br.drivers[0] : null
  if (runway !== null) { rules.push({ title: br?.runway_at_loss ? runway + ' months of runway, ' + br.runway_at_loss + ' at the loss rate' : runway >= 24 ? 'Over two years of runway' : runway + ' months of runway', detail: 'Cash ' + Math.round(cash!.v).toLocaleString('en-US') + ' at ' + cash!.at + ', burning about ' + Math.round(burn!).toLocaleString('en-US') + ' a month.' + (top ? ' Cash burn is ' + (br!.burn! < (br!.loss_burn ?? 0) ? 'below' : 'above') + ' the loss (' + Math.round(br!.loss_burn ?? 0).toLocaleString('en-US') + ' a month) mainly because ' + top.label + ' over the last ' + br!.months + ' months.' : ''), tone: rwLow! < 9 ? 'risk' : rwLow! < 15 ? 'watch' : 'good' }); if (rwLow! < 15) flags.push({ for: 'Executive team', item: 'Runway of ' + rwLow + ' months', why: 'Fundraising usually takes 6–9 months; decide now whether to raise, cut burn or reach break-even.' }) }
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
  if (facts.breakeven_revenue_monthly !== null && facts.opex_cut_to_breakeven_monthly !== null && revM) extra.push({ title: 'Break-even needs about ' + fmtN(facts.breakeven_revenue_monthly as number) + ' a month in revenue', detail: 'Gross profit (' + fmtN(gpM) + ' a month) covers ' + facts.gross_profit_covers_opex_pct + '% of operating costs. At a ' + Math.round(gm3!) + '% gross margin, revenue would need to rise about ' + facts.revenue_increase_to_breakeven_pct + '% from ' + fmtN(revM) + ' a month, or operating costs fall about ' + fmtN(facts.opex_cut_to_breakeven_monthly as number) + ' a month.', tone: (facts.revenue_increase_to_breakeven_pct as number) > 50 ? 'risk' : 'watch' })
  if (burn !== null && runway === null) extra.push({ title: 'Burning about ' + fmtN(burn) + ' a month', detail: 'Add a current cash balance to see runway.', tone: 'watch' })
  for (const x of extra) if (rules.length < 4) rules.push(x)
  const order = { risk: 0, watch: 1, good: 2 } as const
  rules.sort((a, b) => order[a.tone] - order[b.tone])
  return { facts, rules: rules.slice(0, 4), flags, period: rows.length ? rows[0]!.period_end + ' to ' + rows[rows.length - 1]!.period_end : '' }
}

const Out = z.object({ headline: z.string(), insights: z.array(z.object({ title: z.string(), detail: z.string(), tone: z.enum(['good', 'watch', 'risk']) })), flags: z.array(z.object({ for: z.enum(['Executive team', 'CFO', 'Board']), item: z.string(), why: z.string() })) })
// Claims the facts contradict are dropped from the AI write-up (the rule-based points take their place).
export function contradicts(text: string, f: Record<string, number | string | null>): boolean {
  const t = text.toLowerCase(), num = (k: string) => (typeof f[k] === 'number' ? (f[k] as number) : null)
  const gp = num('gross_profit_monthly')
  if (gp !== null && gp > 0 && /((zero|no|without( any)?)\s+(opex|operating (costs?|expenses?|spend))|(opex|operating (costs?|expenses?)) (of|at|were) (zero|nothing))[^.]{0,80}\b(lose|losing|loss|still (be )?(in the red|negative)|unprofitable)/.test(t)) return true
  if (gp !== null && gp > 0 && /gross (profit|margin) (is |was )?negative|selling (at|below) (a )?(loss|cost)/.test(t)) return true
  if (f.business_type !== 'Software (SaaS)' && /\bsoftware\b/.test(t) && /\b(low|poor|dangerous|weak|thin|below)\b/.test(t)) return true
  const rw = num('runway_months'), rwPaid = num('runway_if_bills_paid_months')
  if (rw === null && /\d+(\.\d+)?\s*months?\s+(of\s+)?runway|runway\s+of\s+\d/.test(t)) return true
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*months?\s+(?:of\s+)?runway|runway\s+(?:of|is|at)\s+(?:about\s+|around\s+)?(\d+(?:\.\d+)?)\s*months?/g)) {
    const v = Number(m[1] ?? m[2]); if (rw !== null && Math.abs(v - rw) > 1 && (rwPaid === null || Math.abs(v - rwPaid) > 1)) return true
  }
  const gm = num('gross_margin_pct')
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)%\s+gross margin|gross margin\s+(?:of\s+|is\s+|at\s+)?(\d+(?:\.\d+)?)%/g)) { const v = Number(m[1] ?? m[2]); if (gm !== null && Math.abs(v - gm) > 1.5) return true }
  return false
}
export async function analyseFinancials(subject: string, rows: FinRow[], currency: string, company: string, force = false, model: string | null = null): Promise<Analysis> {
  const { facts, rules, flags, period } = factsOf(rows, model)
  const checks = checkRows(rows).filter((c) => c.severity === 'error').length
  const hash = createHash('sha256').update(JSON.stringify({ facts, checks, v: 8 })).digest('hex').slice(0, 40)
  if (!force) {
    const hit = (await db().query<{ analysis: Analysis }>('SELECT analysis FROM financials.analyses WHERE subject = $1 AND hash = $2', [subject, hash])).rows[0]
    if (hit) return hit.analysis
  }
  // Without AI: one line that joins growth, profit and runway.
  const f = facts as Record<string, number | null>
  const parts = [f.revenue_growth_qoq_pct != null ? 'Revenue ' + (f.revenue_growth_qoq_pct >= 0 ? 'up ' : 'down ') + Math.abs(f.revenue_growth_qoq_pct) + '% on the quarter' : '',
    (f.loss_periods_last_12m ?? 0) > 0 ? 'losses in ' + f.loss_periods_last_12m + ' of the last ' + Math.min(12, rows.length) + ' months' : (f.net_income_ttm ?? 0) > 0 ? 'profitable over the last year' : '',
    f.runway_months != null ? (f.runway_if_bills_paid_months != null ? f.runway_months + ' months of runway (' + f.runway_if_bills_paid_months + ' at the loss rate)' : f.runway_months >= 24 ? 'over two years of runway' : f.runway_months + ' months of runway') : ''].filter(Boolean)
  const head = parts.length ? parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Add a few months of figures to see the analysis.'
  const base: Analysis = { headline: head, insights: rules, flags, facts, checks, ai: false, as_of: new Date().toISOString(), period, currency }
  let out = base
  if (rows.length >= 3 && useRuntimeConfig().anthropicApiKey) {
    try {
      const { output } = await runAiTool({ task: 'fin_analysis', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'fin-analysis-v2', inputRef: subject,
        system: 'You are a seasoned startup CFO reviewing a founder\'s own management accounts. Use only the facts given (amounts in ' + currency + '). Write for a busy founder: plain words, specific numbers, no jargon, no filler, no praise for its own sake. ' +
          'Give a one-sentence headline; exactly 4 key insights, the most important first (what is going well, what to watch, what is a risk), each with the numbers behind it; and 2 to 6 flags: things to raise with the executive team, the CFO or the board, each with why it matters. ' +
          'Business type: ' + (facts.business_type ?? 'not set') + '. Judge gross margin against typical_gross_margin_pct for that type (' + (facts.typical_margin_why ?? 'no range: the type is not set, so do not compare with software or any other industry') + '); never call a margin low for software unless the business is software. ' +
          'Break-even is already worked out in the facts (gross_profit_monthly, opex_monthly, gross_profit_covers_opex_pct, breakeven_revenue_monthly, revenue_increase_to_breakeven_pct, opex_cut_to_breakeven_monthly): quote those, never work out your own. Never say anything the facts contradict: when gross_profit_monthly is positive the company would make money with no operating costs. ' +
          'If cash_months_before_latest is 2 or more, the cash balance is out of date: give no runway and raise it as a CFO flag. If months_missing is above 0, say figures are missing for some months. ' +
          'Check burn and runway: burn_methods gives monthly burn worked out several ways (including cash flow worked out from the balance sheet), burn_notes explains a gap between cash burn and the loss (e.g. bills left unpaid), and burn_check_issues lists real disagreements. When burn_notes explains the gap, it is not a data problem: say what drives it and, if runway_if_bills_paid_months is given, that runway is shorter once those bills are paid. Raise a CFO flag only for burn_check_issues or stale cash. If the facts point to a data problem (missing cash, totals that do not add up), say so as a CFO flag. Never invent figures.',
        user: 'Company: ' + company + '\nPeriod: ' + period + '\nFacts: ' + JSON.stringify(facts) + '\nArithmetic errors found in the figures: ' + checks + '\nRule-based notes so far: ' + JSON.stringify({ insights: rules, flags }),
        toolName: 'record_analysis', toolDescription: 'Record the analysis.', jsonSchema: { type: 'object', additionalProperties: false, required: ['headline', 'insights', 'flags'], properties: {
          headline: { type: 'string' }, insights: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'detail', 'tone'], properties: { title: { type: 'string' }, detail: { type: 'string' }, tone: { type: 'string', enum: ['good', 'watch', 'risk'] } } } },
          flags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['for', 'item', 'why'], properties: { for: { type: 'string', enum: ['Executive team', 'CFO', 'Board'] }, item: { type: 'string' }, why: { type: 'string' } } } } } },
        schema: Out, maxTokens: 2000 })
      const ok = (x: string) => !contradicts(x, facts)
      const ins = output.insights.filter((x) => ok(x.title + ' ' + x.detail)).slice(0, 4).map((x) => ({ ...x, title: x.title.slice(0, 160), detail: x.detail.slice(0, 500) }))
      const fl = output.flags.filter((x) => ok(x.item + ' ' + x.why)).slice(0, 6).map((x) => ({ ...x, item: x.item.slice(0, 200), why: x.why.slice(0, 400) }))
      out = { ...base, headline: ok(output.headline) ? output.headline.slice(0, 300) : base.headline, insights: [...ins, ...rules.filter((r) => !ins.some((i) => i.title === r.title))].slice(0, 4), flags: fl.length ? fl : flags, ai: true }
    } catch (e) { console.error('[fin-analysis]', (e as Error).message) }
  }
  await db().query('INSERT INTO financials.analyses (subject, hash, analysis) VALUES ($1,$2,$3) ON CONFLICT (organization_id, subject) DO UPDATE SET hash = EXCLUDED.hash, analysis = EXCLUDED.analysis, created_at = now()', [subject, hash, JSON.stringify(out)])
  return out
}
