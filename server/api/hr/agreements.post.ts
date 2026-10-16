// Agreements for a person (admins): draft one with AI from their profile (saved as a PDF in Documents), upload a signed
// copy, or change its status (sent, signed, ended) and dates.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const ct = getRequestHeader(event, 'content-type') ?? ''
  if (ct.includes('multipart')) {
    const parts = (await readMultipartFormData(event)) ?? [], field = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8') ?? ''
    const file = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
    const pid = field('person_id'), kind = field('kind') || 'employment', title = field('title').trim().slice(0, 200)
    if (!/^[0-9a-f-]{36}$/.test(pid) || !file) throw apiError('invalid', 'Choose the person and the signed file.')
    if (file.data.length > 20 * 1024 * 1024 || file.data.subarray(0, 4).toString('latin1') !== '%PDF') throw apiError('bad_type', 'Upload the agreement as a PDF (up to 20 MB).')
    const p = (await db().query<{ name: string; entity_id: string | null }>('SELECT name, entity_id FROM hr.people WHERE id = $1', [pid])).rows[0]
    if (!p) throw apiError('not_found', 'Person not found', 404)
    const docId = await storePdf(new Uint8Array(file.data), (title || DOC_TYPES[kind]?.name || 'Agreement') + ' - ' + p.name + ' (signed)', p.entity_id)
    const id = (await one<{ id: string }>("INSERT INTO hr.agreements (person_id, kind, title, document_id, status, signed_on, starts_on, ends_on, created_by) VALUES ($1,$2,$3,$4,'signed',nullif($5,'')::date,nullif($6,'')::date,nullif($7,'')::date,$8) RETURNING id",
      [pid, /^[a-z_]{2,40}$/.test(kind) ? kind : 'other', title || (DOC_TYPES[kind]?.name ?? 'Agreement') + ' - ' + p.name, docId, field('signed_on'), field('starts_on'), field('ends_on'), user.userId])).id
    await audit({ event, actorUserId: user.userId, action: 'hr.agreement_uploaded', objectType: 'hr_agreement', objectId: id })
    return { ok: true, id }
  }
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), person_id: z.string().uuid().optional(), kind: z.string().regex(/^[a-z_]{2,40}$/).optional(), answers: z.record(z.string(), z.string().max(4000)).optional(),
    status: z.enum(['draft', 'sent', 'signed', 'ended']).optional(), signed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)), ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Invalid request.')
  const d = b.data
  if (d.id && d.delete) { await db().query('DELETE FROM hr.agreements WHERE id = $1', [d.id]); return { ok: true } }
  if (d.id) {
    await db().query("UPDATE hr.agreements SET status = coalesce($2, status), signed_on = CASE WHEN $2 = 'signed' THEN coalesce($3::date, signed_on, current_date) ELSE coalesce($3::date, signed_on) END, starts_on = coalesce($4::date, starts_on), ends_on = coalesce($5::date, ends_on) WHERE id = $1", [d.id, d.status ?? null, d.signed_on ?? null, d.starts_on ?? null, d.ends_on ?? null])
    await audit({ event, actorUserId: user.userId, action: 'hr.agreement_updated', objectType: 'hr_agreement', objectId: d.id, detail: { status: d.status } }); return { ok: true }
  }
  // Draft with AI.
  if (!d.person_id || !d.kind || !HR_DOCS.includes(d.kind)) throw apiError('invalid', 'Choose the person and the kind of agreement.')
  await rateLimit('docgen', user.userId, 25, 60 * 60 * 1000)
  const t = DOC_TYPES[d.kind]!
  const answers = d.answers ?? {}
  const missing = t.fields.filter((f) => f.required && !answers[f.key]?.trim()).map((f) => f.label)
  if (missing.length) throw apiError('invalid', 'Please fill in: ' + missing.join(', ') + '.')
  const p = (await db().query<{ name: string; entity_id: string | null; start_date: string | null; contract_end: string | null }>("SELECT name, entity_id, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(contract_end, 'YYYY-MM-DD') AS contract_end FROM hr.people WHERE id = $1", [d.person_id])).rows[0]
  if (!p) throw apiError('not_found', 'Person not found', 404)
  const co = await docCompany(p.entity_id)
  let doc: { title: string; body: string }
  try { doc = await draftDocument(d.kind, answers, co) } catch (err) { if ((err as { statusCode?: number }).statusCode === 429) throw err; console.error('[hr] draft failed', err); throw apiError('ai_failed', 'Could not draft the agreement just now. Try again in a moment.', 502) }
  const title = (doc.title || t.name) + ' - ' + p.name
  const md = doc.body.startsWith('# ') ? doc.body : '# ' + (doc.title || t.name) + '\n\n' + doc.body
  const bytes = await legalPdf(co.name, [{ title, md }], { logo: 'aidi' })
  const docId = await storePdf(bytes, title, p.entity_id)
  const id = (await one<{ id: string }>("INSERT INTO hr.agreements (person_id, kind, title, document_id, status, starts_on, ends_on, created_by) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7) RETURNING id", [d.person_id, d.kind, title.slice(0, 200), docId, answers.start || p.start_date, answers.term || p.contract_end, user.userId])).id
  await audit({ event, actorUserId: user.userId, action: 'hr.agreement_drafted', objectType: 'hr_agreement', objectId: id, detail: { kind: d.kind } })
  return { ok: true, id, document_id: docId }
})
