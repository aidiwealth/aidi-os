// Console: give a workspace extra AI at no charge (tokens added to its AI credits, used once its plan allowance runs
// out). Recorded with the workspace's purchases as a gift, and in the console log.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ tokens: z.number().int().min(100_000).max(50_000_000), note: z.string().trim().max(200).optional() }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose between 100k and 50M tokens.')
  const left = await asPlatform(async () => {
    await db().query('INSERT INTO ai.purchases (organization_id, pack, tokens, amount_minor, currency, created_by) VALUES ($1, $2, $3, 0, $4, $5)', [id.data, 'gift', b.data.tokens, 'USD', staff.userId])
    return (await db().query<{ tokens: string }>('INSERT INTO ai.credits (organization_id, tokens) VALUES ($1, $2) ON CONFLICT (organization_id) DO UPDATE SET tokens = ai.credits.tokens + EXCLUDED.tokens, updated_at = now() RETURNING tokens::text', [id.data, b.data.tokens])).rows[0]!.tokens
  })
  await audit({ event, actorUserId: staff.userId, action: 'platform.ai_gift', objectType: 'organization', objectId: id.data, detail: { tokens: b.data.tokens, note: b.data.note ?? null } })
  return { ok: true, credits: Number(left) }
})
