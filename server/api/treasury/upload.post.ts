// Add a bank statement (CSV or PDF) to the ledger, for banks the feed does not reach. The file is kept privately with
// the company's documents; transactions already in the ledger are not added twice.
import { createHash, randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  await rateLimit('treasury_upload', user.userId, 30, 60 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename), field = (n: string) => parts?.find((p) => p.name === n)?.data.toString('utf8').trim() ?? ''
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a CSV or PDF statement.')
  if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Statements can be up to 20 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
  if (ext !== 'csv' && ext !== 'pdf') throw apiError('bad_type', 'Upload the statement as CSV (best) or PDF.')
  const currency = /^[A-Z]{3}$/.test(field('currency')) ? field('currency') : 'USD', account = (field('account') || 'Uploaded statement').slice(0, 120)
  let parsed: ParsedStatement
  try { parsed = ext === 'csv' ? parseCsv(file.data.toString('utf8'), currency) : await parsePdf(file.data, 'treasury:' + (currentOrgId() ?? '')) }
  catch (err) {
    const m = (err as Error).message
    throw apiError('unreadable', m === 'header' ? 'We could not find the date and amount columns in that CSV. Export it again with column headings, or upload the PDF.' : m === 'empty' ? 'No transactions were found in that file.' : 'We could not read that statement. Try the CSV export from your bank.', 422)
  }
  // The company chosen at the top; on the group view, the company picked in the upload form (else the main one).
  const sc = await forecastScope(event), pick = field('entity_id'), ent = !sc.group ? sc.entity : sc.companies.some((c) => c.id === pick) ? pick : await companyEntityId(), docId = randomUUID(), key = 'documents/' + docId + '.' + ext, mime = ext === 'csv' ? 'text/csv' : 'application/pdf'
  // The file is kept with the company's documents; if storage is down the transactions still come in.
  const kept = await putObject({ key, body: new Uint8Array(file.data), contentType: mime }).then(() => db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,'statement','family',$4,$5,$6,$7,$8)",
    [docId, ent, account + ' statement', key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex'), user.userId])).then(() => true).catch((e) => { console.error('[treasury] keep file', (e as Error).message); return false })
  const added = await addToLedger('upload', parsed.txns.map((t, i) => ({ ref: uploadRef(account, t, i), date: t.date, description: t.description, amount: t.amount, currency, account })), ent)
  const tie = parsed.opening !== null && parsed.closing !== null ? tieOut(parsed.opening, parsed.closing, parsed.txns) : null
  await audit({ event, actorUserId: user.userId, action: 'treasury.upload', objectType: 'document', objectId: kept ? docId : undefined, detail: { source: ext, txns: parsed.txns.length, added } })
  return { ok: true, read: parsed.txns.length, added, from: parsed.period_start, to: parsed.period_end, tie }
})
