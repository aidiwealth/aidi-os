// Receipts and invoices attached to payments: AI reads the receipt number, amount, currency, date and payee,
// and the result is compared with what was logged. Results are cached briefly by file hash so a scan in the form
// and the save that follows read the file once.
import { createHash } from 'node:crypto'
import { z } from 'zod'

export interface ReceiptRead { number: string | null; amount: number | null; currency: string | null; date: string | null; payee: string | null; readable: boolean }
const Read = z.object({ readable: z.boolean(), number: z.string().nullable(), amount: z.number().nullable(), currency: z.string().nullable(), date: z.string().nullable(), payee: z.string().nullable() })
const SCHEMA = {
  type: 'object', required: ['readable', 'number', 'amount', 'currency', 'date', 'payee'],
  properties: {
    readable: { type: 'boolean', description: 'false if this is not a receipt, invoice or payment confirmation, or cannot be read' },
    number: { type: ['string', 'null'], description: 'Receipt, invoice or transaction reference number exactly as printed' },
    amount: { type: ['number', 'null'], description: 'Total amount paid or due (the grand total including tax)' },
    currency: { type: ['string', 'null'], description: 'ISO 4217 code, e.g. USD, NGN, GBP' },
    date: { type: ['string', 'null'], description: 'Payment or invoice date, YYYY-MM-DD' },
    payee: { type: ['string', 'null'], description: 'Who was paid (the seller / issuer)' }
  }
}
const cache = new Map<string, { at: number; read: ReceiptRead }>()
export const fileHash = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex')

export async function readReceipt(buf: Uint8Array, mime: string): Promise<ReceiptRead> {
  const h = fileHash(buf)
  const hit = cache.get(h)
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.read
  const data = Buffer.from(buf).toString('base64')
  const block = mime === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: mime, data } }
  const { output } = await runAiTool<z.infer<typeof Read>>({
    task: 'receipt_read', model: useRuntimeConfig().aiModelPitchScreen, promptVersion: 'receipt-read-v1', inputRef: 'receipt:' + h.slice(0, 16),
    system: 'You read receipts, invoices and payment confirmations. Copy the receipt or invoice number, the grand total, the currency, the date and who issued it exactly as printed. Never guess: use null for anything not printed.',
    user: '', userContent: [block, { type: 'text', text: 'Read this document.' }],
    toolName: 'record_receipt', toolDescription: 'Record what the receipt says.', jsonSchema: SCHEMA, schema: Read, maxTokens: 600
  })
  const read: ReceiptRead = { ...output, currency: output.currency ? output.currency.toUpperCase().slice(0, 3) : null, date: output.date && /^\d{4}-\d{2}-\d{2}$/.test(output.date) ? output.date : null }
  cache.set(h, { at: Date.now(), read })
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  return read
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['ltd', 'limited', 'inc', 'llc', 'the', 'and', 'plc', 'company'].includes(w)))

// Differences between the payment as logged and its receipt. Empty when they agree.
export function compareReceipt(logged: { amount: number; currency: string; reference: string | null; paid_on: string; payee: string }, r: ReceiptRead): string[] {
  if (!r.readable) return ['The attached file could not be read as a receipt or invoice.']
  const out: string[] = []
  const fmt = (v: number, c: string) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(v) } catch { return c + ' ' + v.toFixed(2) } }
  if (r.currency && r.currency !== logged.currency) out.push('Receipt is in ' + r.currency + ' but the payment was logged in ' + logged.currency + '.')
  if (r.amount !== null && Math.abs(r.amount - logged.amount) >= 0.01) out.push('Receipt total is ' + fmt(r.amount, r.currency || logged.currency) + ' but ' + fmt(logged.amount, logged.currency) + ' was logged.')
  if (r.number && logged.reference && !norm(logged.reference).includes(norm(r.number)) && !norm(r.number).includes(norm(logged.reference))) out.push('Receipt number is ' + r.number + ' but the reference logged is ' + logged.reference + '.')
  if (r.date) { const days = Math.abs(new Date(r.date).getTime() - new Date(logged.paid_on).getTime()) / 864e5; if (days > 31) out.push('Receipt is dated ' + r.date + ', ' + Math.round(days) + ' days from the payment date ' + logged.paid_on + '.') }
  if (r.payee) { const a = words(r.payee), b = words(logged.payee); if (a.size && b.size && ![...a].some((w) => b.has(w))) out.push('Receipt is from "' + r.payee + '" but the payment is to "' + logged.payee + '".') }
  return out
}

export async function saveReceiptCheck(expenseId: string, r: ReceiptRead, issues: string[]): Promise<void> {
  await db().query('UPDATE finance.expenses SET receipt_number = $2, receipt_amount = $3, receipt_currency = $4, receipt_date = $5, receipt_payee = $6, receipt_status = $7, receipt_issues = $8 WHERE id = $1',
    [expenseId, r.number, r.amount, r.currency, r.date, r.payee, !r.readable ? 'unreadable' : issues.length ? 'mismatch' : 'match', JSON.stringify(issues)])
}
