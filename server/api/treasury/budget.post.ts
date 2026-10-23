// A monthly budget for a category (0 or empty removes it).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp')
  const b = z.object({ category: z.string().min(2).max(140), monthly: z.preprocess((v) => (v === '' || v === null ? 0 : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12)) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter a monthly amount.')
  const sc = await forecastScope(event), scope = sc.group ? 'group' : sc.entity ?? 'group'
  if (!b.data.monthly) await db().query('DELETE FROM banking.budgets WHERE category = $1 AND scope = $2', [b.data.category, scope])
  else await db().query('INSERT INTO banking.budgets (category, monthly, scope) VALUES ($1,$2,$3) ON CONFLICT (organization_id, scope, category) DO UPDATE SET monthly = EXCLUDED.monthly, updated_at = now()', [b.data.category, b.data.monthly, scope])
  return { ok: true }
})
