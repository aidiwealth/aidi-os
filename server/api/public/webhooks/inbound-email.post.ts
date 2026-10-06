// Inbound email (Postmark Inbound JSON, or a generic { from, to, subject, text, html, attachments }). Saved as a notice
// in the Aidi workspace; AI adds a summary, any deadline and the action needed. Protected by ?token= (NUXT_INBOUND_EMAIL_TOKEN).
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
const TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel))$/
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().inboundEmailToken as string, given = String(getQuery(event).token ?? '')
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const raw = await readBody<Record<string, unknown>>(event)
  const pm = 'FromFull' in raw || 'TextBody' in raw
  const from = pm ? (raw.FromFull as { Email?: string; Name?: string } | undefined) : null
  const m = { message_id: String((pm ? raw.MessageID : raw.message_id) ?? '') || null, from_email: String(from?.Email ?? raw.from ?? '').replace(/^.*<([^>]+)>.*$/, '$1').slice(0, 254), from_name: String(from?.Name ?? raw.from_name ?? '').slice(0, 200),
    to_email: String((pm ? raw.OriginalRecipient ?? raw.To : raw.to) ?? '').slice(0, 500), subject: String((pm ? raw.Subject : raw.subject) ?? '(no subject)').slice(0, 500),
    text: String((pm ? raw.TextBody : raw.text) ?? '').slice(0, 100000), html: String((pm ? raw.HtmlBody : raw.html) ?? '').slice(0, 300000),
    attachments: (((pm ? raw.Attachments : raw.attachments) as { Name?: string; filename?: string; Content?: string; content?: string; ContentType?: string; contentType?: string }[] | undefined) ?? []).slice(0, 10) }
  const org = (await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE plan_code = 'internal' ORDER BY created_at LIMIT 1"))).rows[0]?.id
  if (!org) throw apiError('not_found', 'Not found', 404)
  setOrgContext(org)
  if (m.message_id && (await db().query('SELECT 1 FROM inbox.notices WHERE message_id = $1', [m.message_id])).rowCount) return { ok: true, duplicate: true }
  const files: { doc_id: string; name: string; mime: string; size: number }[] = []
  for (const a of m.attachments) {
    const mime = String(a.ContentType ?? a.contentType ?? ''), b64 = String(a.Content ?? a.content ?? ''), name = String(a.Name ?? a.filename ?? 'attachment').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'attachment'
    if (!TYPES.test(mime) || !b64) continue
    const buf = Buffer.from(b64, 'base64'); if (!buf.length || buf.length > 20 * 1024 * 1024) continue
    const id = randomUUID(), key = 'documents/' + id + '.' + (name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
    try { await putObject({ key, body: new Uint8Array(buf), contentType: mime }); await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,$4,$5,$6)", [id, 'Notice — ' + name, key, mime, buf.length, createHash('sha256').update(buf).digest('hex')]); files.push({ doc_id: id, name, mime, size: buf.length }) } catch (err) { console.error('[inbound] attachment', err) }
  }
  const row = await one<{ id: string }>('INSERT INTO inbox.notices (message_id, from_name, from_email, to_email, subject, text_body, html_body, attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [m.message_id, m.from_name || null, m.from_email || null, m.to_email || null, m.subject, m.text || null, m.html || null, JSON.stringify(files)])
  // Gmail forwarding confirmation: surface the code and link
  const gmail = /forwarding-noreply@google\.com/i.test(m.from_email) || /Gmail Forwarding Confirmation/i.test(m.subject)
  if (gmail) { const code = m.text.match(/Confirmation code:\s*(\d+)/i)?.[1]; const link = m.text.match(/https:\/\/mail[^\s]*google\.com\/[^\s]+/i)?.[0]
    await db().query("UPDATE inbox.notices SET summary = $2, action = 'Confirm Gmail forwarding' WHERE id = $1", [row.id, 'Gmail is asking to confirm forwarding to this address.' + (code ? ' Confirmation code: ' + code + '.' : '') + (link ? ' Or open: ' + link : '')]); return { ok: true } }
  try {
    const ents = (await db().query<{ id: string; name: string }>("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows
    const { output } = await runAiTool({ task: 'notice_summary', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'notice-v1', inputRef: 'notice:' + row.id,
      system: 'You triage official and business notices (registered agent, state filings, tax, banking, legal) for a family office. Be factual and brief. Use only what the email says.',
      user: 'Entities we own: ' + ents.map((e) => e.name).join('; ') + '\n\nFrom: ' + m.from_name + ' <' + m.from_email + '>\nSubject: ' + m.subject + '\n\n' + (m.text || m.html.replace(/<[^>]+>/g, ' ')).slice(0, 12000),
      toolName: 'triage_notice', toolDescription: 'Summarise the notice.', jsonSchema: { type: 'object', additionalProperties: false, required: ['summary', 'action', 'due_date', 'entity'], properties: {
        summary: { type: 'string', description: 'Two sentences: what this is and what it means for us.' }, action: { type: 'string', description: 'What we need to do, or "No action needed".' },
        due_date: { type: 'string', description: 'Deadline as YYYY-MM-DD, or empty if none.' }, entity: { type: 'string', description: 'Which of our entities it concerns (exact name from the list), or empty.' } } },
      schema: z.object({ summary: z.string().max(1000), action: z.string().max(300), due_date: z.string().max(20), entity: z.string().max(200) }), maxTokens: 600 })
    const ent = ents.find((e) => e.name.toLowerCase() === output.entity.toLowerCase())
    await db().query('UPDATE inbox.notices SET summary = $2, action = $3, due_date = $4, entity_id = $5 WHERE id = $1', [row.id, output.summary, output.action, /^\d{4}-\d{2}-\d{2}$/.test(output.due_date) ? output.due_date : null, ent?.id ?? null])
  } catch (err) { console.error('[inbound] summary', (err as Error).message) }
  return { ok: true }
})
