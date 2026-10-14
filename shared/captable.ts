// Cap table maths for Finvry (browser and server): holdings, vesting, a priced round with SAFE / note conversion and
// an option-pool top-up, and a simple exit waterfall. Estimates for planning; the legal documents decide.
export interface Cls { id: string; name: string; kind: 'common' | 'preferred'; liq_pref: number; participating: boolean; seniority: number }
export interface Holder { id: string; name: string; kind: string }
export interface Issuance { id: string; holder_id: string; class_id: string; shares: number; price: number | null; issued_on: string }
export interface Plan { id: string; name: string; reserved: number }
export interface Grant { id: string; plan_id: string; holder_id: string; shares: number; strike: number | null; granted_on: string; vest_start: string; vest_months: number; cliff_months: number; exercised: number; cancelled_on: string | null }
export interface Conv { id: string; holder_id: string; kind: 'safe' | 'note'; amount: number; currency: string; valuation_cap: number | null; discount_pct: number | null; post_money: boolean; mfn: boolean; interest_pct: number | null; issued_on: string; status: string }
export interface Data { classes: Cls[]; holders: Holder[]; issuances: Issuance[]; plans: Plan[]; grants: Grant[]; convertibles: Conv[] }

const monthsBetween = (a: string, b: string) => { const x = new Date(a + 'T00:00:00Z'), y = new Date(b + 'T00:00:00Z'); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) - (y.getUTCDate() < x.getUTCDate() ? 1 : 0) }
// Shares vested on a date: nothing before the cliff, then monthly to the end of the schedule.
export function vested(g: Grant, on: string): number {
  if (g.cancelled_on && g.cancelled_on <= on) on = g.cancelled_on
  const m = monthsBetween(g.vest_start, on)
  if (g.vest_months === 0) return g.shares
  if (m < g.cliff_months || m < 0) return 0
  return Math.min(g.shares, Math.floor(g.shares * Math.min(m, g.vest_months) / g.vest_months))
}
// A cancelled grant keeps only what had vested; the rest goes back to the pool.
export const liveShares = (g: Grant, today: string) => (g.cancelled_on ? vested(g, today) : g.shares)

export interface Row { holder: Holder; byClass: Record<string, number>; issued: number; options: number; vestedOptions: number; fd: number; pctIssued: number; pctFd: number }
export function table(d: Data, today: string) {
  const issued = d.issuances.reduce((s, i) => s + i.shares, 0)
  const granted = d.grants.reduce((s, g) => s + liveShares(g, today) - g.exercised, 0)
  const reserved = d.plans.reduce((s, p) => s + p.reserved, 0)
  const allocated = d.grants.reduce((s, g) => s + liveShares(g, today), 0)
  const pool = Math.max(0, reserved - allocated)
  const fd = issued + granted + pool
  const rows: Row[] = d.holders.map((h) => {
    const byClass: Record<string, number> = {}
    for (const i of d.issuances.filter((x) => x.holder_id === h.id)) byClass[i.class_id] = (byClass[i.class_id] ?? 0) + i.shares
    const own = Object.values(byClass).reduce((s, v) => s + v, 0)
    const gs = d.grants.filter((g) => g.holder_id === h.id)
    const opts = gs.reduce((s, g) => s + liveShares(g, today) - g.exercised, 0), vOpts = gs.reduce((s, g) => s + Math.max(0, vested(g, today) - g.exercised), 0)
    return { holder: h, byClass, issued: own, options: opts, vestedOptions: vOpts, fd: own + opts, pctIssued: issued ? own / issued * 100 : 0, pctFd: fd ? (own + opts) / fd * 100 : 0 }
  }).filter((r) => r.fd > 0 || d.convertibles.some((c) => c.holder_id === r.holder.id)).sort((a, b) => b.fd - a.fd)
  const outstanding = d.convertibles.filter((c) => c.status === 'outstanding')
  return { rows, issued, granted, reserved, allocated, pool, fd, convertibles: outstanding, convertibleTotal: outstanding.reduce((s, c) => s + c.amount, 0) }
}

export interface RoundIn { pre_money: number; new_money: number; pool_target_pct: number; on: string; investor: string }
export interface Converted { conv: Conv; holder: string; price: number; shares: number; method: 'cap' | 'discount' | 'round'; amount: number }
// Priced round: SAFEs, notes and the option-pool top-up all come out of the pre-money (the usual term sheet), solved
// by iteration. Post-money SAFEs convert at cap / (company capitalisation incl. converting SAFEs and the new pool);
// pre-money SAFEs at cap / today's fully diluted shares; both get the discount price if that is lower.
export function round(d: Data, r: RoundIn, today: string) {
  const t = table(d, today)
  const fd0 = t.fd
  let topup = 0, safeShares = 0, price = 0, newShares = 0, conv: Converted[] = []
  for (let k = 0; k < 60; k++) {
    const pre = fd0 + topup + safeShares
    price = r.pre_money / Math.max(1, pre)
    newShares = r.new_money / price
    const post = pre + newShares
    topup = Math.max(0, r.pool_target_pct / 100 * post - t.pool)
    const capBase = fd0 + topup + safeShares
    conv = t.convertibles.map((c) => {
      const years = Math.max(0, monthsBetween(c.issued_on, r.on) / 12)
      const amount = c.kind === 'note' && c.interest_pct ? c.amount * (1 + c.interest_pct / 100 * years) : c.amount
      const cands: { m: 'cap' | 'discount' | 'round'; p: number }[] = [{ m: 'round', p: price }]
      if (c.valuation_cap) cands.push({ m: 'cap', p: c.valuation_cap / Math.max(1, c.post_money ? capBase : fd0) })
      if (c.discount_pct) cands.push({ m: 'discount', p: price * (1 - c.discount_pct / 100) })
      const best = cands.reduce((a, b) => (b.p < a.p ? b : a))
      return { conv: c, holder: d.holders.find((h) => h.id === c.holder_id)?.name ?? 'Investor', price: best.p, shares: amount / best.p, method: best.m, amount }
    })
    const next = conv.reduce((s, c) => s + c.shares, 0)
    if (Math.abs(next - safeShares) < 0.5) { safeShares = next; break }
    safeShares = next
  }
  const pre = fd0 + topup + safeShares, post = pre + newShares
  const rows = t.rows.map((x) => ({ name: x.holder.name, kind: x.holder.kind, before: x.fd, before_pct: fd0 ? x.fd / fd0 * 100 : 0, after: x.fd + conv.filter((c) => c.conv.holder_id === x.holder.id).reduce((s, c) => s + c.shares, 0) }))
  for (const c of conv) if (!rows.some((x) => x.name === c.holder)) rows.push({ name: c.holder, kind: 'investor', before: 0, before_pct: 0, after: c.shares })
  rows.push({ name: r.investor || 'New investors', kind: 'new', before: 0, before_pct: 0, after: newShares })
  rows.push({ name: 'Option pool (available)', kind: 'pool', before: t.pool, before_pct: fd0 ? t.pool / fd0 * 100 : 0, after: t.pool + topup })
  return { price, pre_shares: pre, post_shares: post, post_money: r.pre_money + r.new_money, new_shares: newShares, topup, conversions: conv, rows: rows.map((x) => ({ ...x, after_pct: post ? x.after / post * 100 : 0 })).sort((a, b) => b.after - a.after), fd0 }
}

// Exit waterfall: preferred classes by seniority take their preference (multiple x money invested), unless converting
// to common pays more; participating preferred also share in the rest. Options count as common (exercise price ignored).
export function waterfall(d: Data, exit: number, today: string) {
  const t = table(d, today)
  const commonShares = t.issued + t.granted - d.issuances.filter((i) => d.classes.find((c) => c.id === i.class_id)?.kind === 'preferred').reduce((s, i) => s + i.shares, 0)
  const prefs = d.classes.filter((c) => c.kind === 'preferred').map((c) => { const iss = d.issuances.filter((i) => i.class_id === c.id); return { c, shares: iss.reduce((s, i) => s + i.shares, 0), invested: iss.reduce((s, i) => s + i.shares * (i.price ?? 0), 0) } }).filter((p) => p.shares > 0)
  const convert = new Set<string>()
  let result: { name: string; amount: number; how: string }[] = []
  for (let k = 0; k <= prefs.length; k++) {
    let left = exit; const out: { name: string; amount: number; how: string }[] = []
    const takers = prefs.filter((p) => !convert.has(p.c.id)).sort((a, b) => b.c.seniority - a.c.seniority)
    for (const p of takers) { const pay = Math.min(left, p.invested * p.c.liq_pref); left -= pay; out.push({ name: p.c.name, amount: pay, how: 'preference' }) }
    const partShares = commonShares + prefs.filter((p) => convert.has(p.c.id) || p.c.participating).reduce((s, p) => s + p.shares, 0)
    const perShare = partShares ? left / partShares : 0
    for (const p of prefs) if (convert.has(p.c.id) || p.c.participating) { const o = out.find((x) => x.name === p.c.name); const add = p.shares * perShare; if (o) { o.amount += add; o.how = 'preference + participation' } else out.push({ name: p.c.name, amount: add, how: 'converted to common' }) }
    out.push({ name: 'Common and options', amount: commonShares * perShare, how: 'pro rata' })
    result = out
    // Any non-participating class better off converting? Convert the one with the biggest gain and run again.
    const gain = prefs.filter((p) => !convert.has(p.c.id) && !p.c.participating).map((p) => ({ p, g: p.shares * (left / Math.max(1, partShares + p.shares)) - (out.find((x) => x.name === p.c.name)?.amount ?? 0) })).filter((x) => x.g > 0).sort((a, b) => b.g - a.g)[0]
    if (!gain) break
    convert.add(gain.p.c.id)
  }
  return { rows: result, per_common: commonShares ? (result.find((x) => x.name === 'Common and options')?.amount ?? 0) / commonShares : 0 }
}
