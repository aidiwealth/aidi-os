// PDFs: stamping a viewer watermark onto every page, and writing a simple document (headings, paragraphs, bullets).
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { mdPlain } from '../../shared/markdown'
export async function stampPdf(bytes: Uint8Array, mark: string, footer: string): Promise<Uint8Array> {
  const latin = (s: string) => s.replace(/[^\x20-\xFF]/g, '?')
  mark = latin(mark); footer = latin(footer)
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await pdf.embedFont(StandardFonts.HelveticaBold), small = await pdf.embedFont(StandardFonts.Helvetica)
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    const size = Math.max(14, Math.min(26, width / 28)), tw = font.widthOfTextAtSize(mark, size)
    for (let y = -height; y < height * 1.6; y += size * 7) for (let x = -width; x < width * 1.4; x += tw + size * 4)
      page.drawText(mark, { x, y, size, font, color: rgb(0.05, 0.1, 0.18), opacity: 0.11, rotate: degrees(30) })
    page.drawText(footer, { x: 24, y: 12, size: 7.5, font: small, color: rgb(0.35, 0.35, 0.35), opacity: 0.9 })
  }
  return pdf.save()
}
export async function markdownPdf(title: string, md: string, company: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title); pdf.setProducer('Finvry'); pdf.setCreator(company)
  const reg = await pdf.embedFont(StandardFonts.TimesRoman), bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const W = 595.28, H = 841.89, M = 64, maxW = W - M * 2
  let page = pdf.addPage([W, H]), y = H - M
  const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, (c) => ({ '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u2022': '-', '\u2026': '...', '\u20A6': 'NGN ' } as Record<string, string>)[c] ?? '')
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M }
  const lineOut = (text: string, font = reg, size = 11, indent = 0, gap = 4) => {
    const words = clean(text).split(/\s+/).filter(Boolean); let line = ''
    const flush = () => { if (y < M + size) newPage(); page.drawText(line, { x: M + indent, y, size, font, color: rgb(0.1, 0.1, 0.12) }); y -= size + gap; line = '' }
    for (const word of words) { const t = line ? line + ' ' + word : word; if (font.widthOfTextAtSize(t, size) > maxW - indent && line) { flush(); line = word } else line = t }
    if (line) flush()
  }
  lineOut(title, bold, 17, 0, 10); y -= 6
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l) { y -= 6; continue }
    const h = l.match(/^(#{1,3})\s+(.*)$/)
    if (h) { y -= 6; lineOut(mdPlain(h[2]!), bold, h[1]!.length === 1 ? 14 : 12.5, 0, 6); continue }
    if (/^[-*+]\s+/.test(l) && !/^(-{3,}|\*{3,})$/.test(l)) { lineOut('-  ' + mdPlain(l.replace(/^[-*+]\s+/, '')), reg, 11, 12); continue }
    const ol = l.match(/^(\d+)[.)]\s+(.*)$/); if (ol) { lineOut(ol[1] + '.  ' + mdPlain(ol[2]!), reg, 11, 12); continue }
    if (/^>\s?/.test(l)) { lineOut(mdPlain(l.replace(/^>\s?/, '')), reg, 11, 18); continue }
    if (/^(_{3,}|-{3,}|\*{3,})$/.test(l)) { if (y < M + 20) newPage(); page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + 220, y: y + 4 }, thickness: 0.6, color: rgb(0.2, 0.2, 0.2) }); y -= 14; continue }
    lineOut(mdPlain(l), /^\*\*.*\*\*$/.test(l) ? bold : reg, 11, 0, 5)
  }
  const pages = pdf.getPages(), small = await pdf.embedFont(StandardFonts.Helvetica)
  pages.forEach((p, i) => p.drawText(clean(company) + ' · ' + clean(title) + ' · page ' + (i + 1) + ' of ' + pages.length, { x: M, y: 30, size: 7.5, font: small, color: rgb(0.45, 0.45, 0.45) }))
  return pdf.save()
}
