// Log a payment: duplicate guard, voucher PDF, optional supporting invoice/receipt, book entries. Or delete one.
import { createHash, randomUUID } from 'node:crypto'
import type { ReceiptRead } from '~/server/utils/receipt-check'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const parts = (await readMultipartFormData(event)) ?? []
  const v = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8').trim() ?? ''
  if (v('delete_id')) { if (!/^[0-9a-f-]{36}$/.test(v('delete_id'))) throw apiError('invalid', 'Invalid request.'); await db().query('DELETE FROM finance.expenses WHERE id = $1', [v('delete_id')]); await audit({ event, actorUserId: user.userId, action: 'expense.delete', objectType: 'expense', objectId: v('delete_id') }); return { ok: true } }
  const b = z.object({ paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), entity_id: z.string().uuid().or(z.literal('')), payee: z.string().min(1).max(200), category: z.string().min(1).max(60), description: z.string().max(3000), amount: z.coerce.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/), method: z.string().max(40), bank_account_id: z.string().uuid().or(z.literal('')), reference: z.string().max(120), force: z.string() })
    .safeParse({ paid_on: v('paid_on'), entity_id: v('entity_id'), payee: v('payee'), category: v('category'), description: v('description'), amount: v('amount'), currency: v('currency') || 'USD', method: v('method'), bank_account_id: v('bank_account_id'), reference: v('reference'), force: v('force') })
  if (!b.success) throw apiError('invalid', 'Add the date, payee, category and amount.')
  const d = b.data
  if (d.force !== '1') {
    const dup = (await db().query<{ number: string; paid_on: string }>("SELECT number, to_char(paid_on, 'YYYY-MM-DD') AS paid_on FROM finance.expenses WHERE lower(payee) = lower($1) AND amount = $2 AND currency = $3 AND abs(paid_on - $4::date) <= 5 LIMIT 1", [d.payee, d.amount, d.currency, d.paid_on])).rows[0]
    if (dup) throw apiError('duplicate', 'This looks like a payment already logged (' + dup.number + ' on ' + dup.paid_on + ', same payee and amount). Save anyway only if it is a separate payment.', 409)
  }
  // Read the attached receipt and check it against what is being logged.
  const f = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  let receipt: ReceiptRead | null = null, receiptIssues: string[] = []
  if (f && /^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type || '') && f.data.length <= 20 * 1024 * 1024) {
    try { receipt = await readReceipt(new Uint8Array(f.data), f.type!) } catch (err) { console.error('[receipt] read failed', err) }
    if (receipt) {
      if (!d.reference && receipt.readable && receipt.number) d.reference = receipt.number.slice(0, 120)
      receiptIssues = compareReceipt({ amount: d.amount, currency: d.currency, reference: d.reference || null, paid_on: d.paid_on, payee: d.payee }, receipt)
      if (receiptIssues.length && d.force !== '1') throw apiError('receipt_mismatch', 'The receipt does not match this payment: ' + receiptIssues.join(' ') + ' Fix the details, or save anyway to log it flagged for review.', 409)
    }
  }
  const n = Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM finance.expenses WHERE paid_on >= date_trunc('year', $1::date)", [d.paid_on])).rows[0]?.n ?? 0) + 1
  const number = 'PV-' + d.paid_on.slice(0, 4) + '-' + String(n).padStart(4, '0')
  const entity = d.entity_id ? (await db().query<{ name: string }>('SELECT name FROM core.entities WHERE id = $1', [d.entity_id])).rows[0]?.name ?? null : null
  const account = d.bank_account_id ? (await db().query<{ name: string }>("SELECT bank_name || ' · ' || coalesce(account_name, '') || coalesce(' •••' || last4, '') AS name FROM banking.accounts WHERE id = $1", [d.bank_account_id])).rows[0]?.name ?? null : null
  const by = (await db().query<{ name: string }>('SELECT p.full_name AS name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]?.name ?? user.email
  let attachment: string | null = null
  if (f) {
    const mime = f.type || 'application/octet-stream'
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(mime)) throw apiError('bad_type', 'Attach the invoice or receipt as a PDF or an image.')
    if (f.data.length > 20 * 1024 * 1024) throw apiError('too_large', 'Attachments can be up to 20 MB.', 413)
    attachment = randomUUID(); const key = 'documents/' + attachment + '.' + (mime === 'application/pdf' ? 'pdf' : mime.split('/')[1])
    await putObject({ key, body: new Uint8Array(f.data), contentType: mime })
    await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,$5,$6,$7)", [attachment, d.entity_id || null, (number + ' supporting ' + (f.filename ?? 'document')).replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200), key, mime, f.data.length, createHash('sha256').update(f.data).digest('hex')])
  }
  const voucher = await storePdf(await voucherPdf({ number, paid_on: d.paid_on, entity, payee: d.payee, category: d.category, description: d.description || null, amount: d.amount, currency: d.currency, method: d.method || null, account, reference: d.reference || null, by }), 'Payment voucher ' + number + ' - ' + d.payee + '.pdf', d.entity_id || null)
  const x = await one<{ id: string }>('INSERT INTO finance.expenses (number, paid_on, entity_id, payee, category, description, amount, currency, method, bank_account_id, reference, voucher_id, attachment_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
    [number, d.paid_on, d.entity_id || null, d.payee, d.category, d.description || null, d.amount, d.currency, d.method || null, d.bank_account_id || null, d.reference || null, voucher, attachment, user.userId])
  if (receipt) await saveReceiptCheck(x.id, receipt, receiptIssues)
  const memo = d.payee + ' · ' + d.category + ' · ' + number
  await db().query('INSERT INTO finance.journal (entity_id, entry_date, account, debit, credit, currency, memo, expense_id) VALUES ($1,$2,$3,$4,0,$5,$6,$7), ($1,$2,$8,0,$4,$5,$6,$7)', [d.entity_id || null, d.paid_on, 'Expense: ' + d.category, d.amount, d.currency, memo, x.id, 'Cash at bank'])
  await audit({ event, actorUserId: user.userId, action: 'expense.log', objectType: 'expense', objectId: x.id, detail: { amount: d.amount, currency: d.currency, payee: d.payee } })
  return { ok: true, id: x.id, number, voucher_id: voucher, receipt_issues: receiptIssues }
})
