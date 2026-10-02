// Add to the timeline: a note, a meeting (with its date), or a link to a document already in Documents.
import { z } from 'zod'
const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), body: z.string().trim().min(1).max(5000) }),
  z.object({ kind: z.literal('meeting'), body: z.string().trim().min(1).max(5000), meeting_at: z.coerce.date() }),
  z.object({ kind: z.literal('document'), document_id: z.string().uuid(), body: z.string().trim().max(500).optional() })
])
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Fill in the note, meeting or document.')
  const exists = await db().query('SELECT 1 FROM deals.deals WHERE id = $1', [id.data])
  if (exists.rowCount !== 1) throw apiError('not_found', 'Deal not found', 404)
  let documentId: string | null = null
  if (b.data.kind === 'document') {
    const doc = await db().query<{ sensitivity: Sensitivity }>('SELECT sensitivity FROM core.documents WHERE id = $1', [b.data.document_id])
    if (!doc.rows[0] || !canSee(user.roles, doc.rows[0].sensitivity)) throw apiError('not_found', 'Document not found', 404)
    documentId = b.data.document_id
  }
  await db().query('INSERT INTO deals.deal_events (deal_id, kind, body, meeting_at, document_id, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [id.data, b.data.kind, b.data.body || null, b.data.kind === 'meeting' ? b.data.meeting_at : null, documentId, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'pipeline.' + b.data.kind, objectType: 'deal', objectId: id.data })
  return { ok: true }
})
