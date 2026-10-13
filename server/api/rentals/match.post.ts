// Match a payout to a bank deposit by hand, or resolve it with a note (e.g. "in the bank, statement not uploaded").
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ payout_ref: z.string().trim().min(3).max(60), bank_txn_id: z.string().uuid().nullable().optional(), note: z.string().trim().max(500).optional().nullable(), clear: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.clear) { if (!isRentalAdmin(user.roles)) throw apiError('forbidden', 'Only an admin can undo a match.', 403); await db().query('DELETE FROM rentals.payout_matches WHERE payout_ref = $1', [d.payout_ref]); return { ok: true } }
  const t = (await db().query<{ txn_date: string }>("SELECT to_char(txn_date, 'YYYY-MM-DD') AS txn_date FROM rentals.transactions WHERE payout_ref = $1 AND type ILIKE 'payout'", [d.payout_ref])).rows[0]
  if (!t) throw apiError('not_found', 'Payout not found', 404)
  await assertUnlocked(t.txn_date)
  if (!d.bank_txn_id && !d.note) throw apiError('invalid', 'Pick the bank deposit or add a note.')
  try { await db().query('INSERT INTO rentals.payout_matches (payout_ref, bank_txn_id, method, note, matched_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id, payout_ref) DO UPDATE SET bank_txn_id = EXCLUDED.bank_txn_id, method = EXCLUDED.method, note = EXCLUDED.note, matched_by = EXCLUDED.matched_by, matched_at = now()', [d.payout_ref, d.bank_txn_id ?? null, d.bank_txn_id ? 'manual' : 'note', d.note || null, user.userId]) }
  catch (e) { if ((e as { code?: string }).code === '23505') throw apiError('duplicate', 'That deposit is already matched to another payout.', 409); throw e }
  await audit({ event, actorUserId: user.userId, action: 'rentals.payout_matched', objectType: 'rental_payout', detail: { ref: d.payout_ref } })
  return { ok: true }
})
