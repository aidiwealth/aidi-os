// Step 1: upload a statement (CSV or PDF). It is stored privately and read; the result is shown for confirmation.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Account not found', 404)
  rateLimit('bank_import', user.userId, 30, 60 * 60 * 1000)
  const a = await db().query<{ currency: string; entity_id: string; bank_name: string; account_name: string }>('SELECT currency, entity_id, bank_name, account_name FROM banking.accounts WHERE id = $1', [id.data])
  const acct = a.rows[0]
  if (!acct) throw apiError('not_found', 'Account not found', 404)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data.length) throw apiError('invalid', 'Choose a CSV or PDF statement.')
  if (file.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Statements can be up to 20 MB.', 413)
  const ext = (file.filename ?? '').split('.').pop()?.toLowerCase()
  if (ext !== 'csv' && ext !== 'pdf') throw apiError('bad_type', 'Upload the statement as CSV (best) or PDF.')
  const docId = randomUUID(), key = 'documents/' + docId + '.' + ext, mime = ext === 'csv' ? 'text/csv' : 'application/pdf'
  await putObject({ key, body: new Uint8Array(file.data), contentType: mime })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,'statement','family',$4,$5,$6,$7,$8)",
    [docId, acct.entity_id, acct.bank_name + ' ' + acct.account_name + ' statement', key, mime, file.data.length, createHash('sha256').update(file.data).digest('hex'), user.userId])
  let parsed: ParsedStatement
  try {
    parsed = ext === 'csv' ? parseCsv(file.data.toString('utf8'), acct.currency) : await parsePdf(file.data, 'banking.accounts:' + id.data)
  } catch (err) {
    const m = (err as Error).message
    throw apiError('unreadable', m === 'header' ? 'We could not find the date and amount columns in that CSV. Export it again with column headings, or upload the PDF.'
      : m === 'empty' ? 'No transactions were found in that file.' : 'We could not read that statement. Try the CSV export from your bank.', 422)
  }
  const imp = await one<{ id: string }>("INSERT INTO banking.imports (account_id, document_id, source, parsed, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [id.data, docId, ext, JSON.stringify(parsed), user.userId])
  const prev = await db().query<{ closing: string; period_end: string }>("SELECT closing_balance::text AS closing, to_char(period_end, 'YYYY-MM-DD') AS period_end FROM banking.statements WHERE account_id = $1 ORDER BY period_end DESC LIMIT 1", [id.data])
  await audit({ event, actorUserId: user.userId, action: 'banking.import_read', objectType: 'bank_account', objectId: id.data, entityId: acct.entity_id, detail: { source: ext, txns: parsed.txns.length } })
  return { importId: imp.id, source: ext, ...parsed, previous: prev.rows[0] ?? null,
    tie: parsed.opening !== null && parsed.closing !== null ? tieOut(parsed.opening, parsed.closing, parsed.txns) : null }
})
