// Turn what is on screen into a proper PDF: { kind: 'doc', title, company, md } or { kind: 'invoice', invoice }.
import { z } from 'zod'
const line = z.object({ description: z.string().max(1000), quantity: z.coerce.number(), unit_amount: z.coerce.number(), amount: z.coerce.number() })
const S = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('doc'), title: z.string().trim().min(1).max(200), company: z.string().trim().max(200).default(''), md: z.string().max(300000), filename: z.string().max(150).optional() }),
  z.object({ kind: z.literal('invoice'), filename: z.string().max(150).optional(), invoice: z.object({ number: z.string().max(60), issue_date: z.string().max(40), due_date: z.string().max(40).nullable().optional(), status: z.string().max(30).nullable().optional(), paid_at: z.string().max(40).nullable().optional(), currency: z.string().max(5),
    issuer: z.object({ name: z.string().max(200), address: z.string().max(500).optional(), email: z.string().max(254).optional(), phone: z.string().max(60).optional() }), bill_to: z.object({ name: z.string().max(200), email: z.string().max(254).optional(), address: z.string().max(500).optional() }),
    lines: z.array(line).max(200), amount: z.coerce.number(), note: z.string().max(5000).nullable().optional(), payment: z.string().max(3000).nullable().optional(), period: z.string().max(80).nullable().optional() }) })])
export async function renderPdfRequest(event: Parameters<typeof readBody>[0]) {
  const b = S.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Could not build the PDF.')
  const d = b.data
  const bytes = d.kind === 'doc' ? await legalPdf(d.company || d.title, [{ title: d.title, md: d.md }]) : await invoicePdf(d.invoice as InvoicePdf)
  const name = (d.filename || (d.kind === 'doc' ? d.title : 'Invoice ' + d.invoice.number)).replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 120) || 'document'
  setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'cache-control', 'no-store'); setHeader(event, 'content-disposition', 'attachment; filename="' + name + '.pdf"')
  return Buffer.from(bytes)
}
