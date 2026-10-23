// Carries out an action the AI analyst proposed, after the person clicked it. Everything is checked again here with
// their own access (module on, role allowed, record theirs); the model's say-so counts for nothing.
import { z } from 'zod'
import { ACTION_KINDS, type ActionKind } from '~/server/utils/analyst-tools'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await rateLimit('ai_act', user.userId, 60, 60 * 60 * 1000)
  const b = z.object({ kind: z.enum(Object.keys(ACTION_KINDS) as [ActionKind, ...ActionKind[]]), args: z.record(z.string(), z.unknown()) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'That action is not available.')
  const spec = ACTION_KINDS[b.data.kind]
  await requireRole(event, ...spec.roles)
  await requireModule(event, spec.module)
  // The module as this person may use it now (the admin's role choices on the Modules page, and company limits).
  if (!(await usableModules(user.roles, event)).has(spec.module)) throw apiError('forbidden', 'You do not have access to this.', 403)
  const g = b.data.args
  if (b.data.kind === 'secondary_status') {
    const v = z.object({ id: z.string().uuid(), status: z.enum(['new', 'reviewing', 'interested', 'passed', 'expired']) }).safeParse(g)
    if (!v.success) throw apiError('invalid', 'That action is not valid any more.')
    const r = await db().query<{ company: string | null; title: string }>("UPDATE wm.secondaries SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1 AND status <> 'invested' RETURNING company, title", [v.data.id, v.data.status, user.userId])
    if (!r.rowCount) throw apiError('not_found', 'That opportunity was not found, or it is already invested.', 404)
    await audit({ event, actorUserId: user.userId, action: 'secondaries.status_via_ai', objectType: 'secondary', objectId: v.data.id, detail: { status: v.data.status } })
    return { ok: true, message: (r.rows[0]!.company || r.rows[0]!.title) + ' is now ' + v.data.status + '.' }
  }
  if (b.data.kind === 'add_contact') {
    const v = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254), firm: z.string().trim().max(200).nullable().optional(), list: z.string().trim().max(80).nullable().optional() }).safeParse(g)
    if (!v.success) throw apiError('invalid', 'A contact needs a name and a valid email.')
    const id = (await one<{ id: string }>('INSERT INTO crm.contacts (name, email, firm) VALUES ($1, $2, $3) ON CONFLICT (organization_id, email) DO UPDATE SET firm = coalesce(crm.contacts.firm, EXCLUDED.firm) RETURNING id', [v.data.name, v.data.email.toLowerCase(), v.data.firm || null])).id
    let list = ''
    if (v.data.list) {
      const l = (await db().query<{ id: string; name: string }>('SELECT id, name FROM crm.lists WHERE lower(name) = lower($1)', [v.data.list])).rows[0]
      if (l) { await db().query('INSERT INTO crm.list_members (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [l.id, id]); list = ' and on ' + l.name }
    }
    await audit({ event, actorUserId: user.userId, action: 'crm.contact_via_ai', objectType: 'contact', objectId: id })
    return { ok: true, message: v.data.name + ' is in Contacts' + list + '.' }
  }
  const v = z.object({ pipeline_id: z.string().uuid(), investor: z.string().trim().min(1).max(200), amount: z.number().min(0).nullable().optional(), stage: z.string().trim().max(60).nullable().optional() }).safeParse(g)
  if (!v.success) throw apiError('invalid', 'That action is not valid any more.')
  const st = (await db().query<{ id: string; name: string }>('SELECT id, name FROM crm.stages WHERE pipeline_id = $1 ORDER BY (lower(name) = lower(coalesce($2, \'\'))) DESC, sort LIMIT 1', [v.data.pipeline_id, v.data.stage ?? null])).rows[0]
  if (!st) throw apiError('not_found', 'That pipeline was not found.', 404)
  if ((await db().query('SELECT 1 FROM crm.deals WHERE pipeline_id = $1 AND lower(investor) = lower($2)', [v.data.pipeline_id, v.data.investor])).rowCount) return { ok: true, message: v.data.investor + ' is already in that pipeline.' }
  const id = (await one<{ id: string }>('INSERT INTO crm.deals (pipeline_id, stage_id, investor, amount) VALUES ($1, $2, $3, $4) RETURNING id', [v.data.pipeline_id, st.id, v.data.investor, v.data.amount ?? null])).id
  await noteInvestor((await currentOrg())!.id, v.data.investor)
  await audit({ event, actorUserId: user.userId, action: 'crm.deal_via_ai', objectType: 'crm_deal', objectId: id })
  return { ok: true, message: v.data.investor + ' added to the pipeline (' + st.name + ').' }
})
