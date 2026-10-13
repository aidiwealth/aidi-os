// Overview: per property (and per room/unit) this month's income, expenses, profit, occupancy, nightly rate and
// rating, each against last month; 12 months of income vs expenses; "Needs attention" and recent activity.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  await ensureRentCharges(); await reconcile()
  const latest = (await db().query<{ p: string | null }>("SELECT to_char(max(txn_date), 'YYYY-MM') AS p FROM rentals.transactions")).rows[0]?.p
  const q = String(getQuery(event).period ?? '')
  const period = /^20\d{2}-[01]\d$/.test(q) ? q : latest ?? new Date().toISOString().slice(0, 7)
  const props = (await db().query<{ id: string; name: string; address: string | null; kind: string; image_url: string | null }>('SELECT id, name, address, kind, image_url FROM rentals.properties WHERE active ORDER BY sort, name')).rows
  const units = await allUnits()
  const meta = new Map((await db().query<{ id: string; rating: string | null; review_count: number | null; image_url: string | null; title: string | null }>('SELECT id, rating::text, review_count, image_url, title FROM rentals.units')).rows.map((u) => [u.id, u]))
  const figs = async (p: string) => {
    const f = await unitFigures(p), ex = await expensesBy(p)
    // Property or combined: all its expenses. One room/unit: its own expenses plus an equal share of shared ones.
    const out = (ids: string[], propIds: string[], unit = false) => {
      const xs = ids.map((i) => f.get(i)).filter(Boolean) as UnitMonth[]
      const unitsOf = (pid: string) => units.filter((u) => u.property_id === pid).length || 1
      let expenses = 0
      for (const e of ex) { if (!propIds.includes(e.property_id)) continue; if (!unit) expenses += e.v; else if (e.unit_id) { if (ids.includes(e.unit_id)) expenses += e.v } else expenses += e.v / unitsOf(e.property_id) }
      const income = xs.reduce((s, x) => s + x.income, 0), gross = xs.reduce((s, x) => s + x.gross, 0), nights = xs.reduce((s, x) => s + x.nights, 0), cap = xs.reduce((s, x) => s + x.days, 0)
      return { income: Math.round(income * 100) / 100, expenses: Math.round(expenses * 100) / 100, profit: Math.round((income - expenses) * 100) / 100, occupancy: cap ? Math.round(nights / cap * 1000) / 10 : null, nights, adr: nights ? Math.round(gross / nights * 100) / 100 : null }
    }
    return { out, f }
  }
  const cur = await figs(period), prev = await figs(prevPeriod(period))
  const allIds = units.map((u) => u.id), allProps = props.map((p) => p.id)
  const rating = (ids: string[]) => { const r = ids.map((i) => meta.get(i)).filter((m) => m?.rating); const n = r.reduce((s, m) => s + (m!.review_count ?? 0), 0); return r.length ? { rating: Math.round(r.reduce((s, m) => s + Number(m!.rating) * (m!.review_count || 1), 0) / r.reduce((s, m) => s + (m!.review_count || 1), 0) * 100) / 100, reviews: n } : null }
  const property = props.map((p) => { const ids = units.filter((u) => u.property_id === p.id).map((u) => u.id)
    return { ...p, now: cur.out(ids, [p.id]), before: prev.out(ids, [p.id]), rating: rating(ids),
      units: units.filter((u) => u.property_id === p.id).map((u) => ({ id: u.id, name: u.name, title: meta.get(u.id)?.title ?? u.title, rental_model: u.rental_model, source: u.source, listing: u.airbnb_listing_id, image_url: meta.get(u.id)?.image_url ?? null, now: cur.out([u.id], [p.id], true), before: prev.out([u.id], [p.id], true), rating: rating([u.id]), nights_source: cur.f.get(u.id)?.nights_source ?? 'bookings' })) } })
  const total = { now: cur.out(allIds, allProps), before: prev.out(allIds, allProps), rating: rating(allIds) }
  // 12 months: income vs expenses.
  const chart: { period: string; income: number; expenses: number }[] = []
  let p = period; for (let i = 0; i < 12; i++) { const f = await unitFigures(p); const ex = await expensesBy(p); chart.unshift({ period: p, income: Math.round([...f.values()].reduce((s, x) => s + x.income, 0) * 100) / 100, expenses: Math.round(ex.reduce((s, e) => s + e.v, 0) * 100) / 100 }); p = prevPeriod(p) }
  // Needs attention.
  const att: { kind: string; text: string; to: string }[] = []
  const late = (await db().query<{ payout_ref: string; paid_out: string; arrive: string }>(`SELECT payout_ref, paid_out::text, to_char(coalesce(expected_arrival, txn_date), 'YYYY-MM-DD') AS arrive FROM rentals.transactions t WHERE type ILIKE 'payout' AND coalesce(expected_arrival, txn_date) < current_date - 5
      AND NOT EXISTS (SELECT 1 FROM rentals.payout_matches m WHERE m.payout_ref = t.payout_ref) ORDER BY txn_date DESC LIMIT 20`)).rows
  if (late.length > 2) att.push({ kind: 'payout', text: late.length + ' Airbnb payouts ($' + late.reduce((s, l) => s + Number(l.paid_out), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ') are not found in the bank yet. Upload the bank statement for the account ending 5526 under Bank & cash, or match them under Money.', to: '/rentals?t=money&period=' + late[0]!.arrive.slice(0, 7) })
  else for (const l of late) att.push({ kind: 'payout', text: 'Airbnb payout $' + Number(l.paid_out).toFixed(2) + ' (' + l.payout_ref + ') was due in the bank by ' + l.arrive + ' and is not matched yet', to: '/rentals?t=money&period=' + l.arrive.slice(0, 7) })
  const rent = (await db().query<{ tenant_name: string; unit: string; due_on: string; amount: string; paid_amount: string | null }>("SELECT l.tenant_name, u.name AS unit, to_char(c.due_on, 'YYYY-MM-DD') AS due_on, c.amount::text, c.paid_amount::text FROM rentals.rent_charges c JOIN rentals.leases l ON l.id = c.lease_id JOIN rentals.units u ON u.id = l.unit_id WHERE c.due_on < current_date AND coalesce(c.paid_amount, 0) < c.amount ORDER BY c.due_on")).rows
  for (const r of rent) att.push({ kind: 'rent', text: 'Rent ' + (r.paid_amount ? 'part-paid' : 'not recorded') + ': ' + r.tenant_name + ' · ' + r.unit + ' · $' + Number(r.amount).toFixed(2) + ' due ' + r.due_on, to: '/rentals?t=money&period=' + r.due_on.slice(0, 7) })
  const um = (await db().query<{ listing: string; n: number }>("SELECT listing, count(*)::int AS n FROM rentals.transactions WHERE unit_id IS NULL AND type NOT ILIKE 'payout' AND listing IS NOT NULL GROUP BY listing")).rows
  for (const u of um) att.push({ kind: 'listing', text: u.n + ' Airbnb row(s) for "' + u.listing + '" are not linked to a unit', to: '/rentals?t=properties' })
  const fails = (await db().query<{ period: string; checks: { ok: boolean; label: string; detail: string }[] }>("SELECT period, checks FROM rentals.imports WHERE status = 'saved' AND checks @> '[{\"ok\": false}]' AND saved_at > now() - interval '120 days' ORDER BY saved_at DESC LIMIT 5")).rows
  for (const f of fails) for (const c of f.checks.filter((x) => !x.ok)) att.push({ kind: 'import', text: (f.period ? monthLabel(f.period) + ' import · ' : '') + c.label + ': ' + c.detail, to: '/rentals?t=money&period=' + (f.period ?? '') })
  const activity = (await db().query("SELECT event, detail, created_at FROM rentals.activity ORDER BY created_at DESC LIMIT 12")).rows
  const periods = (await db().query<{ p: string }>("SELECT DISTINCT to_char(txn_date, 'YYYY-MM') AS p FROM rentals.transactions UNION SELECT DISTINCT to_char(spent_on, 'YYYY-MM') FROM rentals.expenses ORDER BY 1 DESC")).rows.map((r) => r.p)
  const user = await requireUser(event)
  return { period, label: monthLabel(period), properties: property, total, chart, attention: att, activity, periods, admin: isRentalAdmin(user.roles), locked: (await lockedPeriods()).has(period) }
})
