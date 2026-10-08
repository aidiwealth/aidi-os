// One support thread: GET messages (marks read); POST reply (rich text, sent by email) or open/close.
import { z } from 'zod'
import { mdRender } from '~/shared/markdown'
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const t = (await db().query<{ id: string; subject: string; from_email: string; from_name: string | null; status: string; workspace_id: string | null; workspace: string | null }>('SELECT t.id, t.subject, t.from_email, t.from_name, t.status, t.workspace_id, NULL::text AS workspace FROM support.threads t WHERE t.id = $1', [id])).rows[0]
  if (!t) throw apiError('not_found', 'Not found', 404)
  if (t.workspace_id) t.workspace = (await asPlatform(() => db().query<{ name: string }>('SELECT name FROM core.organizations WHERE id = $1', [t.workspace_id]))).rows[0]?.name ?? null
  if (getMethod(event) === 'GET') {
    await db().query('UPDATE support.threads SET unread = false WHERE id = $1', [id])
    const msgs = (await db().query(`SELECT m.id, m.direction, m.from_email, m.subject, m.text_body, m.html_body, m.body_md, m.attachments, m.created_at, coalesce(p.full_name, u.email) AS sent_by FROM support.messages m LEFT JOIN core.users u ON u.id = m.sent_by LEFT JOIN core.people p ON p.id = u.person_id WHERE m.thread_id = $1 ORDER BY m.created_at`, [id])).rows
    return { thread: t, messages: msgs }
  }
  const b = z.object({ action: z.enum(['reply', 'open', 'close']), body: z.string().max(50000).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  if (b.data.action !== 'reply') { await db().query('UPDATE support.threads SET status = $2 WHERE id = $1', [id, b.data.action === 'close' ? 'closed' : 'open']); return { ok: true } }
  const md = String(b.data.body ?? '').trim()
  if (!md) throw apiError('invalid', 'Write a reply first.')
  const last = (await db().query<{ message_id: string | null }>("SELECT message_id FROM support.messages WHERE thread_id = $1 AND direction = 'in' AND message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", [id])).rows[0]?.message_id ?? null
  const refs = (await db().query<{ r: string | null }>("SELECT string_agg(message_id, ' ' ORDER BY created_at) AS r FROM support.messages WHERE thread_id = $1 AND message_id IS NOT NULL", [id])).rows[0]?.r ?? null
  const html = mdRender(md, { p: 'color:#4a4a4a;font-size:15px;line-height:1.6;margin:0 0 14px;', a: 'color:#1c547d;', li: 'color:#4a4a4a;font-size:15px;line-height:1.6;' })
  const text = md.replace(/[*_`#>]/g, '')
  const subject = /^re:/i.test(t.subject) ? t.subject : 'Re: ' + t.subject
  await sendSupportReply(t.from_email, subject, html, text, last, refs)
  await db().query('INSERT INTO support.messages (thread_id, direction, from_email, to_email, subject, body_md, html_body, sent_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, 'out', (useRuntimeConfig() as unknown as { supportInbox?: string }).supportInbox || 'support@finvry.com', t.from_email, subject, md, html, user.userId])
  await db().query('UPDATE support.threads SET last_message_at = now(), unread = false WHERE id = $1', [id])
  await audit({ event, actorUserId: user.userId, action: 'support.reply', objectType: 'support_thread', objectId: id })
  return { ok: true }
})
