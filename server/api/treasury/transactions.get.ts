// The ledger, newest first: filter by month, direction, category or text.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const q = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined), dir: z.enum(['in', 'out']).optional().catch(undefined), category: z.string().max(140).optional(), q: z.string().max(80).optional(), vendor: z.string().max(80).optional(), page: z.coerce.number().int().min(0).max(500).default(0) }).parse(getQuery(event))
  const r = await db().query(`SELECT id, to_char(txn_date, 'YYYY-MM-DD') AS date, description, vendor, vendor_key, direction, amount::float, currency, amount_base::float, base_currency, category, category_by, account_label, source, count(*) OVER ()::int AS total FROM banking.ledger
    WHERE ($1::text IS NULL OR to_char(txn_date, 'YYYY-MM') = $1) AND ($2::text IS NULL OR direction = $2) AND ($3::text IS NULL OR coalesce(category, '') = $3) AND ($4::text IS NULL OR description ILIKE '%' || $4 || '%' OR vendor ILIKE '%' || $4 || '%') AND ($5::text IS NULL OR vendor_key = $5)
    ORDER BY txn_date DESC, created_at DESC LIMIT 100 OFFSET $6`, [q.month ?? null, q.dir ?? null, q.category || null, q.q || null, q.vendor || null, q.page * 100])
  return { rows: r.rows, total: r.rows[0]?.total ?? 0 }
})
