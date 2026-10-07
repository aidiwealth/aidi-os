// An invoice as a typeset PDF (issuer, bill to, dates, line items, total, status, notes, payment details).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
export interface InvoicePdf { title?: string; number: string; issue_date: string; due_date?: string | null; status?: string | null; paid_at?: string | null; currency: string; issuer: { name: string; address?: string; email?: string; phone?: string }; bill_to: { name: string; email?: string; address?: string }; lines: { description: string; quantity: number; unit_amount: number; amount: number }[]; amount: number; note?: string | null; payment?: string | null; period?: string | null }
const clean = (s: string) => String(s ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u20A6/g, 'NGN ').replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, '')
export async function invoicePdf(inv: InvoicePdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.setTitle('Invoice ' + clean(inv.number)); pdf.setProducer('Finvry')
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 612, H = 792, M = 56, ink = rgb(0.06, 0.1, 0.18), mut = rgb(0.42, 0.45, 0.5), blue = rgb(0.05, 0.1, 0.18)
  let page = pdf.addPage([W, H]); let y = H - M
  const sym = inv.currency === 'USD' ? '$' : inv.currency === 'NGN' ? 'NGN ' : inv.currency + ' '
  const money = (v: number) => sym + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const text = (t: string, x: number, yy: number, size = 10, font = reg, color = ink) => page.drawText(clean(t), { x, y: yy, size, font, color })
  const right = (t: string, xr: number, yy: number, size = 10, font = reg, color = ink) => text(t, xr - font.widthOfTextAtSize(clean(t), size), yy, size, font, color)
  const wrap = (t: string, width: number, size = 10, font = reg) => { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const tt = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(tt, size) > width && line) { out.push(line); line = w } else line = tt } out.push(line) } return out }
  text(inv.issuer.name, M, y, 15, bold, blue); right(inv.title ?? 'INVOICE', W - M, y, 20, bold, blue); y -= 18
  let iy = y; for (const l of [inv.issuer.address, inv.issuer.email, inv.issuer.phone].filter(Boolean) as string[]) for (const s of wrap(l, 260, 9)) { text(s, M, iy, 9, reg, mut); iy -= 12 }
  let ry = y; for (const [k, v] of [['Invoice no.', inv.number], ['Issue date', inv.issue_date], ...(inv.due_date ? [['Due date', inv.due_date]] : []), ...(inv.period ? [['Period', inv.period]] : [])] as [string, string][]) { right(k, W - M - 120, ry, 9, reg, mut); right(v, W - M, ry, 9, bold); ry -= 13 }
  y = Math.min(iy, ry) - 16
  if (inv.status === 'paid') { page.drawRectangle({ x: W - M - 90, y: y - 2, width: 90, height: 22, borderColor: rgb(0.12, 0.48, 0.3), borderWidth: 1.5 }); text('PAID' + (inv.paid_at ? ' ' + inv.paid_at : ''), W - M - 84, y + 5, 8.5, bold, rgb(0.12, 0.48, 0.3)) }
  text('BILL TO', M, y, 8, bold, mut); y -= 14; text(inv.bill_to.name, M, y, 11, bold); y -= 13
  for (const l of [inv.bill_to.email, inv.bill_to.address].filter(Boolean) as string[]) for (const s of wrap(l, 300, 9)) { text(s, M, y, 9, reg, mut); y -= 12 }
  y -= 16
  const cx = [M, W - M - 230, W - M - 140, W - M]
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.93, 0.95, 0.98) })
  text('Description', cx[0]! + 8, y, 9, bold); right('Qty', cx[1]! + 40, y, 9, bold); right('Unit price', cx[2]! + 60, y, 9, bold); right('Amount', cx[3]! - 8, y, 9, bold); y -= 24
  for (const l of inv.lines ?? []) {
    const ls = wrap(l.description, cx[1]! - cx[0]! - 20, 10)
    if (y - ls.length * 13 < M + 120) { page = pdf.addPage([W, H]); y = H - M }
    ls.forEach((s, i) => text(s, cx[0]! + 8, y - i * 13, 10))
    right(String(l.quantity ?? 1), cx[1]! + 40, y, 10); right(money(l.unit_amount ?? l.amount), cx[2]! + 60, y, 10); right(money(l.amount), cx[3]! - 8, y, 10)
    const bottom = y - (ls.length - 1) * 13 - 7; page.drawLine({ start: { x: M, y: bottom }, end: { x: W - M, y: bottom }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) }); y = bottom - 15
  }
  y -= 10; right('Total', W - M - 120, y, 11, bold); right(money(inv.amount), W - M - 8, y, 13, bold, blue); y -= 30
  for (const [h, body] of [['Notes', inv.note], ['Payment details', inv.payment]] as [string, string | null | undefined][]) {
    if (!body) continue; if (y < M + 60) { page = pdf.addPage([W, H]); y = H - M }
    text(h.toUpperCase(), M, y, 8, bold, mut); y -= 13; for (const s of wrap(body, W - 2 * M, 9.5)) { text(s, M, y, 9.5); y -= 12.5 } y -= 10
  }
  const pages = pdf.getPages(); pages.forEach((p, i) => { const t = clean(inv.issuer.name) + '  ·  Invoice ' + clean(inv.number) + '  ·  page ' + (i + 1) + ' of ' + pages.length; p.drawText(t, { x: (W - reg.widthOfTextAtSize(t, 7.5)) / 2, y: 30, size: 7.5, font: reg, color: mut }) })
  return pdf.save()
}
