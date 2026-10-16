// Public pages download a typeset PDF, but only of their own record: a bill is rebuilt on the server from its pay
// link (never from figures the browser sends), and an investor statement needs a valid LP portal link. Anything
// else is refused, so the endpoint cannot be used to make branded invoices or documents. Rate limited.
import { createHash } from 'node:crypto'
import { invoiceForPdf } from '~/utils/pdfDownload'
export default defineEventHandler(async (event) => {
  rateLimit('pub_pdf', clientIp(event), 40, 60 * 60 * 1000)
  const body = (await readBody(event).catch(() => null)) as Record<string, unknown> | null
  const bill = typeof body?.bill_token === 'string' ? body.bill_token : '', lpTok = typeof body?.lp_token === 'string' ? body.lp_token : ''
  if (bill) {
    const id = billIdFromToken(bill)
    const org = id ? (await asPlatform(() => db().query<{ organization_id: string }>("SELECT organization_id FROM services.invoices WHERE id = $1 AND status <> 'draft'", [id]))).rows[0] : null
    if (!id || !org) throw apiError('invalid_link', 'This link is not valid.', 404)
    setOrgContext(org.organization_id)
    const inv = await loadCsInvoice(id)
    if (!inv) throw apiError('invalid_link', 'This link is not valid.', 404)
    const pdfInv = invoiceForPdf({ ...inv }) as unknown as InvoicePdf, brand = pdfInv.brand ?? hostBrand(event)
    const bytes = await invoicePdf({ ...pdfInv, brand, footer: brand === 'finvry' ? pdfInv.footer ?? null : null })
    setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'cache-control', 'no-store'); setHeader(event, 'content-disposition', 'attachment; filename="Invoice ' + String(inv.number).replace(/[^A-Za-z0-9 ._-]/g, '') + '.pdf"')
    return Buffer.from(bytes)
  }
  if (lpTok.length >= 20) {
    const previewLp = lpTok.startsWith('pv.') ? readLpPreview(lpTok) : null
    const lp = (await asPlatform(() => db().query<{ id: string; expired: boolean }>(previewLp ? 'SELECT id, false AS expired FROM funds.lps WHERE id = $1' : 'SELECT id, (portal_token_expires < now()) AS expired FROM funds.lps WHERE portal_token_hash = $1', [previewLp ?? createHash('sha256').update(lpTok).digest('hex')]))).rows[0]
    if (!lp || lp.expired) throw apiError('invalid_link', 'This link is not valid.', 404)
    return renderPdfRequest(event, 'doc')
  }
  throw apiError('invalid_link', 'This link is not valid.', 404)
})
