// A pipeline: stages with totals, and its investors with their primary contact.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const p = (await db().query("SELECT id, name, currency, target::float, instrument, valuation_cap::float, discount::float, pre_money::float, status, to_char(target_close, 'YYYY-MM-DD') AS target_close FROM crm.pipelines WHERE id = $1", [id.data])).rows[0]
  if (!p) throw apiError('not_found', 'Not found', 404)
  const stages = await db().query('SELECT s.id, s.name, s.color, s.kind, s.sort, coalesce(sum(d.amount), 0)::float AS total, count(d.id)::int AS n FROM crm.stages s LEFT JOIN crm.deals d ON d.stage_id = s.id WHERE s.pipeline_id = $1 GROUP BY s.id ORDER BY s.sort', [id.data])
  const deals = await db().query('SELECT d.id, d.investor, d.stage_id, d.amount::float, d.notes, d.updated_at, c.id AS contact_id, c.name AS contact_name, c.email AS contact_email FROM crm.deals d LEFT JOIN crm.contacts c ON c.id = d.contact_id WHERE d.pipeline_id = $1 ORDER BY d.updated_at DESC', [id.data])
  const contacts = await db().query('SELECT id, name, email, firm FROM crm.contacts ORDER BY name LIMIT 2000')
  return { pipeline: p, stages: stages.rows, deals: deals.rows, contacts: contacts.rows }
})
