// Log an expense (multipart: fields + optional receipt photo). Editing or deleting an existing one is for admins.
import { z } from 'zod'
const Body = z.object({ id: z.string().uuid().optional(), delete: z.coerce.boolean().optional(), property_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), unit_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), category: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
  item: z.string().trim().max(300).optional(), quantity: z.coerce.number().min(0).max(100000).optional().or(z.literal('').transform(() => undefined)), vendor: z.string().trim().max(200).optional(), amount: z.coerce.number().positive().max(10_000_000).optional(),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), bank_txn_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)), split: z.enum(['weight', 'nights', 'equal']).optional().or(z.literal('').transform(() => undefined)), recurring: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()).optional(), notes: z.string().trim().max(2000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const ct = getRequestHeader(event, 'content-type') ?? ''
  let fields: Record<string, unknown> = {}, file: { filename?: string; data: Buffer; type?: string } | undefined
  if (ct.includes('multipart')) { const parts = (await readMultipartFormData(event)) ?? []; for (const p of parts) { if (p.filename) { if (p.name === 'receipt' && p.data.length) file = p } else if (p.name) fields[p.name] = p.data.toString('utf8') } }
  else fields = (await readBody(event)) ?? {}
  const b = Body.safeParse(fields)
  if (!b.success) throw apiError('invalid', 'Add the date, amount, category and property.')
  const d = b.data
  if (d.id) {
    if (!isRentalAdmin(user.roles)) throw apiError('forbidden', 'Only an admin can change or delete a logged expense.', 403)
    const cur = (await db().query<{ spent_on: string }>("SELECT to_char(spent_on, 'YYYY-MM-DD') AS spent_on FROM rentals.expenses WHERE id = $1", [d.id])).rows[0]
    if (!cur) throw apiError('not_found', 'Expense not found', 404)
    await assertUnlocked(cur.spent_on); await assertUnlocked(d.spent_on)
    if (d.delete) { await db().query('UPDATE rentals.expenses SET recurred_from = NULL WHERE recurred_from = $1', [d.id]); await db().query('DELETE FROM rentals.expenses WHERE id = $1', [d.id]); await audit({ event, actorUserId: user.userId, action: 'rentals.expense_deleted', objectType: 'rental_expense', objectId: d.id }); return { ok: true } }
  }
  if (!d.category || !d.amount || !d.spent_on) throw apiError('invalid', 'Add the date, amount and category.')
  // Overriding how a shared cost is split is for GPs and admins; others get the category default.
  const split = d.unit_id || !isRentalAdmin(user.roles) ? null : d.split ?? null
  await assertUnlocked(d.spent_on)
  if (!(await db().query('SELECT 1 FROM rentals.expense_categories WHERE code = $1', [d.category])).rowCount) throw apiError('invalid', 'Choose a category.')
  if (file && file.data.length > 15 * 1024 * 1024) throw apiError('too_large', 'Receipts can be up to 15 MB.', 413)
  if (file && !/\.(pdf|png|jpe?g|webp|heic)$/i.test(file.filename ?? '')) throw apiError('bad_type', 'Upload the receipt as a photo or PDF.')
  const receipt = file ? await storeFile(event, await havenEntityId(), 'Receipt — ' + (d.vendor || d.item || d.category) + ' ' + d.spent_on, file.filename!, file.data, file.type || 'application/octet-stream', user.userId, 'receipt') : null
  const vals = [d.property_id ?? null, d.property_id ? d.unit_id ?? null : null, d.category, d.item || null, d.quantity ?? null, d.vendor || null, d.amount, d.spent_on, d.recurring ?? false, d.notes || null, split]
  const id = d.id
    ? (await db().query<{ id: string }>('UPDATE rentals.expenses SET property_id=$2, unit_id=$3, category=$4, item=$5, quantity=$6, vendor=$7, amount=$8, spent_on=$9, recurring=$10, notes=$11, split=$12, receipt_document_id = coalesce($13, receipt_document_id) WHERE id=$1 RETURNING id', [d.id, ...vals, receipt])).rows[0]!.id
    : (await one<{ id: string }>('INSERT INTO rentals.expenses (property_id, unit_id, category, item, quantity, vendor, amount, spent_on, recurring, notes, split, receipt_document_id, created_by, bank_txn_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id', [...vals, receipt, user.userId, d.bank_txn_id ?? null]).catch((e) => { if ((e as { code?: string }).code === '23505') throw apiError('duplicate', 'That bank payment is already logged.', 409); throw e })).id
  if (d.recurring) await runRecurringExpenses()
  await audit({ event, actorUserId: user.userId, action: d.id ? 'rentals.expense_updated' : 'rentals.expense_logged', objectType: 'rental_expense', objectId: id, detail: { amount: d.amount, category: d.category } })
  return { ok: true, id }
})
