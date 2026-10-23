// Sales and marketing processes for Finvry companies: design the process (stages, target conversion, days, the steps
// that move a deal or lead on), run it (deals and campaigns), and predict from it (what the pipeline will close, what a
// target needs at the top of the funnel, what a budget buys). Pure functions shared by the server, pages and tests.

export interface Stage { key: string; name: string; kind: 'open' | 'won' | 'lost'; target_pct: number | null; days: number | null; steps: string[] }
export interface Channel { key: string; name: string; monthly_budget: number | null; vendor_keys: string[] }
export interface Process { id: string; kind: 'sales' | 'marketing'; name: string; currency: string; target_monthly: number | null; target_kind: 'revenue' | 'deals' | 'leads' | 'customers'; stages: Stage[]; channels: Channel[] }
export interface Deal { id: string; stage_key: string; value: number | null; recurring: boolean; created_at: string; closed_at: string | null; expected_close: string | null; source_channel: string | null; owner_id: string | null }
export interface Move { deal_id: string; from_stage: string | null; to_stage: string; at: string }

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'stage'
export const SALES_TEMPLATES: Record<string, { label: string; stages: Omit<Stage, 'key'>[] }> = {
  b2b: { label: 'B2B (demo-led)', stages: [
    { name: 'Lead', kind: 'open', target_pct: 40, days: 5, steps: ['Research the company and the buyer', 'First contact (email, call or LinkedIn)', 'Book a discovery call'] },
    { name: 'Qualified', kind: 'open', target_pct: 60, days: 7, steps: ['Confirm budget, authority, need and timing', 'Note the main problem in their words'] },
    { name: 'Demo', kind: 'open', target_pct: 50, days: 10, steps: ['Run the demo on their use case', 'Agree next steps and who else decides'] },
    { name: 'Proposal', kind: 'open', target_pct: 60, days: 14, steps: ['Send the proposal and pricing', 'Follow up within three days'] },
    { name: 'Negotiation', kind: 'open', target_pct: 70, days: 14, steps: ['Handle objections', 'Contract or order form sent for signature'] },
    { name: 'Won', kind: 'won', target_pct: null, days: null, steps: ['Hand over to onboarding', 'Invoice sent'] },
    { name: 'Lost', kind: 'lost', target_pct: null, days: null, steps: ['Record why it was lost'] }] },
  self_serve: { label: 'Self-serve / product-led', stages: [
    { name: 'Sign-up', kind: 'open', target_pct: 30, days: 3, steps: ['Welcome email', 'Check they reached the first key action'] },
    { name: 'Activated', kind: 'open', target_pct: 40, days: 14, steps: ['Nudge to invite their team', 'Offer a short call to accounts showing intent'] },
    { name: 'Trial / free plan', kind: 'open', target_pct: 25, days: 14, steps: ['Show the paid features they used', 'Send the upgrade offer before the trial ends'] },
    { name: 'Paying', kind: 'won', target_pct: null, days: null, steps: [] }, { name: 'Churned / not converted', kind: 'lost', target_pct: null, days: null, steps: ['Ask why (one question)'] }] },
  enterprise: { label: 'Enterprise / partnerships', stages: [
    { name: 'Target account', kind: 'open', target_pct: 30, days: 21, steps: ['Map decision makers', 'Warm introduction or tailored outreach'] },
    { name: 'First meeting', kind: 'open', target_pct: 50, days: 21, steps: ['Agree the problem and success measures'] },
    { name: 'Solution design / pilot', kind: 'open', target_pct: 50, days: 45, steps: ['Scope the pilot with success criteria', 'Security and compliance questions answered'] },
    { name: 'Commercials', kind: 'open', target_pct: 60, days: 30, steps: ['Pricing approved', 'Procurement and legal review'] },
    { name: 'Contract', kind: 'open', target_pct: 80, days: 21, steps: ['Contract signed'] },
    { name: 'Won', kind: 'won', target_pct: null, days: null, steps: ['Kick-off meeting'] }, { name: 'Lost', kind: 'lost', target_pct: null, days: null, steps: ['Record why it was lost'] }] } }
export const MARKETING_TEMPLATE: { stages: Omit<Stage, 'key'>[]; channels: Omit<Channel, 'key'>[] } = {
  stages: [
    { name: 'Visitors', kind: 'open', target_pct: 3, days: null, steps: ['Publish and promote content', 'Run ads to a focused landing page'] },
    { name: 'Leads', kind: 'open', target_pct: 30, days: 7, steps: ['Capture email with a clear offer', 'Send the welcome sequence'] },
    { name: 'Marketing qualified', kind: 'open', target_pct: 40, days: 7, steps: ['Score on fit and intent', 'Hand to sales within one working day'] },
    { name: 'Sales qualified', kind: 'open', target_pct: 25, days: 30, steps: ['Sales accepts the lead and books a call'] },
    { name: 'Customers', kind: 'won', target_pct: null, days: null, steps: [] }],
  channels: [{ name: 'Paid search', monthly_budget: null, vendor_keys: [] }, { name: 'Paid social', monthly_budget: null, vendor_keys: [] }, { name: 'Content and SEO', monthly_budget: null, vendor_keys: [] },
    { name: 'Referrals and partners', monthly_budget: null, vendor_keys: [] }, { name: 'Events', monthly_budget: null, vendor_keys: [] }, { name: 'Outbound', monthly_budget: null, vendor_keys: [] }] }
export const withKeys = <T extends { name: string }>(xs: T[]): (T & { key: string })[] => { const seen = new Set<string>(); return xs.map((x) => { let k = slug(x.name); while (seen.has(k)) k += '_2'; seen.add(k); return { ...x, key: k } }) }

const r1 = (n: number) => Math.round(n * 10) / 10
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000
// Actual conversion from each open stage to the next (deals that reached the stage and then went further), cycle time
// from creation to won, win rate, and average won value, over deals created in the window.
export interface StageStat { key: string; name: string; kind: Stage['kind']; reached: number; moved_on: number; now: number; value_now: number; actual_pct: number | null; target_pct: number | null; avg_days: number | null; target_days: number | null }
export interface SalesStats { stages: StageStat[]; won: number; lost: number; win_rate: number | null; avg_won: number | null; cycle_days: number | null; open_value: number; weighted: number; velocity_per_month: number | null; deals: number; won_value_month: Record<string, number>; to_target: { leads_needed: number | null; deals_needed: number | null; note: string } | null; forecast: { month: string; expected: number }[] }
export function salesStats(p: Process, deals: Deal[], moves: Move[], today = new Date().toISOString().slice(0, 10)): SalesStats {
  const order = p.stages.filter((s) => s.kind === 'open').map((s) => s.key), won = p.stages.find((s) => s.kind === 'won')?.key, lostKeys = new Set(p.stages.filter((s) => s.kind === 'lost').map((s) => s.key))
  const idx = (k: string) => (k === won ? order.length : order.indexOf(k))
  // The furthest stage each deal reached (its current stage, or further earlier on before it was lost).
  const byDeal = new Map<string, Move[]>(); for (const m of moves) (byDeal.get(m.deal_id) ?? byDeal.set(m.deal_id, []).get(m.deal_id)!).push(m)
  const furthest = new Map<string, number>(), entered = new Map<string, Record<string, string>>()
  for (const d of deals) {
    const ms = (byDeal.get(d.id) ?? []).sort((a, b) => (a.at < b.at ? -1 : 1))
    const start = ms[0]?.from_stage ?? d.stage_key, ent: Record<string, string> = { [start]: d.created_at }
    let f = lostKeys.has(start) ? -1 : idx(start)
    for (const m of ms) { if (!lostKeys.has(m.to_stage)) { f = Math.max(f, idx(m.to_stage)); ent[m.to_stage] ??= m.at } }
    furthest.set(d.id, f); entered.set(d.id, ent)
  }
  const wonDeals = deals.filter((d) => d.stage_key === won), lostDeals = deals.filter((d) => lostKeys.has(d.stage_key)), open = deals.filter((d) => order.includes(d.stage_key))
  const stages: StageStat[] = p.stages.map((s) => {
    const i = idx(s.key)
    const reached = s.kind === 'open' ? deals.filter((d) => (furthest.get(d.id) ?? -1) >= i).length : s.kind === 'won' ? wonDeals.length : lostDeals.filter((d) => d.stage_key === s.key).length
    const moved = s.kind === 'open' ? deals.filter((d) => (furthest.get(d.id) ?? -1) > i).length : 0
    const now = deals.filter((d) => d.stage_key === s.key)
    const dur: number[] = []
    if (s.kind === 'open') for (const d of deals) { const e = entered.get(d.id) ?? {}, a = e[s.key], nxt = order[i + 1] ?? won; const b = nxt ? e[nxt] : undefined; if (a && b) dur.push(daysBetween(a, b)) }
    // Deals still sitting in a stage count once they have been there longer than the stage usually takes.
    const decided = s.kind === 'open' ? moved + lostDeals.filter((d) => (furthest.get(d.id) ?? -1) === i).length : 0
    return { key: s.key, name: s.name, kind: s.kind, reached, moved_on: moved, now: now.length, value_now: now.reduce((t, d) => t + (d.value ?? 0), 0),
      actual_pct: s.kind === 'open' && decided >= 3 ? r1(moved / decided * 100) : null, target_pct: s.target_pct, avg_days: dur.length ? r1(dur.reduce((a, b) => a + b, 0) / dur.length) : null, target_days: s.days }
  })
  const pct = (st: StageStat) => (st.actual_pct ?? st.target_pct ?? 0) / 100
  const openStats = stages.filter((s) => s.kind === 'open')
  // Chance a deal in a stage is won: the conversion of that stage and every stage after it.
  const winFrom = (k: string) => openStats.slice(openStats.findIndex((s) => s.key === k)).reduce((t, s) => t * pct(s), 1)
  const decidedAll = wonDeals.length + lostDeals.length
  const winRate = decidedAll >= 3 ? wonDeals.length / decidedAll : openStats.length ? openStats.reduce((t, s) => t * pct(s), 1) : null
  const avgWon = wonDeals.length ? wonDeals.reduce((t, d) => t + (d.value ?? 0), 0) / wonDeals.length : null
  const cyc = wonDeals.filter((d) => d.closed_at).map((d) => daysBetween(d.created_at, d.closed_at!))
  const cycle = cyc.length ? r1(cyc.reduce((a, b) => a + b, 0) / cyc.length) : openStats.reduce((t, s) => t + (s.target_days ?? 0), 0) || null
  const openValue = open.reduce((t, d) => t + (d.value ?? 0), 0), weighted = open.reduce((t, d) => t + (d.value ?? 0) * winFrom(d.stage_key), 0)
  const velocity = cycle && winRate !== null && avgWon !== null ? open.length * winRate * avgWon / cycle * 30 : null
  const wm: Record<string, number> = {}; for (const d of wonDeals) { const m = (d.closed_at ?? d.created_at).slice(0, 7); wm[m] = (wm[m] ?? 0) + (d.value ?? 0) }
  // Expected wins by month: each open deal at its chance, in its expected close month (or after the cycle time).
  const fc: Record<string, number> = {}
  for (const d of open) { const m = d.expected_close ? d.expected_close.slice(0, 7) : (() => { const x = new Date(today); x.setDate(x.getDate() + Math.round(cycle ?? 30)); return x.toISOString().slice(0, 7) })(); const mm = m < today.slice(0, 7) ? today.slice(0, 7) : m; fc[mm] = (fc[mm] ?? 0) + (d.value ?? 0) * winFrom(d.stage_key) }
  const forecast = Object.keys(fc).sort().slice(0, 6).map((m) => ({ month: m, expected: Math.round(fc[m]!) }))
  // Working back from the monthly target: how many new deals (and leads at the first stage) it takes.
  let to: SalesStats['to_target'] = null
  if (p.target_monthly && winRate) {
    const deals_needed = p.target_kind === 'deals' || p.target_kind === 'customers' ? p.target_monthly : avgWon ? p.target_monthly / avgWon : null
    to = { deals_needed: deals_needed === null ? null : Math.ceil(deals_needed), leads_needed: deals_needed === null ? null : Math.ceil(deals_needed / winRate), note: deals_needed === null ? 'Win a few deals with values so the average deal size is known.' : 'At a ' + Math.round(winRate * 100) + '% win rate' + (avgWon ? ' and ' + Math.round(avgWon).toLocaleString('en-US') + ' average deal' : '') }
  }
  return { stages, won: wonDeals.length, lost: lostDeals.length, win_rate: winRate === null ? null : r1(winRate * 100), avg_won: avgWon === null ? null : Math.round(avgWon), cycle_days: cycle, open_value: Math.round(openValue), weighted: Math.round(weighted), velocity_per_month: velocity === null ? null : Math.round(velocity), deals: deals.length, won_value_month: wm, to_target: to, forecast }
}

// Marketing: by channel and month, from the figures entered (or spend from the bank ledger, customers and revenue from
// won deals sourced from the channel).
export interface ChannelMonth { channel_key: string; month: string; spend: number | null; visitors: number | null; leads: number | null; mqls: number | null; sqls: number | null; customers: number | null; revenue: number | null }
export interface ChannelStat { key: string; name: string; spend: number; leads: number; customers: number; revenue: number; cpl: number | null; cac: number | null; lead_to_customer: number | null; roi: number | null; budget: number | null }
export function marketingStats(p: Process, rows: ChannelMonth[], months: string[]) {
  const inM = rows.filter((r) => months.includes(r.month)), sum = (xs: ChannelMonth[], k: keyof ChannelMonth) => xs.reduce((t, r) => t + (Number(r[k]) || 0), 0)
  const channels: ChannelStat[] = p.channels.map((c) => {
    const xs = inM.filter((r) => r.channel_key === c.key), spend = sum(xs, 'spend'), leads = sum(xs, 'leads'), cust = sum(xs, 'customers'), rev = sum(xs, 'revenue')
    return { key: c.key, name: c.name, spend, leads, customers: cust, revenue: rev, cpl: leads ? Math.round(spend / leads) : null, cac: cust ? Math.round(spend / cust) : null, lead_to_customer: leads ? r1(cust / leads * 100) : null, roi: spend ? r1((rev - spend) / spend * 100) : null, budget: c.monthly_budget }
  })
  const tot = { spend: sum(inM, 'spend'), visitors: sum(inM, 'visitors'), leads: sum(inM, 'leads'), mqls: sum(inM, 'mqls'), sqls: sum(inM, 'sqls'), customers: sum(inM, 'customers'), revenue: sum(inM, 'revenue') }
  const funnel = [['Visitors', tot.visitors], ['Leads', tot.leads], ['Marketing qualified', tot.mqls], ['Sales qualified', tot.sqls], ['Customers', tot.customers]] as [string, number][]
  return { channels, totals: { ...tot, cpl: tot.leads ? Math.round(tot.spend / tot.leads) : null, cac: tot.customers ? Math.round(tot.spend / tot.customers) : null }, funnel: funnel.map(([n, v], i) => ({ name: n, value: v, conv: i && funnel[i - 1]![1] ? r1(v / funnel[i - 1]![1] * 100) : null })), months: months.length }
}
// What a monthly budget per channel should bring in, at each channel's own cost per lead and lead-to-customer rate (or
// the average across channels where a channel has too little history), with revenue at the average won deal.
export function predictBudget(stats: ChannelStat[], budget: Record<string, number>, months: number, avgDeal: number | null) {
  const cplAll = stats.reduce((t, c) => t + c.spend, 0) / Math.max(1, stats.reduce((t, c) => t + c.leads, 0)), convAll = stats.reduce((t, c) => t + c.customers, 0) / Math.max(1, stats.reduce((t, c) => t + c.leads, 0))
  const rows = stats.map((c) => {
    const b = budget[c.key] ?? 0, cpl = c.leads >= 10 && c.cpl ? c.cpl : cplAll || null, conv = c.leads >= 20 ? c.customers / c.leads : convAll
    const leads = cpl ? b / cpl : 0, customers = leads * conv
    return { key: c.key, name: c.name, budget: b, leads: Math.round(leads), customers: r1(customers), revenue: avgDeal ? Math.round(customers * avgDeal) : null, basis: c.leads >= 10 ? 'this channel' : 'all channels' }
  })
  void months
  return { rows, total: { budget: rows.reduce((t, r) => t + r.budget, 0), leads: rows.reduce((t, r) => t + r.leads, 0), customers: r1(rows.reduce((t, r) => t + r.customers, 0)), revenue: avgDeal ? rows.reduce((t, r) => t + (r.revenue ?? 0), 0) : null } }
}
