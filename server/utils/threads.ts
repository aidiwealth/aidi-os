// Conversation threads (tickets) between a client and the services team, and message attachments.
import { createHash, randomUUID } from 'node:crypto'
export async function openThread(orgId: string, clientId: string, firstText: string): Promise<string> {
  const cur = (await db().query<{ id: string }>("SELECT id FROM services.threads WHERE client_id = $1 AND status = 'open'", [clientId])).rows[0]
  if (cur) return cur.id
  const subject = (firstText.split(/\r?\n/)[0] || 'New conversation').replace(/[#*_>`]/g, '').trim().slice(0, 120) || 'New conversation'
  return (await one<{ id: string }>('INSERT INTO services.threads (organization_id, client_id, subject) VALUES ($1,$2,$3) RETURNING id', [orgId, clientId, subject])).id
}
export async function postMessage(o: { orgId: string; clientId: string; fromTeam: boolean; userId?: string | null; personId?: string | null; body: string; documentId?: string | null; threadId?: string | null }): Promise<string> {
  let threadId = o.threadId ?? null
  if (threadId) await db().query("UPDATE services.threads SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = $1 AND client_id = $2 AND status = 'closed' AND NOT EXISTS (SELECT 1 FROM services.threads x WHERE x.client_id = $2 AND x.status = 'open')", [threadId, o.clientId])
  const valid = threadId ? (await db().query("SELECT 1 FROM services.threads WHERE id = $1 AND client_id = $2 AND status = 'open'", [threadId, o.clientId])).rowCount : 0
  if (!valid) threadId = await openThread(o.orgId, o.clientId, o.body || 'Shared a document')
  await db().query('INSERT INTO services.messages (organization_id, client_id, thread_id, from_team, author_user_id, author_person_id, body, document_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [o.orgId, o.clientId, threadId, o.fromTeam, o.userId ?? null, o.personId ?? null, o.body || null, o.documentId ?? null])
  await db().query('UPDATE services.threads SET last_message_at = now() WHERE id = $1', [threadId])
  return threadId!
}
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', csv: 'text/csv', txt: 'text/plain', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' }
// A file attached in chat: stored privately in R2 and recorded as a document of the services team's workspace.
export async function storeChatFile(event: Parameters<typeof readMultipartFormData>[0], orgId: string, clientName: string, userId: string | null): Promise<{ id: string; name: string; size: number }> {
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a file.')
  if (file.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Files can be up to 25 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = TYPES[ext]
  if (!mime) throw apiError('bad_type', 'Upload a PDF, image, Office, CSV, text or ZIP file.')
  const id = randomUUID(), key = 'documents/' + id + '.' + ext
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  const name = (file.filename ?? 'file').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) || 'file'
  await db().query("INSERT INTO core.documents (id, organization_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,'other','normal',$4,$5,$6,$7,$8)",
    [id, orgId, clientName + ' — ' + name, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex'), userId])
  return { id, name, size: file.data.length }
}
