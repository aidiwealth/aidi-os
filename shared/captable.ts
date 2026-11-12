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
  const live = t.convertibles.map((c) => {
    const years = Math.max(0, monthsBetween(c.issued_on, r.on) / 12)
    return { c, amount: c.kind === 'note' && c.interest_pct ? c.amount * (1 + c.interest_pct / 100 * years) : c.amount }
  })
  // Solved directly rather than by repeated guessing (which ran away when the SAFEs were large next to the pre-money).
  // In pre-money value: a post-money SAFE at its cap owns amount / cap of the shares before the new money; one
  // converting at the round price (less any discount) takes amount / (1 - discount) of the pre-money's value; a
  // pre-money cap gives a fixed number of shares. The pool top-up is a share of the post-money shares.
  const solve = (pre: number) => {
    let topup = 0, out = { preShares: 0, price: 0, newShares: 0, F: 0, conv: [] as Converted[] }
    for (let k = 0; k < 40; k++) {
      let F = 0, fixed = 0
      const pick = live.map(({ c, amount }) => {
        const disc = c.discount_pct ? c.discount_pct / 100 : 0
        const roundVal = pre * (1 - disc)
        if (c.valuation_cap && c.post_money && c.valuation_cap <= roundVal) { F += amount / c.valuation_cap; return { c, amount, m: 'cap' as const } }
        if (c.valuation_cap && !c.post_money) {
          const capShares = amount * fd0 / c.valuation_cap
          // A pre-money cap converts at cap / fd0; use it when that is cheaper than the round price.
          if (out.preShares && c.valuation_cap / Math.max(1, fd0) <= roundVal / out.preShares) { fixed += capShares; return { c, amount, m: 'cap' as const } }
          if (!out.preShares) { fixed += capShares; return { c, amount, m: 'cap' as const } }
        }
        F += pre > 0 ? amount / roundVal : Infinity; return { c, amount, m: (disc ? 'discount' : 'round') as 'discount' | 'round' }
      })
      if (!(F < 1)) return { ...out, F, ok: false, topup }
      const preShares = (fd0 + topup + fixed) / (1 - F)
      const price = pre / preShares, newShares = r.new_money / price, post = preShares + newShares
      const nextTop = Math.max(0, r.pool_target_pct / 100 * post - t.pool)
      const conv = pick.map(({ c, amount, m }) => {
        const p = m === 'cap' ? (c.post_money ? c.valuation_cap! / preShares : c.valuation_cap! / Math.max(1, fd0)) : price * (1 - (m === 'discount' ? c.discount_pct! / 100 : 0))
        return { conv: c, holder: d.holders.find((h) => h.id === c.holder_id)?.name ?? 'Investor', price: p, shares: amount / p, method: m, amount }
      })
      const done = Math.abs(nextTop - topup) < 0.5 && Math.abs(preShares - out.preShares) < 0.5
      out = { preShares, price, newShares, F, conv }; topup = nextTop
      if (done) break
    }
    return { ...out, ok: out.preShares > 0 && Number.isFinite(out.preShares), topup }
  }
  const s = solve(r.pre_money)
  // When the SAFEs and notes would take the whole company, say so and find the lowest pre-money that works.
  let min_pre: number | null = null
  if (!s.ok || s.F > 0.97) { let lo = Math.max(1, r.pre_money), hi = Math.max(lo * 2, 1e6); for (let k = 0; k < 40 && solve(hi).F >= 0.9; k++) hi *= 2; for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (solve(mid).F < 0.9) hi = mid; else lo = mid } min_pre = Math.ceil(hi / 1e5) * 1e5 }
  if (!s.ok) return { price: 0, pre_shares: 0, post_shares: 0, post_money: r.pre_money + r.new_money, new_shares: 0, topup: 0, conversions: [] as Converted[], rows: [], fd0, blocked: true, min_pre, safe_total: live.reduce((a, x) => a + x.amount, 0) }
  const conv = s.conv, topup = s.topup, newShares = s.newShares
  const pre = s.preShares, post = pre + newShares
  const rows = t.rows.map((x) => ({ name: x.holder.name, kind: x.holder.kind, before: x.fd, before_pct: fd0 ? x.fd / fd0 * 100 : 0, after: x.fd + conv.filter((c) => c.conv.holder_id === x.holder.id).reduce((a, c) => a + c.shares, 0) }))
  const inRows = new Set(t.rows.map((x) => x.holder.id)), extra = new Map<string, { name: string; kind: string; before: number; before_pct: number; after: number }>()
  for (const c of conv) if (!inRows.has(c.conv.holder_id)) { const e = extra.get(c.conv.holder_id); if (e) e.after += c.shares; else extra.set(c.conv.holder_id, { name: c.holder, kind: 'investor', before: 0, before_pct: 0, after: c.shares }) }
  rows.push(...extra.values())
  rows.push({ name: r.investor || 'New investors', kind: 'new', before: 0, before_pct: 0, after: newShares })
  rows.push({ name: 'Option pool (available)', kind: 'pool', before: t.pool, before_pct: fd0 ? t.pool / fd0 * 100 : 0, after: t.pool + topup })
  return { price: s.price, pre_shares: pre, post_shares: post, post_money: r.pre_money + r.new_money, new_shares: newShares, topup, conversions: conv, rows: rows.map((x) => ({ ...x, after_pct: post ? x.after / post * 100 : 0 })).sort((a, b) => b.after - a.after), fd0, blocked: false, min_pre, safe_total: live.reduce((a, x) => a + x.amount, 0) }
}

// Exit waterfall: preferred classes by seniority take their preference (multiple x money invested), unless converting
// to common pays more; participating preferred also share in the rest. Options count as common (exercise price ignored).
export function waterfall(d: Data, exit: number, today: string, extraCommon = 0) {
  const t = table(d, today)
  const commonShares = t.issued + t.granted + extraCommon - d.issuances.filter((i) => d.classes.find((c) => c.id === i.class_id)?.kind === 'preferred').reduce((s, i) => s + i.shares, 0)
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

// What each holder receives at an exit: preferred classes by their share of the class, common and exercised shares at
// the common price, options at the price less their strike, and SAFEs / notes either paid back (cash-out) or converted
// at their cap or discount, whichever is worth more to them (converted ones dilute common, and the choice is settled
// over a few passes). Estimates for planning; the documents decide.
export function exitByHolder(d: Data, exit: number, today: string): { rows: { holder: string; amount: number; how: string }[]; per_common: number; exit: number } {
  const prefIds = new Set(d.classes.filter((c) => c.kind === 'preferred').map((c) => c.id))
  const t = table(d, today)
  const capBase = Math.max(1, t.issued + t.granted)
  const open = d.convertibles.filter((c) => c.status === 'outstanding')
  // A post-money SAFE owns amount / cap of the company once the SAFEs convert, so its price is the cap spread over
  // the shares there will be then (subtracting the SAFE money from the cap broke down once it was larger than a cap).
  const postS = open.filter((c) => c.kind === 'safe' && c.post_money && c.valuation_cap).reduce((s, c) => s + c.amount / c.valuation_cap!, 0)
  const liqCap = capBase / Math.max(0.05, 1 - Math.min(0.95, postS))
  let wf = waterfall(d, exit, today), per = wf.per_common
  let plan = open.map((c) => ({ c, shares: 0, cash: true }))
  for (let pass = 0; pass < 6; pass++) {
    plan = open.map((c) => {
      const capPrice = c.valuation_cap ? c.valuation_cap / (c.post_money ? liqCap : capBase) : null
      const discPrice = c.discount_pct && per > 0 ? per * (1 - c.discount_pct / 100) : null
      const price = [capPrice, discPrice].filter((x): x is number => !!x && x > 0).reduce((m, x) => Math.min(m, x), Infinity)
      const shares = Number.isFinite(price) ? c.amount / price : 0
      return { c, shares, cash: shares * per <= c.amount }
    })
    const cashOut = plan.filter((p) => p.cash).reduce((s, p) => s + p.c.amount, 0)
    // Options under water take nothing, so they leave the common count.
    const underwater = d.grants.reduce((s, g) => s + ((g.strike ?? 0) >= per ? Math.max(0, liveShares(g, today) - (g.exercised ?? 0)) : 0), 0)
    const extra = plan.filter((p) => !p.cash).reduce((s, p) => s + p.shares, 0) - underwater
    const next = waterfall(d, Math.max(0, exit - cashOut), today, extra)
    const done = Math.abs(next.per_common - per) < 1e-9
    wf = next; per = next.per_common
    if (done) break
  }
  const cashOut = plan.filter((p) => p.cash).reduce((s, p) => s + p.c.amount, 0)
  const scale = exit > 0 && cashOut > exit ? exit / cashOut : 1 // not enough to pay every SAFE back: pro rata
  const by = new Map<string, { amount: number; how: Set<string> }>()
  const add = (hid: string, v: number, how: string) => { if (!v) return; const x = by.get(hid) ?? { amount: 0, how: new Set<string>() }; x.amount += v; x.how.add(how); by.set(hid, x) }
  for (const c of d.classes.filter((c) => prefIds.has(c.id))) {
    const iss = d.issuances.filter((i) => i.class_id === c.id), tot = iss.reduce((s, i) => s + i.shares, 0), amt = wf.rows.find((r) => r.name === c.name)?.amount ?? 0
    for (const i of iss) add(i.holder_id, tot ? amt * i.shares / tot : 0, c.name)
  }
  for (const i of d.issuances.filter((i) => !prefIds.has(i.class_id))) add(i.holder_id, i.shares * per, 'common')
  for (const g of d.grants) { const live = Math.max(0, liveShares(g, today) - (g.exercised ?? 0)); add(g.holder_id, live * Math.max(0, per - (g.strike ?? 0)), 'options') }
  for (const p of plan) add(p.c.holder_id, p.cash ? p.c.amount * scale : p.shares * per, p.cash ? (p.c.kind === 'note' ? 'note repaid' : 'SAFE cash-out') : (p.c.kind === 'note' ? 'note converted' : 'SAFE converted'))
  const name = (id: string) => d.holders.find((h) => h.id === id)?.name ?? 'Holder'
  return { rows: [...by.entries()].map(([id, x]) => ({ holder: name(id), amount: x.amount, how: [...x.how].join(' + ') })).sort((a, b) => b.amount - a.amount), per_common: per, exit }
}
