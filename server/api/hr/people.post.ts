// Add, change or remove a person (admins).
import { z } from 'zod'
const d8 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null))
export default defineEventHandler(async (event) => {
  const user = await requireTeamManager(event)
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional(), email: z.string().trim().max(254).optional().default(''), phone: z.string().trim().max(40).optional().default(''),
    user_id: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)), kind: z.enum(['employee', 'consultant', 'contractor', 'intern', 'advisor']).default('employee'), title: z.string().trim().max(120).default(''),
    entity_id: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)), location: z.string().trim().max(120).default(''), start_date: d8, end_date: d8, contract_end: d8,
    pay_amount: z.coerce.number().min(0).max(1e10).nullable().optional().or(z.literal('').transform(() => null)), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
    pay_frequency: z.enum(['monthly', 'biweekly', 'weekly', 'quarterly', 'per_invoice', 'none']).default('monthly'), pay_day: z.coerce.number().int().min(1).max(31).default(25), status: z.enum(['active', 'onboarding', 'ended']).default('active'), notes: z.string().max(4000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check ' + (b.error.issues[0]?.path.join('.') || 'the details') + '.')
  const d = b.data
  if (d.delete && d.id) { await db().query('DELETE FROM hr.people WHERE id = $1', [d.id]); await audit({ event, actorUserId: user.userId, action: 'hr.person_deleted', objectType: 'hr_person', objectId: d.id }); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Enter their name.')
  const vals = [d.name, d.email || null, d.phone || null, d.user_id ?? null, d.kind, d.title || null, d.entity_id ?? null, d.location || null, d.start_date ?? null, d.end_date ?? null, d.contract_end ?? null, d.pay_amount ?? null, d.currency, d.pay_frequency, d.pay_day, d.status, d.notes || null]
  const id = d.id
    ? ((await db().query('UPDATE hr.people SET name=$2, email=$3, phone=$4, user_id=$5, kind=$6, title=$7, entity_id=$8, location=$9, start_date=$10, end_date=$11, contract_end=$12, pay_amount=$13, currency=$14, pay_frequency=$15, pay_day=$16, status=$17, notes=$18, updated_at=now() WHERE id=$1', [d.id, ...vals])).rowCount ? d.id : null)
    : (await one<{ id: string }>('INSERT INTO hr.people (name, email, phone, user_id, kind, title, entity_id, location, start_date, end_date, contract_end, pay_amount, currency, pay_frequency, pay_day, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id', vals)).id
  if (!id) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'hr.person_saved', objectType: 'hr_person', objectId: id })
  return { ok: true, id }
})
