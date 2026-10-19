// What the customer numbers say, in four key points (retention page or customers page). Facts are worked out here;
// AI writes them up when on. Kept until the data changes.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { addM, bridge, byGroup, cohorts, customerStats, monthsBetween, retention, span, type Cust } from '~/shared/customer-metrics'

export interface CustInsight { title: string; detail: string; tone: 'good' | 'watch' | 'risk' }
export interface CustAnalysis { headline: string; insights: CustInsight[]; ai: boolean; as_of: string; kind: string }
const P = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1000) / 10)
const R = (x: number | null | undefined) => (x == null ? null : Math.round(x))

export function customerFacts(kind: 'retention' | 'customers', cs: Cust[], cfg: CustConfig, fin: { revenue: Record<string, number>; gm: number | null }) {
  const sp = span(cs); if (!sp) return null
  const asOf = sp.last, t = { enterprise: cfg.enterprise_arr, midmarket: cfg.midmarket_arr }
  const basis = cfg.retention_basis ?? 'month', grace = cfg.dormant_months ?? 1
  const { rows, summary } = customerStats(cs, asOf, t, cfg.group_by, fin.gm, cfg.currency, { grace, basis })
  const groups = byGroup(cs, rows, asOf, cfg.group_by, t, basis)
  const r12 = retention(cs, asOf, 12, basis), r12p = retention(cs, addM(asOf, -3), 12, basis)
  const br = bridge(cs, monthsBetween(addM(asOf, -2), asOf), grace)
  const sum = (k: 'new' | 'expansion' | 'contraction' | 'churned') => br.reduce((s, r) => s + r[k], 0)
  const recent3 = [0, 1, 2].map((i) => addM(asOf, -i)), cust3 = recent3.reduce((s, m) => s + cs.reduce((a, c) => a + (c.rev[m] ?? 0), 0), 0)
  const fin3 = recent3.every((m) => typeof fin.revenue[m] === 'number') ? recent3.reduce((s, m) => s + fin.revenue[m]!, 0) : null
  const co = cohorts(cs, asOf).filter((c) => c.cells[3] !== null)
  const facts: Record<string, unknown> = { billing: cfg.billing ?? 'subscription', retention_windows: basis, months_without_revenue_before_lost: grace, as_of: asOf, months_of_data: monthsBetween(sp.first, sp.last).length, currency: cfg.currency, customers: cs.length, active: summary.active, mrr: R(summary.mrr), arr: R(summary.arr),
    nrr_12m_pct: P(r12.nrr), grr_12m_pct: P(r12.grr), logo_churn_12m_pct: P(r12.logo_churn), nrr_12m_pct_3_months_ago: P(r12p.nrr), customers_a_year_ago: r12.customers,
    last_3_months: { new: R(sum('new')), expansion: R(sum('expansion')), contraction: R(sum('contraction')), churned: R(sum('churned')) },
    group_by: cfg.group_by, groups: groups.slice(0, 8).map((g) => ({ group: g.group, customers: g.customers, share_pct: P(g.share), nrr_pct: P(g.nrr), grr_pct: P(g.grr), logo_churn_pct: P(g.logo_churn), arpa_month: R(g.arpa), growth_pct: P(g.growth) })),
    customer_revenue_vs_financials_pct: fin3 ? P(cust3 / fin3 - 1) : null, cohort_m12_retention_pct: co.length ? P(co.reduce((s, c) => s + c.cells[3]!, 0) / co.length) : null }
  if (kind === 'customers') {
    const top = [...rows].sort((a, b) => b.ttm - a.ttm)
    const movers = rows.filter((r) => r.growth !== null && r.prior_ttm > 0)
    Object.assign(facts, { arpa_month: R(summary.arpa), ltv: R(summary.ltv), cac: R(summary.cac), ltv_to_cac: summary.ltv_cac ? Math.round(summary.ltv_cac * 10) / 10 : null, payback_months: summary.payback ? Math.round(summary.payback) : null, gross_margin_pct: P(summary.gm), expected_lifetime_months: summary.lifetime_months ? Math.round(summary.lifetime_months) : null,
      top1_share_pct: P(summary.top1), top5_share_pct: P(summary.top5), top10_share_pct: P(summary.top10), pct_of_customers_making_80pct_revenue: P(summary.pareto),
      top: top.slice(0, 5).map((r) => ({ name: r.name, ttm: R(r.ttm), share_pct: P(r.share), growth_pct: P(r.growth) })),
      fastest_growing: [...movers].sort((a, b) => (b.ttm - b.prior_ttm) - (a.ttm - a.prior_ttm)).slice(0, 3).map((r) => ({ name: r.name, change: R(r.ttm - r.prior_ttm), growth_pct: P(r.growth) })),
      biggest_declines: [...movers].sort((a, b) => (a.ttm - a.prior_ttm) - (b.ttm - b.prior_ttm)).slice(0, 3).filter((r) => r.ttm < r.prior_ttm).map((r) => ({ name: r.name, change: R(r.ttm - r.prior_ttm), growth_pct: P(r.growth) })),
      sectors: byGroup(cs, rows, asOf, 'sector', t, basis).slice(0, 8).map((g) => ({ sector: g.group, customers: g.customers, share_pct: P(g.share), growth_pct: P(g.growth), nrr_pct: P(g.nrr), arpa_month: R(g.arpa) })) })
  }
  return facts
}

function rules(kind: string, f: Record<string, unknown>): CustInsight[] {
  const out: CustInsight[] = [], n = (k: string) => f[k] as number | null
  const cur = String(f.currency), money = (v: number | null) => (v == null ? '—' : cur + ' ' + Math.round(v).toLocaleString('en-US'))
  if (kind === 'retention') {
    const nrr = n('nrr_12m_pct'), grr = n('grr_12m_pct'), lc = n('logo_churn_12m_pct')
    if (nrr !== null) out.push({ title: 'Net revenue retention ' + nrr + '%', detail: (nrr >= 100 ? 'Customers from a year ago pay more today than they did then: expansion outweighs churn.' : 'Customers from a year ago pay less today: churn and downgrades outweigh expansion.') + ' Strong B2B software is 110%+; under 90% needs attention.', tone: nrr >= 105 ? 'good' : nrr >= 90 ? 'watch' : 'risk' })
    if (grr !== null) out.push({ title: 'Gross revenue retention ' + grr + '%', detail: 'Revenue kept from last year\'s customers before any expansion. Above 90% is healthy for enterprise; 80% is typical for SMB.', tone: grr >= 90 ? 'good' : grr >= 80 ? 'watch' : 'risk' })
    if (lc !== null) out.push({ title: lc + '% of customers lost in 12 months', detail: (f.customers_a_year_ago as number) + ' customers paid a year ago; ' + Math.round((f.customers_a_year_ago as number) * (1 - lc / 100)) + ' still pay.', tone: lc <= 10 ? 'good' : lc <= 25 ? 'watch' : 'risk' })
    const gs = (f.groups as { group: string; nrr_pct: number | null; share_pct: number | null }[]).filter((g) => g.nrr_pct !== null && g.group !== 'Not set')
    if (gs.length >= 2) { const s = [...gs].sort((a, b) => b.nrr_pct! - a.nrr_pct!); out.push({ title: s[0]!.group + ' retains best, ' + s[s.length - 1]!.group + ' least', detail: s.map((g) => g.group + ' ' + g.nrr_pct + '%').join(', ') + ' net retention.', tone: s[s.length - 1]!.nrr_pct! < 90 ? 'watch' : 'good' }) }
    const gap = n('customer_revenue_vs_financials_pct')
    if (gap !== null && Math.abs(gap) > 5) out.push({ title: 'Customer revenue is ' + Math.abs(gap) + '% ' + (gap > 0 ? 'above' : 'below') + ' Financials', detail: 'The last three months of customer revenue do not match the revenue in your Financials. Check for missing customers, credits or revenue recorded differently.', tone: 'risk' })
  } else {
    const t10 = n('top10_share_pct'), t1 = n('top1_share_pct'), ltv = n('ltv'), lc = n('ltv_to_cac')
    const top = (f.top as { name: string; share_pct: number }[])[0]
    if (t1 !== null && top) out.push({ title: top.name + ' is ' + t1 + '% of revenue', detail: 'Top 10 customers: ' + t10 + '% of the last 12 months. ' + (t1 > 20 ? 'Losing the largest customer would hurt; investors will ask about it.' : 'No single customer dominates.'), tone: t1 > 20 ? 'risk' : t10 !== null && t10 > 60 ? 'watch' : 'good' })
    if (n('arpa_month') !== null) out.push({ title: 'Average customer pays ' + money(n('arpa_month')) + ' a month', detail: 'Lifetime value about ' + money(ltv) + (n('expected_lifetime_months') ? ' over an expected ' + n('expected_lifetime_months') + ' months' : '') + (n('gross_margin_pct') !== null ? ', after ' + n('gross_margin_pct') + '% gross margin.' : '.'), tone: 'good' })
    if (lc !== null) out.push({ title: 'LTV is ' + lc + '× acquisition cost', detail: 'Payback in about ' + n('payback_months') + ' months. 3× or more with payback under 18 months is the usual bar.', tone: lc >= 3 ? 'good' : lc >= 1.5 ? 'watch' : 'risk' })
    const dec = (f.biggest_declines as { name: string; change: number }[])
    if (dec.length) out.push({ title: dec[0]!.name + ' fell the most', detail: dec.map((d) => d.name + ' ' + money(d.change)).join(', ') + ' over the last 12 months against the 12 before.', tone: 'watch' })
    const sec = (f.sectors as { sector: string; share_pct: number; growth_pct: number | null }[]).filter((s) => s.sector !== 'Not set')
    if (sec.length >= 2) out.push({ title: sec[0]!.sector + ' is the largest sector (' + sec[0]!.share_pct + '%)', detail: sec.slice(0, 4).map((s) => s.sector + ' ' + s.share_pct + '%' + (s.growth_pct !== null ? ' (' + (s.growth_pct >= 0 ? '+' : '') + s.growth_pct + '%)' : '')).join(', ') + '.', tone: 'good' })
  }
  const order = { risk: 0, watch: 1, good: 2 }
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4)
}

const Out = z.object({ headline: z.string(), insights: z.array(z.object({ title: z.string(), detail: z.string(), tone: z.enum(['good', 'watch', 'risk']) })) })
const FACTS = new Map<string, { key: string; facts: Record<string, unknown> }>()
export async function analyseCustomers(kind: 'retention' | 'customers', force = false): Promise<CustAnalysis | null> {
  const cfg = await customerConfig()
  const fin = await financialsRevenue(cfg.currency)
  // The facts take a while on large customer files; they are kept until the data, settings or Financials change.
  const org = currentOrgId() ?? '', key = createHash('sha256').update(JSON.stringify([kind, await customerStamp(), cfg, fin])).digest('hex')
  const sk = org + kind + (custEntityId() ?? 'group')
  let facts = FACTS.get(sk)?.key === key ? FACTS.get(sk)!.facts : null
  if (!facts) { facts = customerFacts(kind, await loadCustomers(), cfg, fin); if (!facts) return null; FACTS.set(sk, { key, facts }); if (FACTS.size > 60) FACTS.delete(FACTS.keys().next().value!) }
  // Each company's analysis and the group's are kept apart.
  const subject = 'customers:' + kind + (custEntityId() ? ':' + custEntityId() : '')
  const hash = createHash('sha256').update(JSON.stringify({ facts, v: 2 })).digest('hex').slice(0, 40)
  if (!force) { const hit = (await db().query<{ analysis: CustAnalysis }>('SELECT analysis FROM financials.analyses WHERE subject = $1 AND hash = $2', [subject, hash])).rows[0]; if (hit) return hit.analysis }
  const ins = rules(kind, facts)
  let out: CustAnalysis = { headline: ins[0] ? ins.map((i) => i.title).slice(0, 2).join('; ') + '.' : 'Upload more months to see the analysis.', insights: ins, ai: false, as_of: String(facts.as_of), kind }
  if (useRuntimeConfig().anthropicApiKey) {
    try {
      const { output } = await runAiTool({ task: 'customer_analysis', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'customer-analysis-v2', inputRef: subject,
        system: 'You are a growth-stage CFO and investor reviewing a company\'s ' + (kind === 'retention' ? 'revenue retention and churn' : 'customer base (top and least performing customers, sectors, concentration, lifetime value and acquisition cost)') + '. Use only the facts given (amounts in ' + facts.currency + '). ' +
          'When billing is usage or prepaid (customers buy credit, like SMS units, and use it over months), a quiet month is not a lost customer and revenue is seasonal: the facts already count a customer lost only after months_without_revenue_before_lost months with nothing, and compare retention_windows; say so where it matters. ' +
          'Use only the numbers in the facts, exactly as given: never multiply, annualise or add them up yourself (a wrong total is worse than none). Each detail at most two short sentences, in plain words a founder understands, ending with what to do. ' +
          'Give a one-sentence headline and exactly 4 key points, most important first, each with the numbers behind it and what to do about it. Compare with usual benchmarks for B2B software and fintech where useful. Plain words, no filler. If customer revenue does not match Financials by more than 5%, make that a risk point.',
        user: JSON.stringify(facts), toolName: 'record_points', toolDescription: 'Record the headline and four key points.', schema: Out, maxTokens: 1500,
        jsonSchema: { type: 'object', additionalProperties: false, required: ['headline', 'insights'], properties: { headline: { type: 'string' }, insights: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'detail', 'tone'], properties: { title: { type: 'string' }, detail: { type: 'string' }, tone: { type: 'string', enum: ['good', 'watch', 'risk'] } } } } } } })
      if (output.insights.length) out = { ...out, headline: output.headline.slice(0, 300), insights: output.insights.slice(0, 4).map((x) => ({ ...x, title: x.title.slice(0, 160), detail: x.detail.slice(0, 500) })), ai: true }
    } catch (e) { console.error('[customer-analysis]', (e as Error).message) }
  }
  await db().query('INSERT INTO financials.analyses (subject, hash, analysis) VALUES ($1,$2,$3) ON CONFLICT (organization_id, subject) DO UPDATE SET hash = EXCLUDED.hash, analysis = EXCLUDED.analysis, created_at = now()', [subject, hash, JSON.stringify(out)])
  return out
}
