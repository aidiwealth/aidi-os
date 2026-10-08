// Support email: messages sent to support@finvry.com (forwarded from the mailbox to the inbound webhook) become
// threads in the Services desk inbox. Replies are matched to their thread by In-Reply-To/References, else by sender
// and subject.
import { randomUUID } from 'node:crypto'
const SAFE = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel))$/
export function isSupportMail(to: string, raw: Record<string, unknown>): boolean {
  const addr = ((useRuntimeConfig() as unknown as { supportInbox?: string }).supportInbox || 'support@finvry.com').toLowerCase()
  const hdrs = (raw.Headers as { Name: string; Value: string }[] | undefined) ?? []
  const all = [to, String(raw.To ?? ''), String(raw.Cc ?? ''), ...hdrs.filter((h) => /^(to|delivered-to|x-forwarded-to|x-original-to)$/i.test(h.Name)).map((h) => h.Value)].join(' ').toLowerCase()
  return all.includes(addr)
}
const header = (raw: Record<string, unknown>, name: string) => ((raw.Headers as { Name: string; Value: string }[] | undefined) ?? []).find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? (raw[name.toLowerCase().replace(/-/g, '_')] as string | undefined) ?? null
export async function handleSupportMail(m: { message_id: string | null; from_email: string; from_name: string; to_email: string; subject: string; text: string; html: string; attachments: { Name?: string; filename?: string; Content?: string; content?: string; ContentType?: string; contentType?: string }[] }, raw: Record<string, unknown>) {
  const op = (await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE (settings->>'services_operator') IN ('true') ORDER BY created_at LIMIT 1"))).rows[0]?.id
  if (!op) throw apiError('not_found', 'Not found', 404)
  setOrgContext(op)
  const mid = m.message_id ? (m.message_id.startsWith('<') ? m.message_id : '<' + m.message_id + '>') : null
  if (mid && (await db().query('SELECT 1 FROM support.messages WHERE message_id = $1', [mid])).rowCount) return { ok: true, duplicate: true }
  const refs = [header(raw, 'In-Reply-To'), header(raw, 'References')].filter(Boolean).join(' ').match(/<[^>]+>/g) ?? []
  let thread = refs.length ? (await db().query<{ thread_id: string }>('SELECT thread_id FROM support.messages WHERE message_id = ANY($1) ORDER BY created_at DESC LIMIT 1', [refs])).rows[0]?.thread_id : undefined
  const base = m.subject.replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, '').trim().slice(0, 300) || '(no subject)'
  if (!thread) thread = (await db().query<{ id: string }>("SELECT id FROM support.threads WHERE lower(from_email) = lower($1) AND lower(subject) = lower($2) AND last_message_at > now() - interval '30 days' ORDER BY last_message_at DESC LIMIT 1", [m.from_email, base])).rows[0]?.id
  if (!thread) {
    const ws = (await asPlatform(() => db().query<{ org: string }>("SELECT m.organization_id AS org FROM core.users u JOIN core.memberships m ON m.user_id = u.id JOIN core.organizations o ON o.id = m.organization_id WHERE lower(u.email) = lower($1) AND o.kind = 'company' ORDER BY m.created_at LIMIT 1", [m.from_email]))).rows[0]?.org ?? null
    thread = (await one<{ id: string }>('INSERT INTO support.threads (subject, from_email, from_name, workspace_id) VALUES ($1,$2,$3,$4) RETURNING id', [base, m.from_email.toLowerCase(), m.from_name || null, ws])).id
  }
  const files: { doc_id: string; name: string; mime: string; size: number }[] = []
  for (const a of m.attachments ?? []) {
    const mime = String(a.ContentType ?? a.contentType ?? ''), b64 = String(a.Content ?? a.content ?? ''), name = String(a.Name ?? a.filename ?? 'attachment').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 120)
    if (!SAFE.test(mime) || !b64) continue
    const buf = Buffer.from(b64, 'base64'); if (!buf.length || buf.length > 20 * 1024 * 1024) continue
    const id = randomUUID(), key = 'documents/' + id + '.' + (name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
    try { await putObject({ key, body: new Uint8Array(buf), contentType: mime }); await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes) VALUES ($1,$2,'other','restricted',$3,$4,$5)", [id, name, key, mime, buf.length]); files.push({ doc_id: id, name, mime, size: buf.length }) } catch (err) { console.error('[support] attachment', (err as Error).message) }
  }
  await db().query('INSERT INTO support.messages (thread_id, direction, from_email, to_email, subject, text_body, html_body, message_id, attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [thread, 'in', m.from_email.toLowerCase(), m.to_email || null, m.subject, m.text || null, m.html || null, mid, JSON.stringify(files)])
  await db().query("UPDATE support.threads SET status = 'open', unread = true, last_message_at = now() WHERE id = $1", [thread])
  return { ok: true, thread }
}
