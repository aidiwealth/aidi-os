// What investors see about the figures, when the founder allows it: a short financial summary and, for any linked
// sheet the founder marked, where the figures come from (the sheet's own link). Used on the data room, the investor
// page and investor updates. Nothing is shown unless the founder turned it on.
import { factsOf } from './fin-analysis'
import { deriveLines, withSecurities, type FinRow } from '~/shared/fin-view'
export interface InvestorFin { summary: { period: string; latest: string | null; currency: string; items: { label: string; value: number | null; unit: 'money' | 'pct' | 'months'; note?: string }[] } | null; sources: { name: string; url: string; synced: string | null }[] }
export async function investorFinancials(): Promise<InvestorFin | null> {
  const org = await currentOrg()
  if (!org || org.kind !== 'company') return null
  const on = org.settings.investor_fin_summary === true
  const sources = (await db().query<{ name: string; url: string; synced: string | null }>("SELECT name, url, to_char(last_synced_at, 'YYYY-MM-DD') AS synced FROM financials.sheet_links WHERE target = 'financials' AND show_source ORDER BY created_at").catch(() => ({ rows: [] }))).rows
    .filter((s) => /^https:\/\//i.test(s.url))
  if (!on && !sources.length) return null
  let summary: InvestorFin['summary'] = null
  if (on) {
    const ent = await companyEntityId()
    const rows = ent ? await loadStatements('entity:' + ent, 'month', (org.settings.currency as string) || 'USD') : []
    const fr: FinRow[] = rows.map((r) => ({ period_end: r.period_end, period_type: r.period_type, currency: r.currency, lines: r.lines, kpis: r.kpis ?? {}, derived: withSecurities(deriveLines(r.lines, 1), org.settings.cash_with_securities === true) }))
    if (fr.length) {
      const { facts, period } = factsOf(fr)
      const f = (k: string) => (typeof facts[k] === 'number' ? (facts[k] as number) : null)
      summary = { period, latest: (facts.latest as string) ?? null, currency: fr[fr.length - 1]!.currency, items: [
        { label: 'Revenue, last 12 months', value: f('revenue_ttm'), unit: 'money' as const },
        { label: 'Revenue, last quarter', value: f('revenue_last_quarter'), unit: 'money' as const, note: f('revenue_growth_qoq_pct') !== null ? (f('revenue_growth_qoq_pct')! >= 0 ? '+' : '') + f('revenue_growth_qoq_pct') + '% on the quarter before' : undefined },
        { label: 'Gross margin', value: f('gross_margin_pct'), unit: 'pct' as const },
        { label: 'Net income, last quarter', value: f('net_income_last_quarter'), unit: 'money' as const },
        { label: 'Cash', value: f('cash'), unit: 'money' as const, note: facts.cash_as_of ? 'at ' + facts.cash_as_of : undefined },
        { label: 'Runway', value: f('runway_months'), unit: 'months' as const }
      ].filter((x) => x.value !== null) }
    }
  }
  return { summary, sources }
}
