// Change a customer's name, plan, status or trial end. Logged in their audit trail.
import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  plan_code: z.string().min(1).optional(),
  status: z.enum(ORG_STATUSES).optional(),
  trial_ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
})
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Check the values.')
  const d = b.data
  await asPlatform(async () => {
    const cur = await db().query<{ plan_code: string; status: string }>('SELECT plan_code, status FROM core.organizations WHERE id = $1', [id.data])
    if (!cur.rows[0]) throw apiError('not_found', 'Not found', 404)
    if (cur.rows[0].plan_code === 'internal' && d.status && d.status !== 'active') throw apiError('internal', 'Aidi workspaces cannot be suspended here.')
    if (d.plan_code && !(await db().query('SELECT 1 FROM core.plans WHERE code = $1', [d.plan_code])).rowCount) throw apiError('invalid', 'Unknown plan.')
    await db().query(
      `UPDATE core.organizations SET name = coalesce($2, name), plan_code = coalesce($3, plan_code), status = coalesce($4, status),
              trial_ends_at = CASE WHEN $6 THEN $5::date::timestamptz ELSE trial_ends_at END WHERE id = $1`,
      [id.data, d.name ?? null, d.plan_code ?? null, d.status ?? null, d.trial_ends_at ?? null, d.trial_ends_at !== undefined])
    if (d.status === 'suspended' || d.status === 'closed') await db().query("UPDATE core.sessions SET revoked_at = now(), revoked_reason = 'workspace ' || $2 WHERE organization_id = $1 AND revoked_at IS NULL", [id.data, d.status])
  })
  clearModuleCache()
  await platformAudit(event, staff.userId, 'workspace_update', id.data, d)
  return { ok: true }
})
