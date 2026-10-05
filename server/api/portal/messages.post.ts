// The founder writes to the team (optionally with an attachment already uploaded). Opens a new conversation if none is open.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_msg', (u.personId ?? u.userId ?? 'x'), 40, 60 * 60 * 1000)
  const b = z.object({ body: z.string().trim().max(5000).default(''), document_id: z.string().uuid().optional(), thread_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success || (!b.data.body && !b.data.document_id)) throw apiError('invalid', 'Write a message or attach a file.')
  if (b.data.document_id && !(await db().query('SELECT 1 FROM core.documents WHERE id = $1 AND uploaded_by IS NOT DISTINCT FROM $2', [b.data.document_id, u.userId ?? null])).rowCount) throw apiError('invalid', 'Attachment not found.')
  const thread = await postMessage({ orgId: u.orgId, clientId: u.clientId, fromTeam: false, userId: u.personId ? null : u.userId ?? null, personId: u.personId, body: b.data.body, documentId: b.data.document_id, threadId: b.data.thread_id })
  sendPortalMessageAlert(u.client, u.name, b.data.body || 'Shared a document', (await appUrl()) + '/services/inbox?t=' + thread).catch((e) => console.error('[portal] alert failed', e))
  return { ok: true, thread }
})
