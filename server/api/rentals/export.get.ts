// P&L per property (or all, with one page per property) for a month or a year, as PDF or CSV (admins).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const q = getQuery(event)
  const period = String(q.period ?? '')
  if (!/^20\d{2}(-[01]\d)?$/.test(period)) throw apiError('invalid', 'Choose a month or a year.')
  const prop = /^[0-9a-f-]{36}$/.test(String(q.property ?? '')) ? String(q.property) : null
  const fmt = q.format === 'csv' ? 'csv' : 'pdf'
  const main = await pnl(period, prop)
  const name = 'Rental P&L ' + main.title.replace(/[^A-Za-z0-9 ]/g, '') + ' ' + period
  await audit({ event, actorUserId: user.userId, action: 'rentals.pnl_export', objectType: 'rental_pnl', detail: { period, property: prop, format: fmt } })
  if (fmt === 'csv') { setHeader(event, 'content-type', 'text/csv; charset=utf-8'); setHeader(event, 'content-disposition', 'attachment; filename="' + name + '.csv"'); return pnlCsv(main) }
  const list = [main]
  if (!prop) for (const p of (await db().query<{ id: string }>('SELECT id FROM rentals.properties WHERE active ORDER BY sort, name')).rows) list.push(await pnl(period, p.id))
  const ent = (await db().query<{ name: string }>('SELECT name FROM core.entities WHERE id = $1', [await havenEntityId()])).rows[0]?.name ?? 'Aidi Haven LLC'
  const bytes = await pnlPdf(list, ent)
  setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'content-disposition', 'attachment; filename="' + name + '.pdf"')
  return Buffer.from(bytes)
})
