// A contact: details, lists, pipelines they are in, activity (for the engagement chart), notes and what was shared.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query<{ email: string }>('SELECT id, name, email, firm, title, phone, subscribed, custom, created_at FROM crm.contacts WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const lists = await db().query('SELECT l.id, l.name FROM crm.list_members m JOIN crm.lists l ON l.id = m.list_id WHERE m.contact_id = $1 ORDER BY l.name', [id.data])
  const deals = await db().query('SELECT d.id, d.investor, d.amount::float, p.id AS pipeline_id, p.name AS pipeline, p.currency, s.name AS stage, s.color FROM crm.deals d JOIN crm.pipelines p ON p.id = d.pipeline_id JOIN crm.stages s ON s.id = d.stage_id WHERE d.contact_id = $1 ORDER BY d.updated_at DESC', [id.data])
  const activity = await db().query('SELECT id, kind, label, ref_id, created_at FROM crm.activity WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 500', [id.data])
  const notes = await db().query('SELECT n.id, n.body, n.created_at, p.full_name AS by FROM crm.notes n LEFT JOIN core.users u ON u.id = n.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE n.contact_id = $1 ORDER BY n.created_at DESC', [id.data])
  const shared = await db().query(`SELECT u.id, u.title, s.sent_at, s.opened_at, s.opens FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id JOIN financials.updates u ON u.id = s.update_id WHERE i.email = $1 ORDER BY s.sent_at DESC`, [c.email])
  const fields = await db().query('SELECT key, label, type, options FROM crm.fields ORDER BY sort, label')
  const allLists = await db().query('SELECT id, name FROM crm.lists ORDER BY name')
  return { contact: c, lists: lists.rows, deals: deals.rows, activity: activity.rows, notes: notes.rows, shared: shared.rows, fields: fields.rows, allLists: allLists.rows }
})
