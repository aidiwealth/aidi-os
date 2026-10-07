// Wealth client: their invoices and receipts.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) return []
  const rows = (await db().query<{ id: string; number: string | null; kind: string; period: string | null; amount: number; currency: string; status: string; paid_on: string | null; invoice_doc_id: string | null; receipt_doc_id: string | null; method: string | null }>("SELECT id, number, kind, period, amount::float AS amount, currency, status, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, invoice_doc_id, receipt_doc_id, method FROM wm.fees WHERE client_id = $1 AND number IS NOT NULL ORDER BY created_at DESC", [id])).rows
  return rows.map((r) => ({ ...r, pay_url: r.status === 'due' && r.method !== 'transfer' ? '/wpay/' + wmPayToken(r.id) : null }))
})
