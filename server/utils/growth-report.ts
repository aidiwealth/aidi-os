// Sales, Marketing, Banking and the Stage Monitor in the monthly management report (and so in what goes to investors
// from it): one section each, for the company the report is on or the whole group, in the report's currency. Built
// from the same views as the pages; a section is offered only when the plan has the module and there is data for it.
import type { H3Event } from 'h3'
import type { MSection, MTile, MTable } from './mgmt-report'
import type { ForecastScope } from './forecast-scope'
import { shortAmount } from '~/shared/compact'

export const GROWTH_SECTIONS: { key: string; module: string; title: string; desc: string }[] = [
  { key: 'sales', module: 'sales', title: 'Sales pipeline', desc: 'Open pipeline, expected wins, win rate and cycle by process, the pipeline by stage and won by month' },
  { key: 'marketing', module: 'marketing', title: 'Marketing', desc: 'Spend, leads, new customers, cost per lead and CAC by channel over the last three full months, and live campaigns' },
  { key: 'banking', module: 'banking_treasury', title: 'Banking and spend', desc: 'Money in and out from the bank, spend by category against budget, the biggest payments and recurring costs' },
  { key: 'stage', module: 'stage_monitor', title: 'Stage and readiness', desc: 'Funding and operating stage, health, runway, and equity and debt readiness (indicative only)' },
]

// The report's subject as the scope the Growth pages use: the group, or one of the company's own companies.
async function scopeOf(subject: string): Promise<ForecastScope | null> {
  const org = await currentOrg(); if (org?.kind !== 'company') return null
  const ents = await custEntities(), currency = await subjectCurrency(subject)
  if (subject === 'group') return { group: ents.length > 1, entity: ents.length > 1 ? null : ents.find((e) => e.main)?.id ?? null, name: org.name, currency, main: false, companies: ents }
  const id = subject.startsWith('entity:') ? subject.slice(7) : '', e = ents.find((x) => x.id === id)
  return e ? { group: false, entity: e.id, name: e.name, currency, main: e.main, companies: ents } : null
}

// Which of the four sections can go in: the module on the plan (and open to this person) and something to show.
export async function growthAvailable(event: H3Event, subject: string): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = { sales: false, marketing: false, banking: false, stage: false }
  const sc = await scopeOf(subject).catch(() => null); if (!sc) return out
  const usable = await usableModules((event.context.user as SessionUser).roles, event)
  const ent = sc.group ? null : sc.entity, main = await companyEntityId()
  const n = async (sql: string, p: unknown[]) => ((await db().query<{ n: number }>(sql, p).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0)
  const procs = (k: string) => n('SELECT count(*)::int AS n FROM growth.processes WHERE kind = $1 AND ($2::uuid IS NULL OR entity_id IS NULL OR entity_id = $2)', [k, ent])
  out.sales = usable.has('sales') && (await procs('sales')) > 0
  out.marketing = usable.has('marketing') && (await procs('marketing')) > 0
  out.banking = usable.has('banking_treasury') && (await n('SELECT count(*)::int AS n FROM banking.ledger WHERE ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1)', [ent, main])) > 0
  out.stage = usable.has('stage_monitor')
  return out
}

const ML = (ym: string) => new Date(ym.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const pc = (v: number | null | undefined) => (v === null || v === undefined ? '–' : String(v).replace(/\.0$/, '') + '%')
const int = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Math.round(v).toLocaleString('en-US'))

export async function growthSections(event: H3Event, subject: string, keys: string[]): Promise<MSection[]> {
  const sc = await scopeOf(subject); if (!sc) return []
  const ok = await growthAvailable(event, subject), want = (k: string) => keys.includes(k) && ok[k]
  const cy = sc.currency, sym = cy === 'USD' ? '$' : cy === 'GBP' ? '£' : cy === 'EUR' ? '€' : cy === 'NGN' ? '₦' : cy + ' '
  const mo = (v: number | null | undefined) => (v === null || v === undefined ? '–' : shortAmount(v, sym))
  const rateOf = async (c: string) => (c === cy ? 1 : (await fxRate(c, cy)) ?? 0)
  const gs = { group: sc.group, entity: sc.entity, currency: cy, companies: sc.companies }
  const who = sc.group ? 'Every company in the group' : sc.name
  const out: MSection[] = []
  const today = new Date().toISOString().slice(0, 10)

  if (want('sales')) {
    const first = await salesView(undefined, gs)
    let open = 0, weighted = 0, won90 = 0, wonN = 0, lostN = 0, wonV = 0, existing = 0; const byM: Record<string, number> = {}
    const rows: MTable['rows'] = []; let biggest: { v: Awaited<ReturnType<typeof salesView>>; k: number; open: number } | null = null
    for (const x of first.processes) {
      const v = await salesView(x.id, gs); if (!v.process || !v.stats) continue
      const st = v.stats, k = await rateOf(v.process.currency), wonKey = v.process.stages.find((s) => s.kind === 'won')?.key
      const w90 = v.deals.filter((d) => d.stage_key === wonKey && d.closed_at && Date.now() - new Date(d.closed_at).getTime() < 90 * 86400000).reduce((t, d) => t + (d.value ?? 0), 0)
      existing += ((v.split?.expansion ?? 0) + (v.split?.renewal ?? 0)) * k
      open += st.open_value * k; weighted += st.weighted * k; won90 += w90 * k; wonN += st.won; lostN += st.lost; wonV += (st.avg_won ?? 0) * st.won * k
      for (const [m, val] of Object.entries(st.won_value_month)) byM[m] = (byM[m] ?? 0) + val * k
      rows.push({ label: x.name + (sc.group ? ' · ' + x.company : ''), cells: [int(st.stages.filter((s) => s.kind === 'open').reduce((t, s) => t + s.now, 0)), mo(st.open_value * k), mo(st.weighted * k), mo(w90 * k), pc(st.win_rate), st.cycle_days === null ? '–' : st.cycle_days + ' days'] })
      if (!biggest || st.open_value * k > biggest.open) biggest = { v, k, open: st.open_value * k }
    }
    const tiles: MTile[] = [{ label: 'Open pipeline', value: mo(open), sub: existing ? mo(existing) + ' from existing customers' : undefined }, { label: 'Expected to close', value: mo(weighted), sub: 'Each deal at its stage\'s chance' }, { label: 'Won, last 90 days', value: mo(won90) },
      { label: 'Win rate', value: wonN + lostN ? pc(Math.round(wonN / (wonN + lostN) * 1000) / 10) : '–', sub: wonN + ' won · ' + lostN + ' lost' }, { label: 'Average deal won', value: wonN ? mo(wonV / wonN) : '–' }]
    const tables: MTable[] = [{ title: 'By sales process', head: ['', 'Open deals', 'Open pipeline', 'Expected', 'Won, 90 days', 'Win rate', 'Cycle'], rows: rows.length > 1 ? [...rows, { label: 'Total', kind: 'total', cells: ['', mo(open), mo(weighted), mo(won90), '', ''] }] : rows }]
    if (biggest?.v.stats && biggest.v.process) {
      const b = biggest.v
      tables.push({ title: 'Pipeline by stage · ' + b.process!.name, head: ['', 'Deals now', 'Value now', 'Moving on', 'Target'], rows: b.stats!.stages.filter((s) => s.kind === 'open').map((s) => ({ label: s.name, cells: [int(s.now), mo(s.value_now * biggest!.k), pc(s.actual_pct), pc(s.target_pct)] })) })
    }
    const ms = Array.from({ length: 12 }, (_, i) => { const d = new Date(today.slice(0, 7) + '-15T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 11 + i); return d.toISOString().slice(0, 7) })
    const bullets = first.processes.length ? (await Promise.all(first.processes.map(async (x) => { const v = await salesView(x.id, gs); return v.stats?.to_target?.note ? { text: (first.processes.length > 1 ? x.name + ': ' : '') + v.stats.to_target.note } : null }))).filter((x): x is { text: string } => !!x) : []
    out.push({ key: 'sales', title: 'Sales pipeline', intro: who + ', from deals in Sales as at ' + today + '. Amounts in ' + cy + '.', tiles, tables, charts: Object.keys(byM).length ? [{ title: 'Won by month', labels: ms.map(ML), values: ms.map((m) => Math.round(byM[m] ?? 0)) }] : undefined, bullets: bullets.length ? bullets : undefined })
  }

  if (want('marketing')) {
    const first = await marketingView(undefined, 7, gs)
    let spend = 0, leads = 0, cust = 0, rev = 0; const rows: MTable['rows'] = [], camps: MTable['rows'] = []
    for (const x of first.processes) {
      const v = await marketingView(x.id, 7, gs); if (!v.process || !v.stats) continue
      const k = await rateOf(v.process.currency), pre = first.processes.length > 1 ? x.name + ' · ' : ''
      spend += v.stats.totals.spend * k; leads += v.stats.totals.leads; cust += v.stats.totals.customers; rev += v.stats.totals.revenue * k
      for (const c of v.stats.channels.filter((c) => c.spend || c.leads || c.customers)) rows.push({ label: pre + c.name, cells: [mo(c.spend * k), int(c.leads), c.cpl === null ? '–' : mo(c.cpl * k), int(c.customers), c.cac === null ? '–' : mo(c.cac * k), c.roi === null ? '–' : pc(c.roi)] })
      for (const c of (v.campaigns as { name: string; status: string; budget: number | null; spend: number | null; leads: number | null; customers: number | null }[]).filter((c) => c.status !== 'done').slice(0, 6)) camps.push({ label: pre + c.name, cells: [c.status === 'live' ? 'Live' : 'Planned', c.budget === null ? '–' : mo(c.budget * k), c.spend === null ? '–' : mo(c.spend * k), int(c.leads), int(c.customers)] })
    }
    out.push({ key: 'marketing', title: 'Marketing', intro: who + ', the last three full months. Spend comes from the bank where channels are linked to vendors; customers and revenue from won deals. Amounts in ' + cy + '.',
      tiles: [{ label: 'Spend', value: mo(spend) }, { label: 'Leads', value: int(leads), sub: leads ? mo(spend / leads) + ' a lead' : undefined }, { label: 'New customers', value: int(cust), sub: cust ? mo(spend / cust) + ' to acquire each' : undefined }, { label: 'Revenue from them', value: mo(rev) }],
      tables: [...(rows.length ? [{ title: 'By channel', head: ['', 'Spend', 'Leads', 'Cost a lead', 'Customers', 'CAC', 'Return'], rows }] : []), ...(camps.length ? [{ title: 'Campaigns live and planned', head: ['', 'Status', 'Budget', 'Spent', 'Leads', 'Customers'], rows: camps }] : [])] })
  }

  if (want('banking')) {
    const t = await treasuryView(gs), lm = t.last_month ? t.months.find((m) => m.month === t.last_month) : null
    const ms = t.months.slice(-12)
    const bullets: { text: string; tone?: 'good' | 'watch' | 'risk' }[] = []
    if (t.marked_monthly) bullets.push({ text: 'Savings flagged on the cut list (cuts, downgrades, personal spend): ' + mo(t.marked_monthly) + ' a month' + (typeof t.runway_if_cut === 'number' ? ', taking runway to about ' + t.runway_if_cut + ' months.' : t.runway_if_cut ? ', which ends the burn.' : '.'), tone: 'good' })
    // Months the founder reconciled (bank against Financials) for this company or the group.
    const recd = (await db().query<{ month: string }>("SELECT month FROM banking.reconciled WHERE scope = $1 ORDER BY month DESC LIMIT 12", [sc.group ? 'group' : sc.entity ?? 'group']).catch(() => ({ rows: [] }))).rows.map((r) => r.month).reverse()
    if (recd.length) bullets.push({ text: 'Bank reconciled to Financials (month-end cash checked) for ' + recd.map(ML).join(', ') + '.', tone: 'good' })
    for (const d of t.duplicates.slice(0, 3)) bullets.push({ text: 'Several tools for ' + d.job + ': ' + d.vendors.map((v) => v.name + ' (' + mo(v.monthly) + ')').join(', ') + '.', tone: 'watch' })
    for (const c of t.by_category.filter((c) => c.budget !== null && c.last > (c.budget ?? 0) * 1.1).slice(0, 3)) bullets.push({ text: c.label + ' spend of ' + mo(c.last) + ' is over its ' + mo(c.budget) + ' monthly budget.', tone: 'risk' })
    out.push({ key: 'banking', title: 'Banking and spend', intro: who + ', from the bank ledger (' + t.ledger.count.toLocaleString('en-US') + ' transactions' + (t.ledger.since ? ' since ' + ML(t.ledger.since) : '') + '; transfers between your own accounts left out). Latest full month ' + (t.last_month ? ML(t.last_month) : '–') + '. Amounts in ' + cy + '.',
      tiles: [{ label: 'Money in', value: mo(lm?.in ?? null) }, { label: 'Money out', value: mo(lm?.out ?? null) }, { label: 'Recurring payments', value: mo(t.recurring_total), sub: 'A month' }, { label: 'Runway', value: t.runway === null ? '–' : t.runway + ' months', sub: 'Same basis as Financials' }],
      charts: ms.length ? [{ title: 'Money out by month', labels: ms.map((m) => ML(m.month)), values: ms.map((m) => Math.round(m.out)) }] : undefined,
      tables: [{ title: 'Spend by category', head: ['', t.last_month ? ML(t.last_month) : 'Last month', t.prev_month ? ML(t.prev_month) : 'Month before', '3-month average', 'Budget'], rows: t.by_category.filter((c) => c.avg3 || c.last).slice(0, 8).map((c) => ({ label: c.label, cells: [mo(c.last), mo(c.prev), mo(c.avg3), c.budget === null ? '–' : mo(c.budget)] })) },
        { title: 'Biggest payees', head: ['', 'Category', 'Last month', '12 months', 'Recurring'], rows: t.top_vendors.slice(0, 8).map((v) => ({ label: v.name, cells: [v.category, mo(v.last), mo(v.total), v.recurring ? 'Yes' : ''] })) }],
      bullets: bullets.length ? bullets : undefined })
  }

  if (want('stage')) {
    const s = await stageMonitor(event, sc).catch(() => null)
    if (s) {
      const facts: [string, string][] = [['Funding stage', s.funding.label], ['Operating stage', s.operating.label + (s.operating.arr_usd ? ' (about $' + Math.round(s.operating.arr_usd).toLocaleString('en-US') + ' a year)' : '')], ['Health', s.health.label],
        ['Runway', s.runway.months === null ? '–' : s.runway.months + ' months' + (s.runway.cash_out ? ', to ' + ML(s.runway.cash_out) : '')]]
      if (s.alive?.cross) facts.push(['Revenue overtakes costs', ML(s.alive.cross) + ' at today\'s trends'])
      if (s.equity) facts.push(['Equity readiness', s.equity.total + ' / 100 · ' + s.equity.likelihood])
      if (s.debt) facts.push(['Debt readiness', s.debt.total + ' / 100 · ' + s.debt.likelihood])
      out.push({ key: 'stage', title: 'Stage and readiness', intro: 'Indicative only — not a valuation, credit decision or investment advice. Worked out from the figures, bank and cap table.', facts,
        bullets: [{ text: s.health.note }, ...s.moves.map((m) => ({ text: m.of + ' readiness: ' + m.fix + ' (up to +' + m.gain + ' points)' }))] })
    }
  }
  return out
}
