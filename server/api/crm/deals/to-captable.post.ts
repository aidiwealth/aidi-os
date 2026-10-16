// Closed investors (a "Won" stage) onto a cap table: a SAFE or note pipeline adds each as a SAFE or note on its
// amount with the investor's own cap (post- or pre-money) and discount, or the pipeline's when not set; a priced round issues shares in the chosen class at the price per
// share. Investors already added are skipped, as are those not closed or without an amount.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), captable_id: z.string().uuid().optional(), issued_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    class_id: z.string().uuid().optional(), price: z.preprocess((v) => (typeof v === 'string' ? v.replace(/[,\s$₦]/g, '') : v), z.coerce.number().positive()).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the investors and the date.')
  const d = b.data, ct = await capTableId(d.captable_id)
  const deals = (await db().query<{ id: string; investor: string; amount: number | null; kind: string; instrument: string; currency: string; valuation_cap: number | null; discount: number | null; post_money: boolean; email: string | null; equity_at: string | null }>(
    `SELECT d.id, d.investor, d.amount::float, s.kind, p.instrument, p.currency, coalesce(d.valuation_cap, p.valuation_cap)::float AS valuation_cap, coalesce(d.discount, p.discount)::float AS discount, (d.valuation_cap IS NULL OR coalesce(d.cap_basis, 'post') = 'post') AS post_money, CASE WHEN d.added_by_team THEN NULL ELSE c.email END AS email, d.equity_at
       FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id JOIN crm.pipelines p ON p.id = d.pipeline_id LEFT JOIN crm.contacts c ON c.id = d.contact_id
      WHERE d.id = ANY($1::uuid[])`, [d.ids])).rows
  if (deals.some((x) => x.instrument === 'priced')) {
    if (!d.class_id || !d.price) throw apiError('invalid', 'For a priced round, choose the share class and the price per share.')
    if (!(await db().query('SELECT 1 FROM equity.classes WHERE id = $1 AND captable_id = $2', [d.class_id, ct])).rowCount) throw apiError('invalid', 'Choose a share class on this cap table.')
  }
  let added = 0; const skipped: { investor: string; reason: string }[] = []
  for (const x of deals) {
    if (x.equity_at) { skipped.push({ investor: x.investor, reason: 'already on the cap table' }); continue }
    if (x.kind !== 'won') { skipped.push({ investor: x.investor, reason: 'not closed yet' }); continue }
    if (!x.amount || x.amount <= 0) { skipped.push({ investor: x.investor, reason: 'no amount' }); continue }
    const holder = (await db().query<{ id: string }>('SELECT id FROM equity.holders WHERE captable_id = $1 AND lower(name) = lower($2) LIMIT 1', [ct, x.investor])).rows[0]?.id
      ?? (await one<{ id: string }>("INSERT INTO equity.holders (captable_id, name, email, kind) VALUES ($1, $2, $3, 'investor') RETURNING id", [ct, x.investor.slice(0, 200), x.email])).id
    let ref: string, kind: 'convertible' | 'issuance'
    if (x.instrument === 'priced') {
      const shares = Math.floor(x.amount / d.price!)
      if (shares < 1) { skipped.push({ investor: x.investor, reason: 'amount is below one share' }); continue }
      ref = (await one<{ id: string }>("INSERT INTO equity.issuances (captable_id, holder_id, class_id, shares, price, issued_on, notes) VALUES ($1,$2,$3,$4,$5,$6,'From the fundraising pipeline') RETURNING id", [ct, holder, d.class_id, shares, d.price, d.issued_on])).id; kind = 'issuance'
    } else {
      ref = (await one<{ id: string }>('INSERT INTO equity.convertibles (captable_id, holder_id, kind, amount, currency, valuation_cap, discount_pct, post_money, issued_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [ct, holder, x.instrument === 'convertible_note' ? 'note' : 'safe', x.amount, x.currency, x.valuation_cap || null, x.discount && x.discount < 100 ? x.discount : null, x.post_money, d.issued_on])).id; kind = 'convertible'
    }
    await db().query('UPDATE crm.deals SET equity_ref = $2, equity_kind = $3, equity_at = now() WHERE id = $1', [x.id, ref, kind])
    added++
  }
  if (added) { await db().query('UPDATE equity.captables SET updated_at = now() WHERE id = $1', [ct]); await audit({ event, actorUserId: user.userId, action: 'equity.from_pipeline', objectType: 'captable', objectId: ct, detail: { added } }) }
  return { ok: true, added, skipped, captable_id: ct }
})
