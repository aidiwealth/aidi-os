// Payments out (vendors, landlord, purchases…): voucher PDF and book entries.
import { createHash, randomUUID } from 'node:crypto'
export const EXPENSE_CATEGORIES = ['Rent & office', 'Software & subscriptions', 'Professional fees', 'Salaries & contractors', 'Equipment & purchases', 'Travel', 'Marketing', 'Utilities & internet', 'Bank charges', 'Taxes & government fees', 'Insurance', 'Other']
export async function storePdf(bytes: Uint8Array, title: string, entityId: string | null): Promise<string> {
  const id = randomUUID(), key = 'documents/' + id + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6)", [id, entityId, title.replace(/[^A-Za-z0-9 ._()&,-]/g, '').slice(0, 200), key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  return id
}
export async function voucherPdf(e: { number: string; paid_on: string; entity: string | null; payee: string; category: string; description: string | null; amount: number; currency: string; method: string | null; account: string | null; reference: string | null; by: string }): Promise<Uint8Array> {
  const amt = new Intl.NumberFormat('en-US', { style: 'currency', currency: e.currency, minimumFractionDigits: 2 }).format(e.amount).replace('₦', 'NGN ')
  const md = ['# Payment voucher', '', '**' + e.number + '**', '',
    '| Detail | |', '|---|---|', '| Date paid | ' + e.paid_on + ' |', '| Paid by | ' + (e.entity ?? '-') + ' |', '| Paid to | ' + e.payee + ' |', '| Category | ' + e.category + ' |', '| Amount | ' + amt + ' |',
    '| Method | ' + (e.method ?? '-') + ' |', '| From account | ' + (e.account ?? '-') + ' |', '| Reference | ' + (e.reference ?? '-') + ' |', '',
    '## Description', '', e.description || '-', '', '## Approval', '', 'Prepared by: ' + e.by, '', 'Approved by: ______________________________', '', 'Date: ______________________________', '',
    'This voucher records a payment logged in Aidi OS and posted to the books (expense against cash at bank).']
  return legalPdf(e.entity ?? 'The Aidi Group', [{ title: 'Payment voucher ' + e.number, md: md.join('\n') }])
}
