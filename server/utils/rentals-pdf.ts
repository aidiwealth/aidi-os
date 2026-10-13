// The rentals P&L as a one-page PDF on Aidi letterhead (Aidi navy and blue, Garamond), for the accountant.
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Pnl } from './rentals'

const NAVY = rgb(12 / 255, 26 / 255, 46 / 255), BLUE = rgb(28 / 255, 84 / 255, 125 / 255), TINT = rgb(238 / 255, 244 / 255, 249 / 255), MUT = rgb(0.4, 0.43, 0.48), INK = rgb(0.1, 0.12, 0.16), RULE = rgb(0.86, 0.88, 0.91)
const clean = (s: string) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '-').replace(/[^\x20-\x7E -ÿ–\n]/g, '')
const money = (v: number) => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function pnlPdf(list: Pnl[], entity: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
  pdf.setTitle('Rental P&L'); pdf.setAuthor(clean(entity)); pdf.setProducer('Aidi OS')
  const reg = await pdf.embedFont(Buffer.from(GARAMOND_TTF.regular, 'base64'), { subset: true })
  const bold = await pdf.embedFont(Buffer.from(GARAMOND_TTF.semibold, 'base64'), { subset: true })
  const lg = LOGO_PNG.aidi, logo = await pdf.embedPng(Buffer.from(lg.b64, 'base64'))
  const W = 612, H = 792, M = 56
  for (const p of list) {
    const page = pdf.addPage([W, H])
    const text = (t: string, x: number, y: number, size = 11, font: PDFFont = reg, color = INK) => page.drawText(clean(t), { x, y, size, font, color })
    const right = (t: string, xr: number, y: number, size = 11, font: PDFFont = reg, color = INK) => text(t, xr - font.widthOfTextAtSize(clean(t), size), y, size, font, color)
    const lh = 26, lw = lh * lg.w / lg.h
    page.drawImage(logo, { x: M, y: H - M - lh + 6, width: lw, height: lh })
    right(entity, W - M, H - M - 2, 11, bold, NAVY); right('Rental & Real Estate', W - M, H - M - 16, 10, reg, MUT)
    let y = H - M - 62
    text('Profit & loss', M, y, 24, bold, NAVY); y -= 22
    text(p.title + '  ·  ' + p.label, M, y, 13, reg, BLUE); y -= 26
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 2, color: NAVY }); y -= 26
    const row = (label: string, v: number | null, o: { b?: boolean; indent?: boolean; muted?: boolean; band?: boolean } = {}) => {
      if (o.band) page.drawRectangle({ x: M, y: y - 7, width: W - 2 * M, height: 22, color: TINT })
      text(label, M + (o.indent ? 14 : 6), y, 12, o.b ? bold : reg, o.muted ? MUT : o.b ? NAVY : INK)
      if (v !== null) right(money(v), W - M - 6, y, 12, o.b ? bold : reg, o.muted ? MUT : INK)
      y -= 20; if (!o.band) page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.4, color: RULE })
    }
    const head = (t: string) => { y -= 6; text(t.toUpperCase(), M + 6, y, 9.5, bold, BLUE); y -= 16 }
    head('Income')
    row('Airbnb gross earnings', p.gross, { indent: true }); row('Adjustments', p.adjustments, { indent: true }); row('Airbnb service fees', -p.fees, { indent: true })
    row('Airbnb net earnings', p.airbnb_net, { indent: true }); row('Rent received', p.rent, { indent: true }); if (p.books_income) row('Airbnb deposits in the bank (months without Airbnb files)', p.books_income, { indent: true }); row('Total income', p.income, { b: true, band: true })
    head('Expenses')
    if (!p.expenses.length) row('No expenses logged', null, { indent: true, muted: true })
    for (const e of p.expenses) row(e.label, -e.v, { indent: true })
    row('Total expenses', -p.expense_total, { b: true, band: true })
    y -= 8; row('Profit', p.profit, { b: true, band: true }); y -= 14
    head('For information')
    row('Airbnb remitted taxes (collected and paid by Airbnb on our behalf; not income)', p.tax, { indent: true, muted: true })
    row('Nights booked', null, { indent: true, muted: true }); right(String(p.nights), W - M - 6, y + 20, 12, reg, MUT)
    page.drawLine({ start: { x: M, y: 70 }, end: { x: W - M, y: 70 }, thickness: 0.6, color: RULE })
    text('Prepared from Airbnb transaction history and Earnings reports, rent records and logged expenses in Aidi OS.', M, 54, 9, reg, MUT)
    right('Generated ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W - M, 42, 9, reg, MUT)
  }
  return pdf.save()
}
