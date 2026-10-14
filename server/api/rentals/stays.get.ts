// Stays from the Airbnb calendars: who is in tonight, check-ins and check-outs coming up, and a 60-day timeline per
// room/unit. Guest names come from imported Airbnb rows with the same confirmation code (the calendar has none).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const units = await allUnits()
  const meta = new Map((await db().query<{ id: string; ical: boolean; synced: string | null }>("SELECT id, coalesce(ical_url, '') <> '' AS ical, ical_synced_at::text AS synced FROM rentals.units")).rows.map((r) => [r.id, r]))
  const rows = (await db().query<{ unit_id: string; starts: string; ends: string; kind: string; code: string | null; guest: string | null; payout: string | null }>(
    `SELECT c.unit_id, to_char(c.starts, 'YYYY-MM-DD') AS starts, to_char(c.ends, 'YYYY-MM-DD') AS ends, c.kind, c.confirmation_code AS code,
            (SELECT t.guest FROM rentals.transactions t WHERE t.confirmation_code = c.confirmation_code AND t.guest IS NOT NULL ORDER BY t.txn_date DESC LIMIT 1) AS guest,
            (SELECT sum(t.amount)::text FROM rentals.transactions t WHERE t.confirmation_code = c.confirmation_code AND t.type NOT ILIKE 'payout') AS payout
       FROM rentals.calendar c WHERE c.ends > current_date - 7 AND c.starts < current_date + 60 ORDER BY c.starts`)).rows
  const synced = [...meta.values()].map((m) => m.synced).filter(Boolean).sort().pop() ?? null
  return {
    today: new Date().toISOString().slice(0, 10), synced,
    units: units.map((u) => ({ id: u.id, name: u.name, property: u.property, ical: meta.get(u.id)?.ical ?? false })),
    stays: rows.map((r) => ({ ...r, payout: r.payout === null ? null : Number(r.payout) }))
  }
})
