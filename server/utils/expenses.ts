// Payments out (vendors, landlord, purchases…): voucher PDF and book entries.
import { createHash, randomUUID } from 'node:crypto'
export const EXPENSE_CATEGORIES = ['Rent & office', 'Software & subscriptions', 'Professional fees', 'Salaries & contractors', 'Equipment & purchases', 'Travel', 'Marketing', 'Utilities & internet', 'Bank charges', 'Taxes & government fees', 'Insurance', 'Other']
// Which line of the financial statements each category belongs to, so payments, journals and statements balance.
export const STATEMENT_LINES = { cogs: 'Cost of sales', opex_payroll: 'Payroll', opex_marketing: 'Sales & marketing', opex_rnd: 'Research & development', opex_ga: 'General & admin', opex_other: 'Other operating costs' } as const
export type StatementLine = keyof typeof STATEMENT_LINES
const BUILTIN_LINE: Record<string, StatementLine> = { 'Rent & office': 'opex_ga', 'Software & subscriptions': 'opex_ga', 'Professional fees': 'opex_ga', 'Salaries & contractors': 'opex_payroll', 'Equipment & purchases': 'opex_other', Travel: 'opex_ga', Marketing: 'opex_marketing', 'Utilities & internet': 'opex_ga', 'Bank charges': 'opex_ga', 'Taxes & government fees': 'opex_other', Insurance: 'opex_ga', Other: 'opex_other' }
export interface ExpenseCategory { id: string | null; name: string; line: StatementLine; builtin: boolean; archived: boolean }
// Built-in categories plus the ones this workspace added (archived ones are kept for old payments but not offered).
export async function expenseCategories(includeArchived = false): Promise<ExpenseCategory[]> {
  const custom = (await db().query<{ id: string; name: string; statement_line: StatementLine; archived: boolean }>('SELECT id, name, statement_line, archived FROM finance.expense_categories ORDER BY name').catch(() => ({ rows: [] }))).rows
  const out: ExpenseCategory[] = EXPENSE_CATEGORIES.map((n) => ({ id: null, name: n, line: BUILTIN_LINE[n] ?? 'opex_other', builtin: true, archived: false }))
  for (const c of custom) if (!EXPENSE_CATEGORIES.includes(c.name) && (includeArchived || !c.archived)) out.splice(out.length - 1, 0, { id: c.id, name: c.name, line: c.statement_line, builtin: false, archived: c.archived })
  return out
}
export async function expenseCategoryNames(): Promise<string[]> { return (await expenseCategories()).map((c) => c.name) }
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
