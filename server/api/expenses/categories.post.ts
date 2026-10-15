// Add a payment category, change its statement line, or archive / restore it (built-in categories cannot be changed).
import { z } from 'zod'
const LINE = z.enum(['cogs', 'opex_payroll', 'opex_marketing', 'opex_rnd', 'opex_ga', 'opex_other'])
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(60).optional(), statement_line: LINE.optional(), archived: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the category a name (2 to 60 characters).')
  const d = b.data
  if (d.id) {
    await db().query('UPDATE finance.expense_categories SET statement_line = coalesce($2, statement_line), archived = coalesce($3, archived) WHERE id = $1', [d.id, d.statement_line ?? null, d.archived ?? null])
    return { ok: true }
  }
  if (!d.name) throw apiError('invalid', 'Give the category a name.')
  if ((await expenseCategories(true)).some((c) => c.name.toLowerCase() === d.name!.toLowerCase())) throw apiError('duplicate', '"' + d.name + '" already exists.', 409)
  const r = await one<{ id: string }>('INSERT INTO finance.expense_categories (name, statement_line, created_by) VALUES ($1, $2, $3) RETURNING id', [d.name, d.statement_line ?? 'opex_other', user.userId])
  await audit({ event, actorUserId: user.userId, action: 'expenses.category_added', objectType: 'expense_category', objectId: r.id, detail: { name: d.name } })
  return { ok: true, id: r.id, name: d.name }
})
