// Loan application workflow (separate from equity pitches): run checks, review, approve with terms, decline.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ action: z.enum(['check', 'review', 'approve', 'decline', 'withdraw', 'reopen']), note: z.string().max(3000).optional(),
    terms: z.object({ principal: z.number().positive(), annual_rate: z.number().min(0).max(200), tenor_months: z.number().int().min(1).max(360), repayment_type: z.enum(['amortising', 'interest_only', 'bullet']), lender_entity_id: z.string().uuid().nullable().optional() }).optional() }).safeParse(await readBody(event))
  if (!/^[0-9a-f-]{36}$/.test(id) || !b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.action === 'approve' && user.roles.includes('team') && !user.roles.some((r) => ['gp', 'admin'].includes(r))) throw apiError('forbidden', 'Only partners can approve loans.', 403)
  if (d.action === 'check') { await checkApplication(id, user.userId); return { ok: true } }
  const status = { review: 'review', approve: 'approved', decline: 'declined', withdraw: 'withdrawn', reopen: 'review' }[d.action]
  await db().query('UPDATE credit.applications SET status = $2, decision_note = coalesce($3, decision_note), terms = CASE WHEN $4::jsonb IS NULL THEN terms ELSE $4::jsonb END, decided_by = CASE WHEN $2 IN (\'approved\',\'declined\') THEN $5::uuid ELSE decided_by END, decided_at = CASE WHEN $2 IN (\'approved\',\'declined\') THEN now() ELSE decided_at END, updated_at = now() WHERE id = $1',
    [id, status, d.note ?? null, d.terms ? JSON.stringify(d.terms) : null, user.userId])
  const pitch = (await db().query<{ pitch_id: string | null }>('SELECT pitch_id FROM credit.applications WHERE id = $1', [id])).rows[0]?.pitch_id
  if (pitch && (status === 'approved' || status === 'declined')) await db().query("UPDATE deals.pitches SET status = $2 WHERE id = $1", [pitch, status === 'approved' ? 'advancing' : 'declined'])
  await audit({ event, actorUserId: user.userId, action: 'credit.application_' + d.action, objectType: 'loan_application', objectId: id })
  return { ok: true }
})
