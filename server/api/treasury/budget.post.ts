// A monthly budget for a category (0 or empty removes it).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const b = z.object({ category: z.string().min(2).max(140), monthly: z.preprocess((v) => (v === '' || v === null ? 0 : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12)) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a monthly amount.')
  if (!b.data.monthly) await db().query('DELETE FROM banking.budgets WHERE category = $1', [b.data.category])
  else await db().query('INSERT INTO banking.budgets (category, monthly) VALUES ($1,$2) ON CONFLICT (organization_id, category) DO UPDATE SET monthly = EXCLUDED.monthly, updated_at = now()', [b.data.category, b.data.monthly])
  return { ok: true }
})
