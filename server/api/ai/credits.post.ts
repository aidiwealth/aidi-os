// Buy AI credits from the wallet.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ pack: z.enum(['small', 'medium', 'large']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a pack.')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('invalid', 'AI credits are for Finvry company workspaces.')
  const pack = PACKS[b.data.pack]!, w = await walletOf(org.id)
  const minor = Math.round((w.currency === 'NGN' ? pack.ngn : pack.usd) * 100)
  await postLedger(org.id, 'debit', minor, 'service', 'AI credits: ' + pack.label, { userId: user.userId })
  await db().query('INSERT INTO ai.credits (tokens) VALUES ($1) ON CONFLICT (organization_id) DO UPDATE SET tokens = ai.credits.tokens + EXCLUDED.tokens, updated_at = now()', [pack.tokens])
  await db().query('INSERT INTO ai.purchases (pack, tokens, amount_minor, currency, created_by) VALUES ($1,$2,$3,$4,$5)', [b.data.pack, pack.tokens, minor, w.currency, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'ai.credits', objectType: 'organization', objectId: org.id, detail: { pack: b.data.pack } })
  return { ok: true }
})
