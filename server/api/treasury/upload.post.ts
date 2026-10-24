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
  if (!['csv', 'pdf', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'].includes(ext ?? '')) throw apiError('bad_type', 'Upload the statement as CSV, Excel, PDF or a photo of it.')
  if (ext === 'xls') throw apiError('bad_type', 'Save the old .xls file as .xlsx (or CSV) and upload it again.')
  const currency = /^[A-Z]{3}$/.test(field('currency')) ? field('currency') : 'USD', account = (field('account') || 'Uploaded statement').slice(0, 120)
  let parsed: ParsedStatement
  // CSV and Excel: read by their headings, or, for any other layout, with the AI saying which column is which (the
  // figures are still copied exactly). PDFs and photos of statements: read by the AI. Every one is tied out below.
  const ref = 'treasury:' + (currentOrgId() ?? '')
  try {
    if (ext === 'csv') parsed = await parseStatementTable(parseCsvRows(file.data.toString('utf8')), currency, ref)
    else if (ext === 'xlsx') { const gs = await readGrids(file.data, 'xlsx'), g = gs.sort((a, b) => b.rows.length - a.rows.length)[0]; if (!g) throw new Error('empty'); parsed = await parseStatementTable(g.rows.map((r) => r.map((c) => (c === null ? '' : String(c)))), currency, ref) }
    else parsed = await parsePdf(file.data, ref, ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg')
  }
  catch (err) {
    const m = (err as Error).message
    throw apiError('unreadable', m === 'header' ? 'We could not tell which columns hold the dates and amounts. Upload the PDF statement instead, or use the Finvry template.' : m === 'empty' ? 'No transactions were found in that file.' : 'We could not read that statement. Try the CSV export from your bank.', 422)
  }
  // The company chosen at the top; on the group view, the company picked in the upload form (else the main one).
  const sc = await forecastScope(event), pick = field('entity_id'), ent = !sc.group ? sc.entity : sc.companies.some((c) => c.id === pick) ? pick : await companyEntityId(), docId = randomUUID(), key = 'documents/' + docId + '.' + ext, mime = ext === 'csv' ? 'text/csv' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/pdf'
  // The file is kept with the company's documents; if storage is down the transactions still come in.
  const kept = await putObject({ key, body: new Uint8Array(file.data), contentType: mime }).then(() => db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,'statement','family',$4,$5,$6,$7,$8)",
    [docId, ent, account + ' statement', key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex'), user.userId])).then(() => true).catch((e) => { console.error('[treasury] keep file', (e as Error).message); return false })
  // A record of the statement, so it can be deleted later (with the transactions it brought in).
  const upId = (await db().query<{ id: string }>('INSERT INTO banking.uploads (entity_id, account_label, currency, file_name, file_kind, period_start, period_end, closing, read_count, doc_id, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    [ent, account, currency, (file.filename ?? '').slice(0, 200) || null, ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? 'image' : ext, parsed.period_start, parsed.period_end, parsed.closing, parsed.txns.length, kept ? docId : null, user.userId])).rows[0]!.id
  const added = await addToLedger('upload', parsed.txns.map((t, i) => ({ ref: uploadRef(account, t, i), date: t.date, description: t.description, amount: t.amount, currency, account })), ent, upId)
  await db().query('UPDATE banking.uploads SET added_count = $2 WHERE id = $1', [upId, added])
  // The statement's balances (running balance and closing), for reconciling month-end cash with Financials.
  await saveBalances(ent, account, currency, 'statement', [...parsed.txns.map((t) => ({ date: t.date, balance: t.balance })), ...(parsed.period_end && parsed.closing !== null ? [{ date: parsed.period_end, balance: parsed.closing }] : [])]).catch((e) => console.error('[treasury] balances', (e as Error).message))
  const tie = parsed.opening !== null && parsed.closing !== null ? tieOut(parsed.opening, parsed.closing, parsed.txns) : null
  await audit({ event, actorUserId: user.userId, action: 'treasury.upload', objectType: 'document', objectId: kept ? docId : undefined, detail: { source: ext, txns: parsed.txns.length, added } })
  return { ok: true, read: parsed.txns.length, added, from: parsed.period_start, to: parsed.period_end, tie }
})
