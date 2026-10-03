// Draft a resolution, minutes, consent or distribution. Required approvals default to a majority of current signatories.
import { z } from 'zod'
const Body = z.object({
  entity_id: z.string().uuid(),
  kind: z.enum(['resolution', 'minutes', 'distribution', 'consent']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  required_approvals: z.coerce.number().int().min(1).max(50).optional(),
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  amount: z.coerce.number().positive().max(1e12).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  beneficiary_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  document_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined))
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add a title and the text.')
  const d = b.data
  if (d.kind === 'distribution') {
    if (!d.amount || !d.currency || !d.beneficiary_id) throw apiError('invalid', 'A distribution needs an amount, currency and beneficiary.')
    const ben = await db().query("SELECT 1 FROM governance.parties WHERE id = $1 AND entity_id = $2 AND role = 'beneficiary'", [d.beneficiary_id, d.entity_id])
    if (!ben.rowCount) throw apiError('invalid', 'Choose a beneficiary of this entity.')
  }
  const signers = await signatories(d.entity_id)
  if (!signers.length) throw apiError('no_signers', 'Add the trustees, directors or other signatories (with emails) before drafting a resolution.')
  const majority = Math.floor(signers.length / 2) + 1
  const required = d.required_approvals ?? majority
  if (required > signers.length) throw apiError('too_many', 'Only ' + signers.length + ' signator' + (signers.length === 1 ? 'y' : 'ies') + ' can approve; required approvals cannot be higher.')
  const row = await one<{ id: string }>(
    `INSERT INTO governance.resolutions (entity_id, kind, title, body, required_approvals, meeting_date, amount, currency, beneficiary_id, document_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [d.entity_id, d.kind, d.title, d.body, required, d.meeting_date ?? null, d.kind === 'distribution' ? d.amount : null, d.kind === 'distribution' ? d.currency : null,
     d.kind === 'distribution' ? d.beneficiary_id : null, d.document_id ?? null, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'governance.draft', objectType: 'resolution', objectId: row.id, entityId: d.entity_id, detail: { kind: d.kind, title: d.title, required } })
  return { ok: true, id: row.id }
})
