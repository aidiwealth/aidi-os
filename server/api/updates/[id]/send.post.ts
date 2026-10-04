// Email the update to chosen investors, each with a personal link that records when they open it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('update_send', user.userId, 10, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ investor_ids: z.array(z.string().uuid()).min(1).max(500) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Choose who to send it to.')
  const u = (await db().query<{ title: string; body: string | null }>('SELECT title, body FROM financials.updates WHERE id = $1', [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  if (!u.body?.trim()) throw apiError('invalid', 'Write or generate the update before sending.')
  const org = (await currentOrg())!
  const inv = await db().query<{ id: string; name: string; email: string }>('SELECT id, name, email FROM financials.investors WHERE id = ANY($1::uuid[])', [b.data.investor_ids])
  let sent = 0
  for (const i of inv.rows) {
    const token = randomToken()
    await db().query('INSERT INTO financials.update_sends (update_id, investor_id, token_hash) VALUES ($1,$2,$3) ON CONFLICT (update_id, investor_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, sent_at = now()', [id.data, i.id, sha256(token)])
    try { await sendInvestorUpdateEmail(i.email, i.name, org.name, u.title, u.body, brands().finvry.url + '/u/' + token); sent++; await logActivity(org.id, i.email, 'update_sent', 'Sent ' + u.title, id.data) } catch (err) { console.error('[updates] email failed', err) }
  }
  await audit({ event, actorUserId: user.userId, action: 'updates.send', objectType: 'update', objectId: id.data, detail: { sent } })
  return { ok: true, sent }
})
