// Put a transaction (or every payment to its vendor) under a category; "always" keeps a rule for that vendor, so new
// transactions follow it too.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ id: z.string().uuid().optional(), vendor_key: z.string().max(80).optional(), category: z.string().min(2).max(140), always: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success || (!b.data.id && !b.data.vendor_key)) throw apiError('invalid', 'Choose a transaction and a category.')
  const d = b.data
  const ok = STD_CATS.some((c) => c.key === d.category) || (d.category.startsWith('cat:') && (await listAccounts()).some((a) => 'cat:' + a.parent + ':' + a.name === d.category))
  if (!ok) throw apiError('invalid', 'Choose one of your categories.')
  const vk = d.vendor_key ?? (await db().query<{ vendor_key: string }>('SELECT vendor_key FROM banking.ledger WHERE id = $1', [d.id])).rows[0]?.vendor_key
  if (!vk) throw apiError('not_found', 'Not found', 404)
  let n = 0
  if (d.always) {
    await db().query('INSERT INTO banking.category_rules (vendor_key, category, created_by) VALUES ($1,$2,$3) ON CONFLICT (organization_id, vendor_key) DO UPDATE SET category = EXCLUDED.category, created_by = EXCLUDED.created_by, created_at = now()', [vk, d.category, user.userId])
    n = (await db().query("UPDATE banking.ledger SET category = $2, category_by = 'rule' WHERE vendor_key = $1 AND category_by <> 'manual'", [vk, d.category])).rowCount ?? 0
  }
  if (d.id) n += (await db().query("UPDATE banking.ledger SET category = $2, category_by = 'manual' WHERE id = $1", [d.id, d.category])).rowCount ?? 0
  await audit({ event, actorUserId: user.userId, action: 'treasury.categorize', objectType: 'bank_vendor', detail: { vendor: vk, category: d.category, always: d.always, rows: n } })
  return { ok: true, updated: n }
})
