// Set the default registered agent and per-state agents (admins).
import { z } from 'zod'
import { US_STATES } from '~/shared/countries'
const Agent = z.object({ name: z.string().trim().max(200).default(''), address: z.string().trim().max(500).default('') })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = z.object({ default: Agent, states: z.record(z.string(), Agent).default({}) }).safeParse(await readBody(event))
  if (!b.success || !b.data.default.name) throw apiError('invalid', 'Enter the default registered agent.')
  const states: Record<string, { name: string; address: string }> = {}
  for (const [k, v] of Object.entries(b.data.states)) if (US_STATES.includes(k) && v.name) states[k] = v
  const r = await db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('ra_agents', $1::jsonb) WHERE id = core.current_org()", [JSON.stringify({ default: b.data.default, states })])
  if (!r.rowCount) throw apiError('not_saved', 'Could not save. Sign in again and retry.', 409)
  await audit({ event, actorUserId: user.userId, action: 'services.ra_agents', objectType: 'organization', objectId: user.orgId ?? undefined })
  return { ok: true }
})
