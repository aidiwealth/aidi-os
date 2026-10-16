import { allowedFor } from '~/shared/risk'
// Wealth client: say you are interested in a deal (with an amount and a note), or withdraw. The team sees it on the deal.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const client = await wmClientOfUser(user.userId)
  if (!client) throw apiError('not_found', 'Your wealth account is not set up yet.', 404)
  const b = z.object({ id: z.string().uuid(), action: z.enum(['interested', 'withdraw']), amount: z.preprocess((v) => (typeof v === 'string' ? (v.replace(/[,\s$]/g, '') || null) : v), z.coerce.number().min(0).nullable()).optional(), note: z.string().trim().max(1000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the amount.')
  const d = b.data
  if (!(await db().query("SELECT 1 FROM wm.secondaries WHERE id = $1 AND client_visible AND fits IS NOT FALSE AND status <> 'expired'", [d.id])).rowCount) throw apiError('not_found', 'This deal is no longer available.', 404)
  if (d.action === 'interested') { const lvl = (await db().query<{ r: string | null }>('SELECT risk_profile AS r FROM wm.clients WHERE id = $1', [client])).rows[0]?.r ?? null; const cfg = await riskConfig(); if (!allowedFor(lvl, cfg.ratings.secondaries ?? 5, cfg)) throw apiError('risk', 'These deals are above your risk level. Talk to your adviser if your situation has changed.', 403) }
  if (d.action === 'withdraw') await db().query("UPDATE wm.secondary_interest SET status = 'withdrawn', updated_at = now() WHERE secondary_id = $1 AND client_id = $2 AND status = 'interested'", [d.id, client])
  else await db().query("INSERT INTO wm.secondary_interest (secondary_id, client_id, amount, note) VALUES ($1,$2,$3,$4) ON CONFLICT (secondary_id, client_id) DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, status = CASE WHEN wm.secondary_interest.status = 'invested' THEN 'invested' ELSE 'interested' END, updated_at = now()", [d.id, client, d.amount ?? null, d.note || null])
  await audit({ event, actorUserId: user.userId, action: 'secondaries.client_' + d.action, objectType: 'secondary', objectId: d.id, detail: { client, amount: d.amount ?? null } })
  return { ok: true }
})
