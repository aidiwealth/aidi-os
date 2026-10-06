// Legal documents as a properly typeset PDF: centred title, section headings, paragraphs with bold runs, notes, signature
// blocks, page numbers. Several documents go into one file, each starting on a new page.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
const clean = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2022/g, '-').replace(/\u2026/g, '...').replace(/\u20A6/g, 'NGN ').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
export async function legalPdf(company: string, docs: { title: string; md: string }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(docs.map((d) => d.title).join(' + ')); pdf.setProducer('Finvry'); pdf.setCreator(clean(company))
  const reg = await pdf.embedFont(StandardFonts.TimesRoman), bold = await pdf.embedFont(StandardFonts.TimesRomanBold), ital = await pdf.embedFont(StandardFonts.TimesRomanItalic), sans = await pdf.embedFont(StandardFonts.Helvetica)
  const W = 612, H = 792, M = 72, maxW = W - M * 2, ink = rgb(0.08, 0.09, 0.12)
  let page!: PDFPage, y = 0
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M }
  const need = (h: number) => { if (y - h < M) newPage() }
  // words with fonts; wraps across fonts; optional justification
  const para = (runs: { t: string; f: PDFFont }[], size = 11, indent = 0, lead = 15, justify = true) => {
    // words are lists of segments so punctuation right after a bold run stays attached ("2026," not "2026 ,")
    type Seg = { w: string; f: PDFFont }; const words: Seg[][] = []; let sp = true
    for (const r of runs) { const txt = clean(r.t); if (/^\s/.test(txt)) sp = true
      for (const p of txt.split(/(\s+)/)) { if (!p) continue; if (/^\s+$/.test(p)) { sp = true; continue } if (!sp && words.length) words[words.length - 1]!.push({ w: p, f: r.f }); else words.push([{ w: p, f: r.f }]); sp = false } }
    const wOf = (k: Seg[]) => k.reduce((a, s) => a + s.f.widthOfTextAtSize(s.w, size), 0)
    let line: Seg[][] = [], width = 0
    const space = reg.widthOfTextAtSize(' ', size)
    const draw = (ws: Seg[][], last: boolean) => {
      need(lead); let x = M + indent
      const textW = ws.reduce((a, k) => a + wOf(k), 0), gaps = ws.length - 1
      const gap = justify && !last && gaps > 0 ? Math.min((maxW - indent - textW) / gaps, space * 3) : space
      for (const k of ws) { for (const s of k) { page.drawText(s.w, { x, y, size, font: s.f, color: ink }); x += s.f.widthOfTextAtSize(s.w, size) } x += gap }
      y -= lead
    }
    for (const k of words) { const ww = wOf(k); if (line.length && width + space + ww > maxW - indent) { draw(line, false); line = []; width = 0 } width += (line.length ? space : 0) + ww; line.push(k) }
    if (line.length) draw(line, true)
  }
  const runs = (s: string, base: PDFFont = reg) => s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith('**') ? { t: p.slice(2, -2), f: bold } : { t: p.replace(/\*/g, ''), f: base }))
  for (const doc of docs) {
    newPage()
    const lines = doc.md.split(/\r?\n/)
    let tbl: string[][] = []
    const flushTable = () => {
      if (!tbl.length) return
      const cols = Math.max(...tbl.map((r) => r.length)), cw = maxW / cols, size = 9.5, pad = 5
      tbl.forEach((row, ri) => {
        const font = ri === 0 ? bold : reg
        const cells = Array.from({ length: cols }, (_, c) => clean(row[c] ?? '').replace(/\*\*/g, ''))
        const wrapped = cells.map((c) => { const out: string[] = []; let line = ''; for (const w of c.split(/\s+/).filter(Boolean)) { const t2 = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t2, size) > cw - pad * 2 && line) { out.push(line); line = w } else line = t2 } if (line) out.push(line); return out.length ? out : [''] })
        const h = Math.max(...wrapped.map((w) => w.length)) * (size + 3) + pad * 2
        need(h)
        if (ri === 0) page.drawRectangle({ x: M, y: y - h + size + 2, width: maxW, height: h, color: rgb(0.93, 0.95, 0.98) })
        wrapped.forEach((ls, c) => ls.forEach((s, k) => page.drawText(s, { x: M + c * cw + pad, y: y - pad - k * (size + 3), size, font, color: ink })))
        page.drawLine({ start: { x: M, y: y - h + size + 2 }, end: { x: M + maxW, y: y - h + size + 2 }, thickness: 0.4, color: rgb(0.8, 0.8, 0.8) })
        y -= h
      })
      y -= 8; tbl = []
    }
    for (const raw of lines) {
      const l = raw.trim()
      if (/^\|.*\|$/.test(l)) { if (!/^\|[\s:|-]+\|$/.test(l)) tbl.push(l.slice(1, -1).split('|').map((c) => c.trim())); continue }
      flushTable()
      if (!l) { y -= 5; continue }
      if (l.startsWith('# ')) { const t = clean(l.slice(2)); need(40); const s = 16, tw = bold.widthOfTextAtSize(t, s); page.drawText(t, { x: (W - tw) / 2, y, size: s, font: bold, color: ink }); y -= 26; continue }
      if (l.startsWith('## ')) { y -= 6; need(30); page.drawText(clean(l.slice(3)), { x: M, y, size: 12, font: bold, color: ink }); y -= 18; continue }
      if (l.startsWith('> ')) { const startY = y; const top = y + 11; para([{ t: l.slice(2), f: ital }], 9, 10, 12, false); page.drawRectangle({ x: M, y: y + 6, width: 2, height: top - y - 6, color: rgb(0.11, 0.31, 0.61) }); void startY; y -= 4; continue }
      if (/^\*\*[^*]+\*\*$/.test(l) && !/^\*\*\(/.test(l)) { const t = clean(l.slice(2, -2)); need(18); if (/^(Company|Investor|Agreed|Accepted)/.test(t)) { y -= 8; need(110) } const tw = bold.widthOfTextAtSize(t, 11); page.drawText(t, { x: /SAFE|Valuation|Discount|MFN/.test(t) && !/^(Company|Investor)/.test(t) ? (W - tw) / 2 : M, y, size: 11, font: bold, color: ink }); y -= 16; continue }
      if (/^(By|Name|Title|Date|Email):/.test(l)) { para(runs(l), 11, 0, 17, false); continue }
      if (/^[A-Z0-9 ,.()'"-]{40,}$/.test(l)) { para([{ t: l, f: bold }], 8.5, 0, 11, true); continue }
      para(runs(l), 11, 0, 15, true)
    }
    flushTable()
  }
  const pages = pdf.getPages()
  pages.forEach((p, i) => { const t = clean(company) + '  ·  page ' + (i + 1) + ' of ' + pages.length; p.drawText(t, { x: (W - sans.widthOfTextAtSize(t, 8)) / 2, y: 36, size: 8, font: sans, color: rgb(0.45, 0.45, 0.45) }) })
  return pdf.save()
}
