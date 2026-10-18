// Add a category to the chart of accounts (from a sheet's row, or by hand).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ name: z.string().trim().min(1).max(80), parent: z.string().max(40).default('') }).safeParse(await readBody(event))
  if (!b.success || (b.data.parent && !LINE_KEYS.includes(b.data.parent))) throw apiError('invalid', 'Name the category and choose the line it belongs to.')
  const name = b.data.name.replace(/\s+/g, ' ')
  const ex = (await db().query<{ id: string; name: string; parent: string }>('SELECT id, name, parent FROM financials.accounts WHERE lower(name) = lower($1)', [name])).rows[0]
  if (ex) return { ok: true, ...ex, to: 'cat:' + ex.parent + ':' + ex.name, existed: true }
  const r = await one<{ id: string }>('INSERT INTO financials.accounts (name, parent) VALUES ($1, $2) RETURNING id', [name, b.data.parent])
  await audit({ event, actorUserId: user.userId, action: 'financials.account_add', objectType: 'account', objectId: r.id, detail: { name, parent: b.data.parent } })
  return { ok: true, id: r.id, name, parent: b.data.parent, to: 'cat:' + b.data.parent + ':' + name, existed: false }
})
