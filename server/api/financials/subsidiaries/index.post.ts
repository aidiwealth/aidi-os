// Add a subsidiary with its own Financials (paid plans): a name, its currency and, optionally, its country.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('invalid', 'Subsidiaries are for company workspaces.')
  if (org.plan_code !== 'company_scale') throw apiError('paid', 'Subsidiaries are part of the Scale plan.', 402)
  const b = z.object({ name: z.string().trim().min(2).max(120), currency: z.string().regex(/^[A-Z]{3}$/), country: z.string().trim().max(60).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the subsidiary a name and a currency.')
  const main = await companyEntityId()
  if (!main) throw apiError('invalid', 'Set up your company first.')
  const n = (await db().query<{ n: number }>("SELECT count(*)::int AS n FROM core.entities WHERE kind = 'operating' AND parent_id IS NOT NULL")).rows[0]!.n
  if (n >= 25) throw apiError('limit', 'Up to 25 subsidiaries.', 422)
  const dup = await db().query('SELECT 1 FROM core.entities WHERE lower(name) = lower($1)', [b.data.name])
  if (dup.rowCount) throw apiError('taken', 'You already have an entity with that name.', 409)
  const id = (await one<{ id: string }>("INSERT INTO core.entities (name, kind, parent_id, jurisdiction, currency) VALUES ($1, 'operating', $2, $3, $4) RETURNING id", [b.data.name, main, b.data.country || null, b.data.currency])).id
  await audit({ event, actorUserId: user.userId, action: 'financials.subsidiary_add', objectType: 'entity', objectId: id, detail: { name: b.data.name } })
  return { ok: true, id, subject: 'entity:' + id }
})
