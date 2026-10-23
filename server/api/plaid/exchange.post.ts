// Finish connecting: swap the public token for an access token (stored encrypted) and load balances.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ public_token: z.string().min(10).max(300), institution: z.string().max(200).optional(), entity_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const r = await plaid<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: b.data.public_token })
  const enc = encryptText(r.access_token)
  const row = await one<{ id: string }>('INSERT INTO banking.plaid_items (item_id, access_token_enc, institution, entity_id, created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (item_id) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc, error = NULL, error_code = NULL RETURNING id', [r.item_id, enc, b.data.institution ?? null, b.data.entity_id ?? null, user.userId])
  await refreshItem(row.id, enc)
  // Notices from the bank come to this site; the first transactions are pulled after the response.
  await db().query('UPDATE banking.plaid_items SET webhook_url = $2, needs_sync = true WHERE id = $1', [row.id, getRequestURL(event).origin + '/api/public/webhooks/plaid'])
  inBackground('plaid-sync', () => syncPlaidItems())
  await audit({ event, actorUserId: user.userId, action: 'plaid.connect', objectType: 'plaid_item', objectId: row.id })
  return { ok: true }
})
