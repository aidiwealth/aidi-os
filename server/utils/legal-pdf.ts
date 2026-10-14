// Text documents (minutes, agreements, SAFEs, vouchers, letters) as a typeset PDF in the site's typeface (Instrument
// Sans): optional brand logo, centred title, section headings (##), subheadings (###), paragraphs with bold runs, notes,
// tables, signature blocks, page numbers. Several documents go into one file, each starting on a new page.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
const clean = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2022/g, '-').replace(/\u2026/g, '...').replace(/\u20A6/g, 'NGN ').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
export interface DocHeader { eyebrow?: string; badge?: string; fields: { label: string; value: string; wide?: boolean }[] }
export async function legalPdf(company: string, docs: { title: string; md: string; header?: DocHeader }[], opts: { logo?: 'aidi' | 'finvry' | null } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit)
  pdf.setTitle(docs.map((d) => d.title).join(' + ')); pdf.setProducer(opts.logo === 'aidi' ? 'Aidi OS' : 'Finvry'); pdf.setCreator(clean(company))
  const reg = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.regular, 'base64'), { subset: true }), bold = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.semibold, 'base64'), { subset: true })
  const ital = await pdf.embedFont(Buffer.from(INSTRUMENT_TTF.italic, 'base64'), { subset: true }), sans = reg
  const lg = opts.logo ? LOGO_PNG[opts.logo] : null, logo = lg ? await pdf.embedPng(Buffer.from(lg.b64, 'base64')) : null
  const W = 612, H = 792, M = 64, maxW = W - M * 2, ink = rgb(0.08, 0.09, 0.12), navy = rgb(12 / 255, 26 / 255, 46 / 255), blue = rgb(28 / 255, 84 / 255, 125 / 255), rule = rgb(0.86, 0.88, 0.91)
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
    if (logo && lg) {
      // Letterhead: logo left, company right (vertically centred on the logo), a rule, then room before the title.
      const lh = 26, lw = lh * lg.w / lg.h, top = H - 54
      page.drawImage(logo, { x: M, y: top - lh, width: lw, height: lh })
      const c = clean(company), cw = sans.widthOfTextAtSize(c, 9); page.drawText(c, { x: W - M - cw, y: top - lh / 2 - 3, size: 9, font: sans, color: rgb(0.45, 0.45, 0.45) })
      const ry = top - lh - 18; page.drawLine({ start: { x: M, y: ry }, end: { x: W - M, y: ry }, thickness: 0.6, color: rule }); y = ry - 40
    }
    if (doc.header) {
      // Title block: small eyebrow, large left-aligned title (wraps), a status badge, then a tinted panel of details.
      const h = doc.header
      if (h.eyebrow) { page.drawText(clean(h.eyebrow).toUpperCase(), { x: M, y, size: 8.5, font: bold, color: blue }); y -= 22 }
      const ts = 21, words = clean(doc.title).split(/\s+/), tl: string[] = []; let cur = ''
      const badgeW = h.badge ? bold.widthOfTextAtSize(h.badge.toUpperCase(), 8) + 16 : 0
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (bold.widthOfTextAtSize(t, ts) > maxW - badgeW - 10 && cur) { tl.push(cur); cur = w } else cur = t } if (cur) tl.push(cur)
      tl.forEach((t, i) => { page.drawText(t, { x: M, y, size: ts, font: bold, color: navy }); if (i === 0 && h.badge) { const bx = W - M - badgeW; page.drawRectangle({ x: bx, y: y - 3, width: badgeW, height: 16, color: rgb(1, 0.965, 0.9) }); page.drawText(h.badge.toUpperCase(), { x: bx + 8, y: y + 2, size: 8, font: bold, color: rgb(0.65, 0.4, 0.04) }) } y -= ts + 5 })
      y -= 12
      if (h.fields.length) {
        const pad = 14, colW = (maxW - pad * 2 - 16) / 2, ls = 7.5, vs = 10, vl = 13.5
        const wrapV = (t: string, w: number) => { const out: string[] = []; let c2 = ''; for (const x of clean(t).split(/\s+/).filter(Boolean)) { const t2 = c2 ? c2 + ' ' + x : x; if (reg.widthOfTextAtSize(t2, vs) > w && c2) { out.push(c2); c2 = x } else c2 = t2 } if (c2) out.push(c2); return out.length ? out : ['-'] }
        type Cell = { label: string; lines: string[]; wide: boolean }
        const rows: Cell[][] = []; let row: Cell[] = []
        for (const fl of h.fields) { const wide = !!fl.wide; const cell = { label: fl.label, lines: wrapV(fl.value, wide ? maxW - pad * 2 : colW), wide }; if (wide) { if (row.length) rows.push(row); rows.push([cell]); row = [] } else { row.push(cell); if (row.length === 2) { rows.push(row); row = [] } } }
        if (row.length) rows.push(row)
        const rh = (r: Cell[]) => 16 + Math.max(...r.map((c) => c.lines.length)) * vl
        const total = rows.reduce((a, r) => a + rh(r), 0) + pad * 2 - 2
        need(total + 10)
        page.drawRectangle({ x: M, y: y - total, width: maxW, height: total, color: rgb(238 / 255, 244 / 255, 249 / 255) })
        page.drawRectangle({ x: M, y: y - total, width: 3, height: total, color: blue })
        let yy = y - pad - 4
        for (const r of rows) { r.forEach((c, i) => { const x = M + pad + 4 + (c.wide ? 0 : i * (colW + 16)); page.drawText(c.label.toUpperCase(), { x, y: yy, size: ls, font: bold, color: rgb(0.42, 0.45, 0.5) }); c.lines.forEach((ln, k) => page.drawText(ln, { x, y: yy - 13 - k * vl, size: vs, font: reg, color: ink })) }); yy -= rh(r) }
        y -= total + 22
      }
    }
    const lines = doc.md.split(/\r?\n/)
    let tbl: string[][] = []
    const flushTable = () => {
      if (!tbl.length) return
      const cols = Math.max(...tbl.map((r) => r.length)), size = cols > 6 ? 8 : 9.5, pad = cols > 6 ? 4 : 5
      // Columns as wide as their content (long text capped); spare width goes to the first column, and when the
      // content is too wide every column shrinks in proportion and text wraps. Numbers are right-aligned.
      const txt = (r: string[], c: number) => clean(r[c] ?? '').replace(/\*\*/g, '')
      const nat = Array.from({ length: cols }, (_, c) => Math.min(maxW * 0.6, Math.max(24, ...tbl.map((r, ri) => (ri === 0 ? bold : reg).widthOfTextAtSize(txt(r, c), size) + pad * 2))))
      const tot = nat.reduce((a, b) => a + b, 0)
      const cws = tot <= maxW ? nat.map((w, c) => (c === 0 ? w + maxW - tot : w)) : nat.map((w) => w * maxW / tot), cx = (c: number) => cws.slice(0, c).reduce((a, b) => a + b, 0)
      const isNum = (s: string) => /^[-–(]?[$€£₦]?[\d.,]+[)%x]?$|^[-–]$/.test(s.replace(/\s/g, ''))
      const right = Array.from({ length: cols }, (_, c) => { const b = tbl.slice(1).map((r) => txt(r, c)).filter(Boolean); return c > 0 && b.length > 0 && b.filter(isNum).length > b.length / 2 })
      tbl.forEach((row, ri) => {
        const font = ri === 0 ? bold : reg
        const cells = Array.from({ length: cols }, (_, c) => clean(row[c] ?? '').replace(/\*\*/g, ''))
        const wrapped = cells.map((cell, c) => { const out: string[] = []; let line = ''; for (const w of cell.split(/\s+/).filter(Boolean)) { const t2 = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t2, size) > cws[c]! - pad * 2 && line) { out.push(line); line = w } else line = t2 } if (line) out.push(line); return out.length ? out : [''] })
        const h = Math.max(...wrapped.map((w) => w.length)) * (size + 3) + pad * 2
        need(h)
        if (ri === 0) page.drawRectangle({ x: M, y: y - h + size + 2, width: maxW, height: h, color: rgb(0.93, 0.95, 0.98) })
        wrapped.forEach((ls, c) => ls.forEach((s, k) => page.drawText(s, { x: right[c] ? M + cx(c) + cws[c]! - pad - font.widthOfTextAtSize(s, size) : M + cx(c) + pad, y: y - pad - k * (size + 3), size, font, color: ink })))
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
      if (l.startsWith('# ')) { const t = clean(l.slice(2)); need(40); const s = 18, tw = bold.widthOfTextAtSize(t, s); page.drawText(t, { x: (W - tw) / 2, y, size: s, font: bold, color: navy }); y -= 28; continue }
      if (l.startsWith('## ')) { y -= 8; need(34); page.drawText(clean(l.slice(3)), { x: M, y, size: 13, font: bold, color: navy }); page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.5, color: rule }); y -= 22; continue }
      if (l.startsWith('### ') || l.startsWith('#### ')) { y -= 4; need(30); page.drawText(clean(l.replace(/^#+ /, '')), { x: M, y, size: 11, font: bold, color: blue }); y -= 16; continue }
      if (l.startsWith('> ')) { const startY = y; const top = y + 11; para([{ t: l.slice(2), f: ital }], 9, 10, 12, false); page.drawRectangle({ x: M, y: y + 6, width: 2, height: top - y - 6, color: rgb(0.11, 0.31, 0.61) }); void startY; y -= 4; continue }
      if (/^\*\*[^*]+\*\*$/.test(l) && !/^\*\*\(/.test(l)) { const t = clean(l.slice(2, -2)); need(18); if (/^(Company|Investor|Agreed|Accepted)/.test(t)) { y -= 8; need(110) } const tw = bold.widthOfTextAtSize(t, 11); page.drawText(t, { x: /SAFE|Valuation|Discount|MFN/.test(t) && !/^(Company|Investor)/.test(t) ? (W - tw) / 2 : M, y, size: 11, font: bold, color: ink }); y -= 16; continue }
      if (/^(By|Name|Title|Date|Email):/.test(l)) { para(runs(l), 11, 0, 17, false); continue }
      if (/^[A-Z0-9 ,.()'"-]{40,}$/.test(l)) { para([{ t: l, f: bold }], 8.5, 0, 11, true); continue }
      const li = l.match(/^(?:[-*]|\d+[.)])\s+(.*)$/)
      if (li) { const num = l.match(/^(\d+)[.)]/)?.[1]; need(15); if (num) page.drawText(num + '.', { x: M + 4, y, size: 10.5, font: reg, color: ink }); else page.drawCircle({ x: M + 7, y: y + 3.5, size: 1.8, color: ink }); para(runs(li[1]!), 10.5, 18, 15, false); continue }
      para(runs(l), 10.5, 0, 15, false)
    }
    flushTable()
  }
  const pages = pdf.getPages()
  pages.forEach((p, i) => { const t = clean(company) + '  ·  page ' + (i + 1) + ' of ' + pages.length; p.drawText(t, { x: (W - sans.widthOfTextAtSize(t, 8)) / 2, y: 36, size: 8, font: sans, color: rgb(0.45, 0.45, 0.45) }) })
  return pdf.save()
}
