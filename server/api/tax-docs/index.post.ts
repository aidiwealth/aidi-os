// Staff: upload tax documents (one or several files) for an LP or a wealth client, and notify them by email.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const parts = (await readMultipartFormData(event)) ?? []
  const v = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  const kind = v('kind'), rid = v('recipient_id'), year = Number(v('tax_year')), form = v('form_type').slice(0, 80) || 'Other'
  if (!['lp', 'wm'].includes(kind) || !/^[0-9a-f-]{36}$/.test(rid) || !(year >= 2000 && year <= 2100)) throw apiError('invalid', 'Choose the recipient, tax year and form.')
  const who = kind === 'lp' ? (await db().query<{ name: string; email: string | null }>('SELECT name, email FROM funds.lps WHERE id = $1', [rid])).rows[0] : (await db().query<{ name: string; email: string | null }>('SELECT name, email FROM wm.clients WHERE id = $1', [rid])).rows[0]
  if (!who) throw apiError('not_found', 'Recipient not found.', 404)
  const files = parts.filter((p) => p.name === 'file' && p.filename && p.data.length)
  if (!files.length) throw apiError('invalid', 'Add the document.')
  let n = 0
  for (const f of files.slice(0, 20)) {
    const mime = f.type || 'application/pdf'
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime) || f.data.length > 25 * 1024 * 1024) continue
    const id = randomUUID(), ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]
    await putObject({ key: 'documents/' + id + '.' + ext, body: new Uint8Array(f.data), contentType: mime })
    await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [id, (year + ' ' + form + ' - ' + who.name + ' - ' + (f.filename ?? '')).replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200), 'documents/' + id + '.' + ext, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
    await db().query('INSERT INTO core.tax_docs (lp_id, wm_client_id, tax_year, form_type, issuer, note, document_id, uploaded_by, notified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [kind === 'lp' ? rid : null, kind === 'wm' ? rid : null, year, form, v('issuer').slice(0, 120) || null, v('note').slice(0, 500) || null, id, user.userId, who.email ? new Date() : null])
    n++
  }
  if (n && who.email && v('notify') !== '0') {
    const where = kind === 'lp' ? 'your Aidi LP portal (use the portal link the fund team sent you, or reply to this email for a new one)' : 'your Aidi Wealth portal: ' + brands().aidi.url + '/w'
    try { await sendEmail({ to: who.email, subject: 'Tax document' + (n > 1 ? 's' : '') + ' available: ' + year + ' ' + form, text: 'Hello ' + who.name + ',\n\nYour ' + year + ' ' + form + (n > 1 ? ' (' + n + ' files)' : '') + ' ' + (n > 1 ? 'are' : 'is') + ' now available in ' + where + '.\n\nKeep it for your tax filing.', html: '<p>Hello ' + who.name.replace(/</g, '&lt;') + ',</p><p>Your <b>' + year + ' ' + form + '</b>' + (n > 1 ? ' (' + n + ' files)' : '') + ' ' + (n > 1 ? 'are' : 'is') + ' now available in ' + where.replace(/</g, '&lt;') + '.</p><p>Keep it for your tax filing.</p>' }) } catch { /* ignore */ }
  }
  await audit({ event, actorUserId: user.userId, action: 'tax_doc.upload', objectType: kind === 'lp' ? 'lp' : 'wm_client', objectId: rid, detail: { year, form, files: n } })
  return { ok: true, uploaded: n }
})
