// Put SAFEs drafted under Fundraising on the cap table (post-money SAFEs, as Finvry drafts them).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), ct: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the SAFEs to add.')
  let n = 0
  const ct = await capTableId(b.data.ct)
  for (const id of b.data.ids) {
    const s = (await db().query<{ investor_name: string; investor_email: string | null; amount: string; currency: string; valuation_cap: string | null; discount: string | null; mfn: boolean; safe_date: string }>("SELECT investor_name, investor_email, amount::text, currency, valuation_cap::text, discount::text, mfn, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes s WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM equity.convertibles c WHERE c.safe_id = s.id AND c.captable_id = $2)", [id, ct])).rows[0]
    if (!s) continue
    const h = (await db().query<{ id: string }>('SELECT id FROM equity.holders WHERE captable_id = $2 AND lower(name) = lower($1) LIMIT 1', [s.investor_name, ct])).rows[0]?.id ?? (await one<{ id: string }>("INSERT INTO equity.holders (captable_id, name, email, kind) VALUES ($3, $1, $2, 'investor') RETURNING id", [s.investor_name, s.investor_email, ct])).id
    await db().query("INSERT INTO equity.convertibles (captable_id, holder_id, kind, amount, currency, valuation_cap, discount_pct, post_money, mfn, issued_on, safe_id) VALUES ($9, $1, 'safe', $2, $3, $4, $5, true, $6, $7, $8)", [h, s.amount, s.currency, s.valuation_cap, s.discount, s.mfn, s.safe_date, id, ct])
    n++
  }
  await audit({ event, actorUserId: user.userId, action: 'equity.safes_imported', objectType: 'equity_convertible', detail: { count: n } })
  return { ok: true, added: n }
})
