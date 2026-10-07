// Advisers and platforms we refer clients to, with the referral terms: % of their fee, or a flat amount.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const parts = (await readMultipartFormData(event)) ?? []
  const v = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  if (v('delete_id')) { await db().query('DELETE FROM wm.firms WHERE id = $1', [v('delete_id')]); return { ok: true } }
  if (!v('name')) throw apiError('invalid', 'Add the firm name.')
  const type = v('terms_type') === 'flat' ? 'flat' : 'percent_of_fee'
  let doc: string | null = null
  const f = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  if (f) { doc = randomUUID(); const key = 'documents/' + doc + '.pdf'; await putObject({ key, body: new Uint8Array(f.data), contentType: f.type || 'application/pdf' }); await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','restricted',$3,$4,$5,$6)", [doc, 'Referral agreement — ' + v('name').slice(0, 120), key, f.type || 'application/pdf', f.data.length, createHash('sha256').update(f.data).digest('hex')]) }
  const args = [v('name').slice(0, 200), ['adviser', 'platform', 'dealer', 'other'].includes(v('kind')) ? v('kind') : 'adviser', ['US', 'NG'].includes(v('country')) ? v('country') : null, v('contact_name') || null, v('email') || null, v('website') || null, type, v('terms_rate') ? Number(v('terms_rate')) : null, v('terms_amount') ? Number(v('terms_amount')) : null, v('terms_currency') || 'USD', ['one_off', 'monthly', 'quarterly', 'annual'].includes(v('terms_frequency')) ? v('terms_frequency') : 'annual', v('notes') || null]
  if (v('id')) await db().query('UPDATE wm.firms SET name = $2, kind = $3, country = $4, contact_name = $5, email = $6, website = $7, terms_type = $8, terms_rate = $9, terms_amount = $10, terms_currency = $11, terms_frequency = $12, notes = $13, agreement_doc_id = coalesce($14, agreement_doc_id) WHERE id = $1', [v('id'), ...args, doc])
  else await db().query('INSERT INTO wm.firms (name, kind, country, contact_name, email, website, terms_type, terms_rate, terms_amount, terms_currency, terms_frequency, notes, agreement_doc_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [...args, doc])
  await audit({ event, actorUserId: user.userId, action: 'wm.firm', objectType: 'wm_firm', objectId: v('id') || undefined })
  return { ok: true }
})
