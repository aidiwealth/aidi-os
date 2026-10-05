// Tracker actions on a client's filing: email them a reminder, open a job for it, or mark it filed.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const b = z.object({ obligation_id: z.string().uuid(), action: z.enum(['remind', 'job', 'done']), note: z.string().max(2000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const o = (await asPlatform(() => db().query<{ id: string; title: string; next_due: string; days_left: number; recurrence: string; org_id: string; company: string; client_id: string }>(
    `SELECT o.id, o.title, to_char(o.next_due, 'YYYY-MM-DD') AS next_due, (o.next_due - current_date)::int AS days_left, o.recurrence, org.id AS org_id, org.name AS company, c.id AS client_id FROM compliance.obligations o
      JOIN core.organizations org ON org.id = o.organization_id AND org.kind = 'company' JOIN services.clients c ON c.workspace_id = org.id WHERE o.id = $1`, [b.data.obligation_id]))).rows[0]
  if (!o) throw apiError('not_found', 'Not found', 404)
  if (b.data.action === 'job') {
    const j = await one<{ id: string }>("INSERT INTO services.jobs (client_id, service, title, description, status) VALUES ($1,'annual_compliance',$2,$3,'new') RETURNING id", [o.client_id, ('Filing: ' + o.title).slice(0, 200), 'Due ' + o.next_due + '. Opened from the compliance tracker.' + (b.data.note ? '\n' + b.data.note : '')])
    await audit({ event, actorUserId: user.userId, action: 'services.tracker_job', objectType: 'job', objectId: j.id })
    return { ok: true, job_id: j.id }
  }
  if (b.data.action === 'remind') {
    const prev = currentOrgId(); setOrgContext(o.org_id)
    let sent = 0
    try { for (const to of await orgNotifyEmails()) { try { await sendComplianceDigest(to, [{ id: o.id, title: o.title, entity: o.company, next_due: o.next_due, days_left: o.days_left, kind: o.days_left < 0 ? 'overdue' : 'upcoming' }]); sent++ } catch (err) { console.error('[tracker] remind failed', err) } } } finally { setOrgContext(prev) }
    await audit({ event, actorUserId: user.userId, action: 'services.tracker_remind', objectType: 'obligation', objectId: o.id, detail: { sent } })
    return { ok: true, sent }
  }
  const next = rollForward(o.next_due, o.recurrence)
  await asPlatform(async () => {
    await db().query('INSERT INTO compliance.completions (organization_id, obligation_id, due_date, completed_on, note, completed_by) VALUES ($1,$2,$3,current_date,$4,$5)', [o.org_id, o.id, o.next_due, ('Filed by Aidi' + (b.data.note ? ': ' + b.data.note : '')).slice(0, 2000), user.userId])
    if (next) await db().query('UPDATE compliance.obligations SET next_due = $2 WHERE id = $1', [o.id, next]); else await db().query('UPDATE compliance.obligations SET active = false WHERE id = $1', [o.id])
  })
  await audit({ event, actorUserId: user.userId, action: 'services.tracker_done', objectType: 'obligation', objectId: o.id })
  return { ok: true }
})
