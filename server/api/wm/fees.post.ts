// Referral fees from firms (not tied to one client), and marking any fee paid (posted to the books).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ fee_id: z.string().uuid().optional(), status: z.enum(['due', 'paid', 'waived']).optional(), paid_on: z.string().optional(), firm_id: z.string().uuid().optional(), client_id: z.string().uuid().nullable().optional(), kind: z.enum(['subscription', 'advisory', 'referral']).optional(), period: z.string().max(40).optional(), amount: z.number().min(0).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), note: z.string().max(500).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fee.')
  const d = b.data
  if (d.fee_id && d.status) { await db().query("UPDATE wm.fees SET status = $2, paid_on = CASE WHEN $2 = 'paid' THEN coalesce($3::date, current_date) ELSE NULL END WHERE id = $1", [d.fee_id, d.status, d.paid_on || null]); if (d.status === 'paid') await bookFee(d.fee_id); else await db().query('DELETE FROM finance.journal WHERE wm_fee_id = $1', [d.fee_id]) }
  else {
    if (!d.kind || d.amount == null) throw apiError('invalid', 'Add the fee type and amount.')
    const ent = d.client_id ? (await db().query<{ entity_id: string | null }>('SELECT entity_id FROM wm.clients WHERE id = $1', [d.client_id])).rows[0]?.entity_id : d.firm_id ? await wmEntityFor(((await db().query<{ country: string | null }>('SELECT country FROM wm.firms WHERE id = $1', [d.firm_id])).rows[0]?.country ?? 'US') as 'US' | 'NG') : null
    const nf = await one<{ id: string }>('INSERT INTO wm.fees (client_id, firm_id, kind, period, amount, currency, entity_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [d.client_id ?? null, d.firm_id ?? null, d.kind, d.period || null, d.amount, d.currency ?? 'USD', ent ?? null, d.note || null])
    await taxFee(nf.id)
  }
  await audit({ event, actorUserId: user.userId, action: 'wm.fee', objectType: 'wm_fee', objectId: d.fee_id })
  return { ok: true }
})
