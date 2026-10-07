// Staff: confirm or reject a wallet withdrawal (after paying it out from Fincra), or post an adjustment.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ action: z.enum(['confirm', 'reject', 'adjust']), txn_id: z.string().uuid().optional(), client_id: z.string().uuid().optional(), currency: z.enum(['NGN', 'USD']).optional(), amount: z.number().optional(), note: z.string().max(300).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the details.')
  const d = b.data
  if (d.action === 'adjust') { if (!d.client_id || !d.currency || !d.amount) throw apiError('invalid', 'Add the client, currency and amount.'); await db().query("INSERT INTO wm.wallet_txns (client_id, currency, kind, amount, status, source, detail, created_by) VALUES ($1,$2,'adjustment',$3,'confirmed','staff',$4,$5)", [d.client_id, d.currency, d.amount, JSON.stringify({ note: d.note ?? null }), user.userId]) }
  else await db().query("UPDATE wm.wallet_txns SET status = $2, detail = detail || jsonb_build_object('handled_by', $3::text, 'note', $4::text) WHERE id = $1 AND status = 'requested'", [d.txn_id, d.action === 'confirm' ? 'confirmed' : 'rejected', user.userId, d.note ?? null])
  await audit({ event, actorUserId: user.userId, action: 'wm.wallet_' + d.action, objectType: 'wm_wallet', objectId: d.txn_id ?? d.client_id })
  return { ok: true }
})
