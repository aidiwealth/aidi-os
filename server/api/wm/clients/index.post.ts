// Create a wealth client (household or business). Country decides the operating entity (US: Aidi Wealth LLC,
// Nigeria: Aidi Finance Limited); the model must be switched on for that country.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(['individual', 'business', 'family']), country: z.enum(['US', 'NG']), model: z.enum(['managed', 'advisor', 'self_directed']), tag: z.string().trim().max(60).default(''), contact_name: z.string().trim().max(200).default(''), email: z.string().trim().max(254).default(''), phone: z.string().trim().max(40).default(''), notes: z.string().max(3000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a name, country and service model.')
  const d = b.data, cfg = await wmSettings()
  if (!cfg[d.country][d.model === 'managed' ? 'managed' : d.model === 'advisor' ? 'advisor' : 'self_directed']) throw apiError('model_off', 'That service model is switched off for ' + (d.country === 'US' ? 'the US' : 'Nigeria') + '. Turn it on in Wealth → Settings once you are licensed to offer it.', 400)
  const c = await one<{ id: string }>("INSERT INTO wm.clients (name, kind, country, model, entity_id, tag, contact_name, email, phone, notes, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'onboarding',$11) RETURNING id",
    [d.name, d.kind, d.country, d.model, await wmEntityFor(d.country), d.tag || null, d.contact_name || null, d.email.toLowerCase() || null, d.phone || null, d.notes || null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'wm.client_create', objectType: 'wm_client', objectId: c.id })
  return { ok: true, id: c.id }
})
