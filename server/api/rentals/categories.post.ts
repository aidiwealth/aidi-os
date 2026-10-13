// Add or rename an expense category (admins).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ label: z.string().trim().min(1).max(80), hint: z.string().trim().max(200).optional(), code: z.string().regex(/^[a-z0-9_]{2,40}$/).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name the category.')
  const code = b.data.code ?? (b.data.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'other')
  await db().query('INSERT INTO rentals.expense_categories (code, label, hint, sort) VALUES ($1,$2,$3,(SELECT coalesce(max(sort), 0) + 1 FROM rentals.expense_categories)) ON CONFLICT (organization_id, code) DO UPDATE SET label = EXCLUDED.label, hint = EXCLUDED.hint', [code.length >= 2 ? code : code + '_x', b.data.label, b.data.hint || null])
  await audit({ event, actorUserId: user.userId, action: 'rentals.category_saved', objectType: 'rental_category', detail: { code } })
  return { ok: true, code }
})
