// Conversation threads (tickets) between a client and the services team, and message attachments.
import { createHash, randomUUID } from 'node:crypto'
// A new conversation. The subject defaults to the first line of the first message.
export async function newThread(orgId: string, clientId: string, o: { subject?: string; firstText?: string; category?: string; startedBy: 'team' | 'client' }): Promise<string> {
  const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const subject = clean(o.subject ?? '') || clean((o.firstText ?? '').split(/\r?\n/)[0] ?? '') || 'New conversation'
  return (await one<{ id: string }>('INSERT INTO services.threads (organization_id, client_id, subject, category, started_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [orgId, clientId, subject, o.category ?? 'general', o.startedBy])).id
}
// Post into a conversation (a closed one reopens). No thread, or one that isn't this client's, starts a new conversation.
export async function postMessage(o: { orgId: string; clientId: string; fromTeam: boolean; userId?: string | null; personId?: string | null; body: string; documentId?: string | null; threadId?: string | null; category?: string; subject?: string }): Promise<string> {
  let threadId = o.threadId ?? null
  const t = threadId ? (await db().query<{ category: string }>('SELECT category FROM services.threads WHERE id = $1 AND client_id = $2', [threadId, o.clientId])).rows[0] : undefined
  if (t) await db().query("UPDATE services.threads SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = $1 AND status = 'closed'", [threadId])
  else threadId = await newThread(o.orgId, o.clientId, { subject: o.subject, firstText: o.body || 'Shared a document', category: o.fromTeam ? o.category : 'general', startedBy: o.fromTeam ? 'team' : 'client' })
  await db().query('INSERT INTO services.messages (organization_id, client_id, thread_id, from_team, author_user_id, author_person_id, body, document_id, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [o.orgId, o.clientId, threadId, o.fromTeam, o.userId ?? null, o.personId ?? null, o.body || null, o.documentId ?? null, o.fromTeam ? o.category ?? t?.category ?? 'general' : 'general'])
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
  await db().query("INSERT INTO core.documents (id, organization_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by, area) VALUES ($1,$2,$3,'other','normal',$4,$5,$6,$7,$8,'services')",
    [id, orgId, clientName + ' — ' + name, key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex'), userId])
  return { id, name, size: file.data.length }
}
