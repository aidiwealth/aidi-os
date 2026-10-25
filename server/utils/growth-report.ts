// Banking and the Stage Monitor in the monthly management report (and so in what goes to investors from it): one
// section each, for the company the report is on or the whole group, in the report's currency. Built
// from the same views as the pages; a section is offered only when the plan has the module and there is data for it.
import type { H3Event } from 'h3'
import type { MSection, MTile, MTable } from './mgmt-report'
import type { ForecastScope } from './forecast-scope'
import { shortAmount } from '~/shared/compact'

export const GROWTH_SECTIONS: { key: string; module: string; title: string; desc: string }[] = [
  { key: 'banking', module: 'banking_treasury', title: 'Banking and spend', desc: 'Money in and out from the bank, spend by category against budget, the biggest payments and recurring costs' },
  { key: 'stage', module: 'stage_monitor', title: 'Stage and readiness', desc: 'Funding and revenue stage, health, runway, and equity and debt readiness (indicative only)' },
]

// The report's subject as the scope the Banking and Stage pages use: the group, or one of the company's own companies.
async function scopeOf(subject: string): Promise<ForecastScope | null> {
  const org = await currentOrg(); if (org?.kind !== 'company') return null
  const ents = await custEntities(), currency = await subjectCurrency(subject)
  if (subject === 'group') return { group: ents.length > 1, entity: ents.length > 1 ? null : ents.find((e) => e.main)?.id ?? null, name: org.name, currency, main: false, companies: ents }
  const id = subject.startsWith('entity:') ? subject.slice(7) : '', e = ents.find((x) => x.id === id)
  return e ? { group: false, entity: e.id, name: e.name, currency, main: e.main, companies: ents } : null
}

// Which of the two sections can go in: the module on the plan (and open to this person) and something to show.
export async function growthAvailable(event: H3Event, subject: string): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = { banking: false, stage: false }
  const sc = await scopeOf(subject).catch(() => null); if (!sc) return out
  const usable = await usableModules((event.context.user as SessionUser).roles, event)
  const ent = sc.group ? null : sc.entity, main = await companyEntityId()
  const n = async (sql: string, p: unknown[]) => ((await db().query<{ n: number }>(sql, p).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0)
  out.banking = usable.has('banking_treasury') && (await n('SELECT count(*)::int AS n FROM banking.ledger WHERE ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1)', [ent, main])) > 0
  out.stage = usable.has('stage_monitor')
  return out
}

const ML = (ym: string) => new Date(ym.slice(0, 7) + '-15T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export async function growthSections(event: H3Event, subject: string, keys: string[]): Promise<MSection[]> {
  const sc = await scopeOf(subject); if (!sc) return []
  const ok = await growthAvailable(event, subject), want = (k: string) => keys.includes(k) && ok[k]
  const cy = sc.currency, sym = cy === 'USD' ? '$' : cy === 'GBP' ? '£' : cy === 'EUR' ? '€' : cy === 'NGN' ? '₦' : cy + ' '
  const mo = (v: number | null | undefined) => (v === null || v === undefined ? '–' : shortAmount(v, sym))
  const gs = { group: sc.group, entity: sc.entity, currency: cy, companies: sc.companies }
  const who = sc.group ? 'Every company in the group' : sc.name
  const out: MSection[] = []

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
      const facts: [string, string][] = [['Funding stage', s.funding.label], ['Revenue stage', s.operating.label + (s.operating.arr_usd ? ', about $' + Math.round(s.operating.arr_usd).toLocaleString('en-US') + ' a year' : '') + '. ' + s.operating.note], ['Health', s.health.label],
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
