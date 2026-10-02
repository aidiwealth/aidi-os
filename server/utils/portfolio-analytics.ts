// Turns reported months into the numbers and flags a partner wants first. Deterministic: no AI, no guessing.
export interface MonthRow { period: string; values: Record<string, number | null> }
export interface Analysis { headline: string[]; flags: { level: 'red' | 'amber' | 'green'; text: string }[]; latest: string | null; runwayMonths: number | null; revenueGrowthPct: number | null }

const usd = (n: number) => '$' + (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : Math.round(n))
const pct = (n: number) => (n > 0 ? '+' : '') + n.toFixed(0) + '%'
const change = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null)

export function analyse(rows: MonthRow[], monthLabel: (p: string) => string): Analysis {
  const months = rows.filter((r) => Object.values(r.values).some((v) => v !== null)).sort((a, b) => a.period.localeCompare(b.period))
  const out: Analysis = { headline: [], flags: [], latest: null, runwayMonths: null, revenueGrowthPct: null }
  const cur = months[months.length - 1]
  if (!cur) { out.flags.push({ level: 'amber', text: 'No figures reported yet.' }); return out }
  const prev = months[months.length - 2]
  const prev2 = months[months.length - 3]
  const v = cur.values, p = prev?.values ?? {}
  out.latest = cur.period
  const rev = v.revenue, revG = change(rev, p.revenue)
  out.revenueGrowthPct = revG
  if (rev != null) out.headline.push('Revenue ' + usd(rev) + ' in ' + monthLabel(cur.period) + (revG != null ? ' (' + pct(revG) + ' on the month before)' : '') + '.')
  if (v.cash != null && v.net_burn != null) {
    if (v.net_burn <= 0) { out.headline.push('Cash-flow positive this month, with ' + usd(v.cash) + ' in the bank.'); out.flags.push({ level: 'green', text: 'Cash-flow positive.' }) }
    else {
      const runway = v.cash / v.net_burn
      out.runwayMonths = runway
      out.headline.push('Burning ' + usd(v.net_burn) + ' a month with ' + usd(v.cash) + ' in the bank: about ' + runway.toFixed(1) + ' months of runway.')
      if (runway < 6) out.flags.push({ level: 'red', text: 'Runway under 6 months (' + runway.toFixed(1) + '). Talk about fundraising or cutting burn now.' })
      else if (runway < 12) out.flags.push({ level: 'amber', text: 'Runway under 12 months (' + runway.toFixed(1) + '). The next raise should be in planning.' })
    }
  }
  const burnG = change(v.net_burn, p.net_burn)
  if (burnG != null && burnG > 30 && (v.net_burn ?? 0) > 0) out.flags.push({ level: 'amber', text: 'Burn up ' + burnG.toFixed(0) + '% on the month before.' })
  if (rev != null && p.revenue != null && prev2?.values.revenue != null && rev < p.revenue && p.revenue < prev2.values.revenue)
    out.flags.push({ level: 'red', text: 'Revenue has fallen two months in a row.' })
  else if (revG != null && revG >= 10) out.flags.push({ level: 'green', text: 'Revenue growing ' + revG.toFixed(0) + '% month on month.' })
  if (v.gross_margin != null) out.headline.push('Gross margin ' + v.gross_margin.toFixed(0) + '%.')
  if (v.customers != null) { const cg = change(v.customers, p.customers); out.headline.push(Math.round(v.customers) + ' paying customers' + (cg != null ? ' (' + pct(cg) + ')' : '') + '.') }
  if (v.headcount != null) out.headline.push('Team of ' + Math.round(v.headcount) + '.')
  const now = new Date(); const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
  if (cur.period < lastMonth) out.flags.push({ level: 'amber', text: 'No figures since ' + monthLabel(cur.period) + '.' })
  return out
}
