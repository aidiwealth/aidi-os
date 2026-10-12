// Tracker: put a filing or renewal on a client's compliance calendar (or edit / remove one), tied to a service from the
// price list. The date can be past (shows as overdue, or log it as already filed and set the next one) or future.
import { z } from 'zod'
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const CAT_FOR: Record<string, string> = { irs_annual: 'tax', de_franchise: 'franchise_tax', ca_state: 'annual_return', registered_agent: 'registered_agent', annual_report: 'annual_return', boi_report: 'regulatory', virtual_office: 'other' }
const Body = z.object({
  id: z.string().uuid().optional(), client_id: z.string().uuid().optional(), remove: z.boolean().default(false),
  service_code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional().or(z.literal('').transform(() => undefined)),
  title: z.string().trim().max(200).default(''), category: z.enum(CATEGORY_KEYS).optional(), recurrence: z.enum(RECURRENCES).optional(),
  next_due: D.optional(), reminder_days: z.coerce.number().int().min(0).max(120).default(30), notes: z.string().trim().max(3000).default(''),
  filed_on: D.optional().or(z.literal('').transform(() => undefined)), create_job: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the client, the service or a title, and the due date.')
  const d = b.data
  // Editing or removing an existing calendar item.
  if (d.id) {
    const o = (await asPlatform(() => db().query<{ org_id: string }>("SELECT o.organization_id AS org_id FROM compliance.obligations o JOIN core.organizations org ON org.id = o.organization_id AND org.kind = 'company' WHERE o.id = $1", [d.id]))).rows[0]
    if (!o) throw apiError('not_found', 'Not found', 404)
    if (d.remove) await asPlatform(() => db().query('UPDATE compliance.obligations SET active = false WHERE id = $1', [d.id]))
    else await asPlatform(() => db().query('UPDATE compliance.obligations SET title = coalesce(nullif($2, \'\'), title), next_due = coalesce($3::date, next_due), recurrence = coalesce($4, recurrence), reminder_days = $5, notes = coalesce(nullif($6, \'\'), notes), service_code = coalesce($7, service_code) WHERE id = $1',
      [d.id, d.title, d.next_due ?? null, d.recurrence ?? null, d.reminder_days, d.notes, d.service_code ?? null]))
    await audit({ event, actorUserId: user.userId, action: d.remove ? 'services.calendar_remove' : 'services.calendar_edit', objectType: 'obligation', objectId: d.id })
    return { ok: true }
  }
  if (!d.client_id || !d.next_due) throw apiError('invalid', 'Choose the client and the due date.')
  const svc = d.service_code ? (await db().query<{ name: string; billing: string }>('SELECT name, billing FROM services.catalog WHERE code = $1', [d.service_code])).rows[0] : undefined
  if (d.service_code && !svc) throw apiError('invalid', 'That service is not on the price list.')
  const title = d.title || svc?.name
  if (!title) throw apiError('invalid', 'Choose a service or type a title.')
  const recurrence = d.recurrence ?? (svc ? (svc.billing === 'monthly' ? 'monthly' : svc.billing === 'one_time' ? 'none' : 'annual') : 'annual')
  const category = d.category ?? (d.service_code && CAT_FOR[d.service_code]) ?? (/tax/i.test(title) ? 'tax' : 'other')
  const ws = await workspaceForClient(event, d.client_id) // quietly sets up their Finvry account if they have none yet
  const prev = currentOrgId()
  let id: string
  setOrgContext(ws.orgId)
  try {
    const ent = await companyEntityId()
    if (!ent) throw apiError('state', 'This client\'s Finvry account has no company record yet.')
    id = (await one<{ id: string }>('INSERT INTO compliance.obligations (entity_id, title, category, jurisdiction, recurrence, next_due, reminder_days, notes, service_code, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [ent, title, category, 'US', recurrence, d.next_due, d.reminder_days, d.notes || 'Added by the Finvry team.', d.service_code ?? null, user.userId])).id
    // Already filed for that date: log it and move the item to the next date.
    if (d.filed_on) {
      await db().query('INSERT INTO compliance.completions (obligation_id, due_date, completed_on, note, completed_by) VALUES ($1,$2,$3,$4,$5)', [id, d.next_due, d.filed_on, 'Filed by Finvry', user.userId])
      const next = rollForward(d.next_due, recurrence)
      if (next) await db().query('UPDATE compliance.obligations SET next_due = $2 WHERE id = $1', [id, next]); else await db().query('UPDATE compliance.obligations SET active = false WHERE id = $1', [id])
    }
  } finally { setOrgContext(prev) }
  let jobId: string | null = null
  if (d.create_job && !d.filed_on) {
    jobId = (await one<{ id: string }>("INSERT INTO services.jobs (client_id, service, title, description, status, due_date, codes, owner_id) VALUES ($1,$2,$3,$4,'new',$5,$6,$7) RETURNING id",
      [d.client_id, d.service_code ? mainService([d.service_code]) : 'annual_compliance', ('Filing: ' + title).slice(0, 200), 'Due ' + d.next_due + '. Added to the client\'s compliance calendar from the tracker.' + (d.notes ? '\n' + d.notes : ''), d.next_due, d.service_code ? [d.service_code] : null, user.userId])).id
  }
  await audit({ event, actorUserId: user.userId, action: 'services.calendar_add', objectType: 'obligation', objectId: id, detail: { client: d.client_id, service: d.service_code ?? null, due: d.next_due, filed_on: d.filed_on ?? null, job: jobId } })
  return { ok: true, id, job_id: jobId, workspace_created: ws.created }
})
