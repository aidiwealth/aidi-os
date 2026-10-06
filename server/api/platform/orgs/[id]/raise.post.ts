// Console: switch managed fundraising on or off for a customer workspace and set the success fee.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ enabled: z.boolean(), fee_pct: z.number().min(0).max(30).default(4) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('raise_enabled', $2::boolean, 'raise_fee_pct', $3::numeric) WHERE id = $1 AND kind = 'company'", [id.data, b.data.enabled, b.data.fee_pct]))
  if (b.data.enabled) {
    const c = await clientForWorkspace(id.data)
    const op = await operatorOrgId()
    await asPlatform(() => db().query('INSERT INTO services.raise_programs (organization_id, client_id, workspace_id, fee_pct) VALUES ($1,$2,$3,$4) ON CONFLICT (client_id) DO UPDATE SET fee_pct = EXCLUDED.fee_pct, workspace_id = EXCLUDED.workspace_id', [op, c.id, id.data, b.data.fee_pct]))
  }
  await audit({ event, actorUserId: staff.userId, action: 'platform.raise_' + (b.data.enabled ? 'on' : 'off'), objectType: 'organization', objectId: id.data, detail: { fee_pct: b.data.fee_pct } })
  return { ok: true }
})
