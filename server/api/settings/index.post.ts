import { z } from 'zod'
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  investor_name: z.string().trim().max(200).optional(),
  thesis: z.string().trim().max(6000).optional(),
  notify_emails: z.array(z.string().trim().email().max(254)).max(10),
  default_vehicle_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the name and email addresses.')
  const d = b.data
  if (d.default_vehicle_id && !(await db().query('SELECT 1 FROM core.entities WHERE id = $1', [d.default_vehicle_id])).rowCount) throw apiError('invalid', 'Choose one of your entities as the default vehicle.')
  const patch = { investor_name: d.investor_name || null, thesis: d.thesis || null, notify_emails: d.notify_emails.map((x) => x.toLowerCase()), default_vehicle_id: d.default_vehicle_id ?? null }
  await db().query('UPDATE core.organizations SET name = $1, settings = settings || $2::jsonb WHERE id = core.current_org()', [d.name, JSON.stringify(patch)])
  await audit({ event, actorUserId: user.userId, action: 'settings.update', objectType: 'organization', objectId: user.orgId ?? undefined, detail: { name: d.name, notify: patch.notify_emails.length } })
  return { ok: true }
})
