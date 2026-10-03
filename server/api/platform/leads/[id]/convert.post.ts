// Turn a lead into a customer: create its workspace, invite its admin, mark the lead won and link them.
import { z } from 'zod'
const Body = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), plan_code: z.string().min(1), status: z.enum(['trial', 'active']),
  trial_days: z.coerce.number().int().min(1).max(90).default(14), admin_name: z.string().trim().min(1).max(200), admin_email: z.string().trim().email().max(254)
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Add the link name, plan and the first admin.')
  const lead = (await asPlatform(() => db().query<{ company: string; kind: string; stage: string; organization_id: string | null }>('SELECT company, kind, stage, organization_id FROM platform.leads WHERE id = $1', [id.data]))).rows[0]
  if (!lead) throw apiError('not_found', 'Lead not found', 404)
  if (lead.organization_id) throw apiError('converted', 'This lead already has a workspace.')
  const r = await createWorkspace(event, staff.userId, { name: lead.company, kind: lead.kind, ...b.data })
  await asPlatform(async () => {
    await db().query("UPDATE platform.leads SET organization_id = $2, stage = 'won', stage_changed_at = CASE WHEN stage = 'won' THEN stage_changed_at ELSE now() END, plan_code = $3, updated_at = now() WHERE id = $1", [id.data, r.id, b.data.plan_code])
    await db().query("INSERT INTO platform.lead_events (lead_id, kind, body, from_stage, to_stage, created_by) VALUES ($1, 'converted', $2, $3, 'won', $4)", [id.data, 'Workspace created (' + b.data.status + ')', lead.stage, staff.userId])
  })
  return { ok: true, organization_id: r.id, emailed: r.emailed }
})
