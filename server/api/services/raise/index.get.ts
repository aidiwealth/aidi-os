export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const rows = (await db().query<{ id: string }>('SELECT p.id FROM services.raise_programs p ORDER BY p.updated_at DESC')).rows
  const out = []
  for (const r of rows) { const v = await raiseView(r.id, false); if (v) out.push({ id: r.id, client: v.program.client, status: v.program.status, round: v.program.round, currency: v.program.currency, totals: v.totals, next: (v.meetings as { starts_at: string }[]).find((m) => new Date(m.starts_at) > new Date()) ?? null }) }
  return out
})
