// The client submits the filing form: answers (JSON in "answers") and files (fields named after the question).
import { randomUUID } from 'node:crypto'
import { INTAKE_FORMS, intakeKindFor } from '~/shared/intake'
const EXT: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('intake', u.clientId, 20, 60 * 60 * 1000)
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ codes: string[]; service: string; title: string }>('SELECT codes, service, title FROM services.jobs WHERE id = $1 AND client_id = $2', [id, u.clientId])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  const kind = intakeKindFor(j.codes ?? [], j.service)
  if (!kind) throw apiError('invalid', 'This request does not need a form.')
  const parts = (await readMultipartFormData(event)) ?? []
  let answers: Record<string, unknown> = {}
  try { answers = JSON.parse(parts.find((p) => p.name === 'answers')?.data.toString('utf8') ?? '{}') } catch { throw apiError('invalid', 'Could not read the form.') }
  const form = INTAKE_FORMS[kind]
  const prev = (await db().query<{ id: string; files: { field: string; doc_id: string; name: string; mime: string; size: number }[] }>('SELECT id, files FROM services.intakes WHERE job_id = $1 ORDER BY updated_at DESC LIMIT 1', [id])).rows[0]
  const files = [...(prev?.files ?? [])]
  for (const p of parts.filter((x) => x.filename && x.data.length)) {
    const f = form.fields.find((x) => x.key === p.name && (x.type === 'file' || x.type === 'files'))
    if (!f) continue
    if (p.data.length > 20 * 1024 * 1024) throw apiError('too_large', (p.filename ?? 'A file') + ' is over 20 MB.', 413)
    const ext = (p.filename ?? '').split('.').pop()?.toLowerCase() ?? '', mime = EXT[ext]
    if (!mime) throw apiError('bad_type', (p.filename ?? 'A file') + ': upload a PDF, image, Excel, CSV or Word file.')
    const docId = randomUUID(), key = 'documents/' + docId + '.' + ext, name = (p.filename ?? 'file').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200) || 'file'
    await putObject({ key, body: new Uint8Array(p.data), contentType: mime })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes) VALUES ($1,$2,'other','restricted',$3,$4,$5)", [docId, 'Intake — ' + name, key, mime, p.data.length])
    if (f.type === 'file') for (let i = files.length - 1; i >= 0; i--) if (files[i]!.field === f.key) files.splice(i, 1)
    files.push({ field: f.key, doc_id: docId, name, mime, size: p.data.length })
  }
  const clean: Record<string, unknown> = {}
  for (const f of form.fields) {
    if (f.type === 'file' || f.type === 'files' || f.type === 'secret') continue
    const v = answers[f.key]
    if (f.type === 'multi') clean[f.key] = Array.isArray(v) ? v.filter((x) => typeof x === 'string' && f.options?.includes(x)) : []
    else if (typeof v === 'string') clean[f.key] = v.trim().slice(0, 3000)
  }
  const missing = form.fields.filter((f) => f.required && !f.showIf && ((f.type === 'file' || f.type === 'files') ? !files.some((x) => x.field === f.key) : f.type === 'multi' ? !(clean[f.key] as string[] | undefined)?.length : !clean[f.key])).map((f) => f.label)
  if (missing.length) throw apiError('missing', 'Please complete: ' + missing.join('; '))
  const ssnRaw = typeof answers.ssn === 'string' ? answers.ssn.replace(/\D/g, '') : ''
  if (ssnRaw && ssnRaw.length !== 9) throw apiError('invalid', 'An SSN has 9 digits.')
  if (prev) await db().query('UPDATE services.intakes SET answers = $2, files = $3, ssn_enc = coalesce($4, ssn_enc), ssn_last4 = coalesce($5, ssn_last4), submitted_by = $6, updated_at = now() WHERE id = $1', [prev.id, JSON.stringify(clean), JSON.stringify(files), ssnRaw ? encryptText(ssnRaw) : null, ssnRaw ? ssnRaw.slice(-4) : null, u.email])
  else await db().query('INSERT INTO services.intakes (client_id, job_id, kind, answers, files, ssn_enc, ssn_last4, submitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [u.clientId, id, kind, JSON.stringify(clean), JSON.stringify(files), ssnRaw ? encryptText(ssnRaw) : null, ssnRaw ? ssnRaw.slice(-4) : null, u.email])
  await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', $2, true)", [id, (prev ? 'Updated' : 'Submitted') + ' the ' + form.title.toLowerCase() + ' (' + files.length + ' file' + (files.length === 1 ? '' : 's') + ').'])
  await db().query("UPDATE services.jobs SET updated_at = now(), status = CASE WHEN status = 'waiting_client' THEN 'in_progress' ELSE status END WHERE id = $1", [id])
  return { ok: true }
})
