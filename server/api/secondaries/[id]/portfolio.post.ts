// A secondary we invested in becomes a portfolio company of one of our funds (or is linked to one that exists).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await requireModule(event, 'portfolio')
  const id = getRouterParam(event, 'id')
  const b = z.object({ existing_id: z.string().uuid().optional(), holding_entity_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200).optional(),
    founder_name: z.string().trim().max(200).optional(), founder_email: z.string().trim().email().max(254).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the company, founder name and a valid founder email.')
  const d = b.data
  const s = (await db().query<{ company: string | null; title: string }>('SELECT company, title FROM wm.secondaries WHERE id = $1', [id])).rows[0]
  if (!s) throw apiError('not_found', 'Not found', 404)
  let pc = d.existing_id
  if (pc) { if (!(await db().query('SELECT 1 FROM portfolio.companies WHERE id = $1', [pc])).rowCount) throw apiError('not_found', 'That portfolio company was not found.', 404) }
  else {
    if (!d.founder_name || !d.founder_email || !d.holding_entity_id) throw apiError('invalid', 'Choose the fund and add the founder name and email.')
    await assertFund(d.holding_entity_id)
    pc = (await one<{ id: string }>("INSERT INTO portfolio.companies (name, founder_name, founder_email, created_by, relationship, holding_entity_id) VALUES ($1,$2,$3,$4,'investment',$5) RETURNING id",
      [(d.name || s.company || s.title).slice(0, 200), d.founder_name, d.founder_email.toLowerCase(), user.userId, d.holding_entity_id])).id
    await audit({ event, actorUserId: user.userId, action: 'portfolio.add', objectType: 'company', objectId: pc, detail: { from: 'secondaries', secondary: id } })
  }
  await db().query('UPDATE wm.secondaries SET portfolio_company_id = $2, company = coalesce(company, (SELECT name FROM portfolio.companies WHERE id = $2)), updated_at = now() WHERE id = $1', [id, pc])
  return { ok: true, id: pc }
})
