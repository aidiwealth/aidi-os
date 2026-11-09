// The financial plan as a PDF in the same design as the Aidi Wealth statement (landscape, the statement's header and
// type, shaded summary boxes, donut charts and bar charts): the plan at a glance, where you stand, money each month,
// how we suggest spreading the money, what savings could be worth, every step, and the important information.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { PLAIN_BUCKET, reportHeadline, reportRest, reportSteps, scoreWord } from '~/shared/wm-report'
import { mdPlain } from '~/shared/markdown'

export interface PlanPdfInput { content: Record<string, any>; prepared: string; client: string; entity: string; address: string | null; country: 'US' | 'NG'; risk: string | null }
const clean = (t: string) => String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/₦/g, 'NGN ').replace(/…/g, '...').replace(/[^\x20-\x7E\n]/g, '')

export async function planPdf(d: PlanPdfInput): Promise<Uint8Array> {
  const c = d.content, cur = /^[A-Z]{3}$/.test(c.currency) ? c.currency : 'USD'
  const pdf = await PDFDocument.create(); pdf.setTitle('Aidi Wealth financial plan - ' + clean(d.client)); pdf.setProducer('Aidi OS')
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(Buffer.from(AIDI_LOGO_PNG, 'base64'))
  const W = 792, H = 612, M = 36
  const navy = rgb(12 / 255, 26 / 255, 46 / 255), blue = rgb(0.24, 0.35, 0.65), sky = rgb(0.42, 0.62, 0.85), slate = rgb(0.55, 0.62, 0.7), pale = rgb(0.8, 0.86, 0.93), mid = rgb(0.33, 0.47, 0.6)
  const ink = rgb(0.13, 0.13, 0.13), grey = rgb(0.4, 0.4, 0.4), rule = rgb(0.8, 0.8, 0.8), shade = rgb(0.95, 0.95, 0.95), warn = rgb(0.71, 0.28, 0.03)
  const PAL = [navy, blue, sky, mid, slate, pale]
  const sym = cur === 'USD' ? '$' : cur === 'NGN' ? 'NGN ' : cur + ' '
  const money = (v: number) => (v < 0 ? '-' : '') + sym + Math.round(Math.abs(v || 0)).toLocaleString('en-US')
  const short = (v: number) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + sym + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : Math.round(a)) }
  const T = (p: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = reg, color: RGB = ink) => p.drawText(clean(s), { x, y, size, font: f, color })
  const R = (p: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = reg, color: RGB = ink) => p.drawText(clean(s), { x: x - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })
  const wrap = (s: string, f: PDFFont, size: number, maxW: number) => { const out: string[] = []; for (const para of clean(s).split('\n')) { let line = ''; for (const wd of para.split(/\s+/)) { const t = line ? line + ' ' + wd : wd; if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = wd } else line = t } out.push(line) } return out }
  const para = (p: PDFPage, s: string, x: number, y: number, w: number, size = 8.5, f: PDFFont = reg, color: RGB = ink, lead = size + 3.5) => { for (const l of wrap(s, f, size, w)) { T(p, l, x, y, size, f, color); y -= lead } return y }
  const line = (p: PDFPage, x1: number, x2: number, y: number) => p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: rule })
  const when = new Date(d.prepared).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const pages: PDFPage[] = []
  const page = () => {
    const p = pdf.addPage([W, H]); pages.push(p)
    p.drawCircle({ x: M + 16, y: H - M - 14, size: 15, borderColor: blue, borderWidth: 4 })
    T(p, 'Aidi Wealth  Financial Plan', M + 40, H - M - 10, 12); T(p, 'for', M + 40 + reg.widthOfTextAtSize('Aidi Wealth  Financial Plan', 12) + 4, H - M - 10, 8); T(p, d.client.toUpperCase(), M + 40, H - M - 26, 8)
    T(p, 'Prepared', 400, H - M - 6, 8, reg, grey); T(p, when, 400, H - M - 20, 9)
    const lw = 64, lh = lw * (logo.height / logo.width); p.drawImage(logo, { x: 560, y: H - M - 26, width: lw, height: lh }); p.drawLine({ start: { x: 632, y: H - M - 30 }, end: { x: 632, y: H - M - 2 }, thickness: 0.6, color: rule }); T(p, 'W E A L T H', 642, H - M - 20, 11, reg, grey)
    return p
  }
  const heading = (p: PDFPage, s: string, x: number, w: number, top: number) => { line(p, x, x + w, top); T(p, s, x, top - 18, 11) }
  const donut = (p: PDFPage, cx: number, cy: number, ro: number, ri: number, segs: { v: number; c: RGB }[], centre: string) => {
    const tot = segs.reduce((s, x) => s + Math.max(0, x.v), 0)
    if (!tot) { p.drawCircle({ x: cx, y: cy, size: ro, color: shade }); p.drawCircle({ x: cx, y: cy, size: ri, color: rgb(1, 1, 1) }) }
    let a0 = Math.PI / 2
    for (const sg of segs) { if (sg.v <= 0 || !tot) continue; const a1 = a0 - (sg.v / tot) * Math.PI * 2; const n = Math.max(1, Math.ceil((a0 - a1) / (Math.PI * 2 / 3))), pt = (r: number, a: number) => (r * Math.cos(a)).toFixed(2) + ' ' + (-r * Math.sin(a)).toFixed(2)
      let path = 'M ' + pt(ro, a0); for (let i = 1; i <= n; i++) path += ' A ' + ro + ' ' + ro + ' 0 0 1 ' + pt(ro, a0 + ((a1 - a0) * i) / n)
      path += ' L ' + pt(ri, a1); for (let i = n - 1; i >= 0; i--) path += ' A ' + ri + ' ' + ri + ' 0 0 0 ' + pt(ri, a0 + ((a1 - a0) * i) / n)
      p.drawSvgPath(path + ' Z', { x: cx, y: cy, color: sg.c, borderWidth: 0 }); a0 = a1 }
    const cw = bold.widthOfTextAtSize(clean(centre), 8.5); T(p, centre, cx - cw / 2, cy - 3, 8.5, bold)
  }
  const swatch = (p: PDFPage, x: number, y: number, col: RGB) => p.drawRectangle({ x, y: y - 1, width: 10, height: 9, color: col })

  const cf = c.cash_flow ?? {}, bs = c.balance_sheet ?? { assets: [], liabilities: [], net_worth: 0 }
  const owe = (bs.liabilities ?? []).reduce((a: number, l: any) => a + Number(l.value || 0), 0)
  const own = (bs.assets ?? []).reduce((a: number, l: any) => a + Math.max(0, Number(l.value || 0)), 0)
  const steps = reportSteps(c), score = Math.round(Number(c.health_score ?? 0))
  const LX = M, LW = 345, RX = 410, RW = W - M - RX

  // 1 · At a glance
  let p = page()
  T(p, 'Your Plan at a Glance', LX, H - 140, 13)
  let y = para(p, reportHeadline(c), LX, H - 164, LW, 11, bold, navy, 15)
  y = para(p, mdPlain(reportRest(c)), LX, y - 4, LW, 8.5, reg, ink, 12)
  y -= 14; p.drawRectangle({ x: LX, y: y - 62, width: LW, height: 62, color: shade })
  T(p, 'Financial health', LX + 12, y - 16, 7.5, reg, grey); T(p, String(score), LX + 12, y - 46, 26, bold, navy); T(p, 'out of 100  ·  ' + scoreWord(score), LX + 52, y - 44, 8.5)
  for (let k = 0; k < 5; k++) p.drawRectangle({ x: LX + 180 + k * 31, y: y - 40, width: 28, height: 8, color: score >= (k + 1) * 20 - 10 ? blue : pale })
  y -= 84
  line(p, LX, LX + 225, y); T(p, 'Your Independent Investment Manager', LX, y - 14, 8.5, bold); T(p, 'and/or Advisor', LX, y - 25, 8.5, bold)
  let ay = y - 42; for (const l of [d.entity.toUpperCase(), ...wrap(d.address ?? '', reg, 7.5, 210)]) { if (l) { T(p, l, LX, ay, 7.5); ay -= 10 } }
  T(p, 'Online Assistance', LX, 80, 8.5, bold); T(p, 'Visit your Aidi Wealth portal at app.theaidigroup.com/w', LX, 66, 7.5)
  // key figures, like the statement's account summary
  T(p, 'Key Figures', RX, H - 140, 13)
  p.drawRectangle({ x: RX, y: H - 200, width: RW, height: 46, color: shade })
  T(p, 'Net worth', RX + 10, H - 170, 7.5, reg, grey); T(p, money(bs.net_worth), RX + 10, H - 190, 13)
  T(p, 'Left over each month', RX + 190, H - 170, 7.5, reg, grey); T(p, money(cf.monthly_surplus), RX + 190, H - 190, 13)
  y = H - 222; R(p, 'Amount', W - M, y, 7.5, reg, grey); y -= 6; line(p, RX, W - M, y); y -= 14
  const kf: [string, string, boolean][] = [['Money coming in, a month', money(cf.monthly_income), false], ['Spending and tax, a month', money(cf.monthly_spending), true], ['Left over, a month', money(cf.monthly_surplus), true], ['Share of income you keep', Math.round(cf.savings_rate_pct ?? 0) + '%', false], ['What you own', money(own), false], ['What you owe', money(-owe), false]]
  for (const [l, v, ind] of kf) { T(p, l, ind ? RX + 8 : RX + 4, y, 8.5); R(p, v, W - M, y, 8.5, bold); y -= 17 }
  p.drawRectangle({ x: RX, y: y - 5, width: RW, height: 17, color: shade }); T(p, 'Net Worth', RX + 4, y, 8.5, bold); R(p, money(bs.net_worth), W - M, y, 8.5, bold)
  y -= 34; T(p, 'Your Next Steps', RX, y, 11); y -= 18
  for (const [k, s] of steps.slice(0, 3).entries()) {
    p.drawRectangle({ x: RX, y: y - 4, width: 16, height: 16, color: navy }); T(p, String(k + 1), RX + 5.5, y + 0.5, 8.5, bold, rgb(1, 1, 1))
    T(p, s.title.slice(0, 60), RX + 24, y, 8.5, bold); R(p, s.timeframe.slice(0, 22), W - M, y, 7.5, reg, s.priority === 'high' ? warn : grey)
    y = para(p, s.detail, RX + 24, y - 12, RW - 24, 7.5, reg, grey, 9.5) - 8
    if (y < 70) break
  }

  // 2 · Where you stand
  p = page()
  heading(p, 'What You Own', LX, LW, H - 116)
  const assets = (bs.assets ?? []).filter((a: any) => Number(a.value) > 0).sort((a: any, b: any) => b.value - a.value)
  const aSeg = assets.slice(0, 5).map((a: any, i: number) => ({ label: String(a.label), v: Number(a.value), c: PAL[i]! }))
  if (assets.length > 5) aSeg.push({ label: 'Other', v: assets.slice(5).reduce((s: number, a: any) => s + Number(a.value), 0), c: PAL[5]! })
  donut(p, LX + 46, H - 196, 40, 23, aSeg, short(own))
  R(p, 'Value', LX + 285, H - 152, 7.5, reg, grey); R(p, '% of total', LX + LW, H - 152, 7.5, reg, grey)
  y = H - 170; for (const s of aSeg) { swatch(p, LX + 100, y, s.c); T(p, s.label.slice(0, 30), LX + 116, y, 8.5); R(p, money(s.v), LX + 285, y, 8.5); R(p, own ? Math.round((s.v / own) * 100) + '%' : '-', LX + LW, y, 8.5); y -= 16 }
  y = Math.min(y, H - 250); p.drawRectangle({ x: LX + 100, y: y - 5, width: LW - 100, height: 17, color: shade }); T(p, 'Total  ' + money(own), LX + 106, y, 8.5, bold)
  y -= 40; heading(p, 'What You Owe', LX, LW, y); y -= 38
  T(p, 'Debt', LX, y, 7.5, reg, grey); R(p, 'Still owed', LX + LW, y, 7.5, reg, grey); y -= 5; line(p, LX, LX + LW, y); y -= 13
  for (const l of bs.liabilities ?? []) { T(p, String(l.label).slice(0, 50), LX, y, 8.5); R(p, money(Number(l.value)), LX + LW, y, 8.5); y -= 14 }
  if (!(bs.liabilities ?? []).length) { T(p, 'Nothing owed.', LX, y, 8.5, reg, grey); y -= 14 }
  p.drawRectangle({ x: LX, y: y - 5, width: LW, height: 17, color: shade }); T(p, 'Total owed', LX + 6, y, 8.5, bold); R(p, money(owe), LX + LW - 6, y, 8.5, bold)
  y -= 26; p.drawRectangle({ x: LX, y: y - 5, width: LW, height: 17, color: pale }); T(p, 'Net worth (what you own minus what you owe)', LX + 6, y, 8.5, bold); R(p, money(bs.net_worth), LX + LW - 6, y, 8.5, bold)
  // money each month: stacked bar
  heading(p, 'Money Each Month', RX, RW, H - 116)
  const spend = Math.max(0, Number(cf.monthly_spending || 0)), left = Math.max(0, Number(cf.monthly_surplus || 0)), inc = Math.max(spend + left, Number(cf.monthly_income || 0), 1)
  const bw = RW, sw = (spend / inc) * bw
  p.drawRectangle({ x: RX, y: H - 172, width: Math.max(0, sw), height: 22, color: sky }); p.drawRectangle({ x: RX + sw, y: H - 172, width: Math.max(0, (left / inc) * bw), height: 22, color: navy })
  y = H - 196; swatch(p, RX, y, sky); T(p, 'Spending and tax', RX + 16, y, 8.5); R(p, money(spend), RX + 250, y, 8.5); R(p, Math.round((spend / inc) * 100) + '%', W - M, y, 8.5)
  y -= 16; swatch(p, RX, y, navy); T(p, 'Left over', RX + 16, y, 8.5); R(p, money(left), RX + 250, y, 8.5); R(p, Math.round((left / inc) * 100) + '%', W - M, y, 8.5)
  y -= 22; p.drawRectangle({ x: RX, y: y - 5, width: RW, height: 17, color: shade }); T(p, 'Money coming in, a month', RX + 6, y, 8.5, bold); R(p, money(cf.monthly_income), W - M - 6, y, 8.5, bold)
  y -= 40; heading(p, 'Over a Year', RX, RW, y); y -= 38
  T(p, 'Item', RX, y, 7.5, reg, grey); R(p, 'A year', W - M, y, 7.5, reg, grey); y -= 5; line(p, RX, W - M, y); y -= 13
  for (const l of (c.income_statement?.lines ?? []).slice(0, 12)) { T(p, String(l.label).slice(0, 48), RX, y, 8.5); R(p, money(Number(l.annual)), W - M, y, 8.5, reg, Number(l.annual) < 0 ? grey : ink); y -= 14 }
  p.drawRectangle({ x: RX, y: y - 5, width: RW, height: 17, color: shade }); T(p, 'What is left over the year', RX + 6, y, 8.5, bold); R(p, money(Number(c.income_statement?.net ?? 0)), W - M - 6, y, 8.5, bold)

  // 3 · Spreading the money, and growth
  p = page()
  heading(p, 'How We Suggest Spreading Your Money', LX, LW, H - 116)
  const rows = (c.fortress?.rows ?? []) as { key: string; label: string; current_pct: number; target_pct: number; gap: number }[]
  if (rows.length) {
    const col = (i: number) => PAL[i % PAL.length]!
    donut(p, LX + 70, H - 200, 42, 24, rows.map((r, i) => ({ v: r.current_pct, c: col(i) })), 'Today')
    donut(p, LX + 250, H - 200, 42, 24, rows.map((r, i) => ({ v: r.target_pct, c: col(i) })), 'Suggested')
    y = H - 268; T(p, 'Kind of investment', LX, y, 7.5, reg, grey); R(p, 'Today', LX + 215, y, 7.5, reg, grey); R(p, 'Suggested', LX + 270, y, 7.5, reg, grey); R(p, 'To move', LX + LW, y, 7.5, reg, grey); y -= 5; line(p, LX, LX + LW, y); y -= 13
    for (const [i, r] of rows.entries()) { swatch(p, LX, y, col(i)); T(p, (r.key === 'tbills' ? 'T-bills or fixed deposits' : PLAIN_BUCKET[r.key] ?? r.label).slice(0, 34), LX + 16, y, 8.5); R(p, r.current_pct + '%', LX + 215, y, 8.5); R(p, r.target_pct + '%', LX + 270, y, 8.5); R(p, r.gap === 0 ? '-' : (r.gap > 0 ? '+' : '-') + short(Math.abs(r.gap)).replace('-', ''), LX + LW, y, 8.5, bold, r.gap < 0 ? warn : blue); y -= 15 }
    y -= 8; para(p, 'Spreading money across different kinds of investment means one bad year for one of them can\'t undo your progress. Based on about $' + Math.round(Number(c.fortress.base ?? 0)).toLocaleString('en-US') + ' you could invest. A general guide, not personal advice: your adviser will go through what fits you before anything moves.', LX, y, LW, 7, reg, grey, 9)
  } else para(p, 'Your adviser will suggest a mix once your accounts and holdings are added.', LX, H - 150, LW, 8.5, reg, grey)
  heading(p, 'What Your Savings Could Be Worth', RX, RW, H - 116)
  const series = (c.series ?? []) as { year: number; plan: number; as_is: number }[]
  if (series.length) {
    const last = series[series.length - 1]!
    p.drawRectangle({ x: RX, y: H - 186, width: RW, height: 46, color: shade })
    T(p, 'Following the plan, ' + last.year, RX + 10, H - 156, 7.5, reg, grey); T(p, money(last.plan), RX + 10, H - 176, 13, reg, navy)
    T(p, 'If nothing changes, ' + last.year, RX + 190, H - 156, 7.5, reg, grey); T(p, money(last.as_is), RX + 190, H - 176, 13, reg, grey)
    const bx = RX + 30, by = H - 400, cw = RW - 34, ch = 180, peak = Math.max(1, ...series.map((s) => Math.max(s.plan, s.as_is)))
    for (const g of [0, 0.5, 1]) { const gy = by + g * ch; p.drawLine({ start: { x: bx, y: gy }, end: { x: bx + cw, y: gy }, thickness: 0.4, color: g === 0 ? rule : shade }); R(p, short(peak * g), bx - 4, gy - 2, 6.5, reg, grey) }
    const slot = cw / series.length, barW = Math.min(16, slot / 3)
    for (const [i, s] of series.entries()) {
      const x0 = bx + i * slot + slot / 2 - barW - 1
      p.drawRectangle({ x: x0, y: by, width: barW, height: (s.plan / peak) * ch, color: navy })
      p.drawRectangle({ x: x0 + barW + 2, y: by, width: barW, height: (s.as_is / peak) * ch, color: pale })
      const lbl = String(s.year), lw2 = reg.widthOfTextAtSize(lbl, 6.5); T(p, lbl, x0 + barW + 1 - lw2 / 2, by - 10, 6.5, reg, grey)
    }
    y = by - 30; swatch(p, RX, y, navy); T(p, 'Following the plan', RX + 16, y, 8); swatch(p, RX + 130, y, pale); T(p, 'If nothing changes', RX + 146, y, 8)
    para(p, 'Assumes ' + money(Number(c.projection?.monthly_contribution ?? 0)) + ' a month invested, growing ' + (c.projection?.annual_return_pct ?? '') + '% a year after costs. Real returns go up and down; this is a guide, not a promise.', RX, y - 18, RW, 7, reg, grey, 9)
  }

  // 4 · Every step, and what's going well
  p = page()
  heading(p, 'Your Plan, Step by Step', LX, W - M * 2, H - 116)
  y = H - 150; const cols = [LX, LX + 22, LX + 250, LX + 600]
  const stepHead = () => { T(p, '#', cols[0]!, y, 7.5, reg, grey); T(p, 'Step', cols[1]!, y, 7.5, reg, grey); T(p, 'Why it matters', cols[2]!, y, 7.5, reg, grey); T(p, 'When', cols[3]!, y, 7.5, reg, grey); y -= 5; line(p, LX, W - M, y); y -= 13 }
  stepHead()
  for (const [i, s] of steps.entries()) {
    const tl = wrap(s.title, bold, 8.5, 220), dl = wrap(s.detail, reg, 8, 340), h = Math.max(tl.length * 11, dl.length * 10.5)
    if (y - h < 70) { p = page(); y = H - 130; stepHead() }
    if (i % 2 === 0) p.drawRectangle({ x: LX, y: y - h + 6, width: W - M * 2, height: h + 4, color: rgb(0.975, 0.975, 0.975) })
    T(p, String(i + 1), cols[0]!, y, 8.5, bold); tl.forEach((l, k) => T(p, l, cols[1]!, y - k * 11, 8.5, bold)); dl.forEach((l, k) => T(p, l, cols[2]!, y - k * 10.5, 8)); T(p, s.timeframe.slice(0, 30), cols[3]!, y, 8, reg, s.priority === 'high' ? warn : ink)
    y -= h + 8
  }
  if (y < 230) { p = page(); y = H - 116 } else y -= 10
  heading(p, 'Going Well', LX, LW, y); heading(p, 'Watch Out For', RX, RW, y)
  let gy = y - 38, wy = y - 38
  for (const s of c.strengths ?? []) { if (gy < 60) break; T(p, '+', LX, gy, 9, bold, blue); gy = para(p, s, LX + 12, gy, LW - 12, 8.5) - 4 }
  for (const s of c.risks ?? []) { if (wy < 60) break; T(p, '!', RX + 2, wy, 9, bold, warn); wy = para(p, s, RX + 12, wy, RW - 12, 8.5) - 4 }

  // 5 · Important information
  p = page()
  T(p, 'Assumptions and Important Information', M, H - 140, 14, bold); T(p, 'General Information', M, H - 156, 8, bold, grey)
  const info = ['This plan was prepared on ' + when + ' from the information you gave us and the documents you shared with us. The figures have not been audited and may be rounded. Share pay such as RSU vests and ESPP purchases is shown with your shares rather than as monthly income.',
    'Growth figures assume a steady return after costs. Investments can fall as well as rise, and you may get back less than you put in. Past results do not predict future ones.',
    'This plan is general financial guidance. It is not a recommendation to buy or sell any security, property or product, and it is not tax or legal advice. Talk to your adviser before acting on it.',
    'Risk level agreed: ' + (d.risk ? d.risk.replace(/_/g, ' ') : 'not set yet') + '. Tell your adviser if your circumstances, goals or appetite for risk change, so the plan can be updated.',
    TERMS(d.entity, d.country)].join('\n\n')
  const colW = (W - M * 2 - 30) / 2; const lines = wrap(info, reg, 7.5, colW); let col = 0; y = H - 180
  for (const l of lines) { if (y < 150) { col++; y = H - 180; if (col > 1) break } T(p, l, M + col * (colW + 30), y, 7.5); y -= 10 }
  y = 120; for (const l of wrap('For questions about this plan, contact ' + d.entity + ' through your Aidi Wealth portal. (c) ' + new Date().getUTCFullYear() + ' ' + d.entity + '. All rights reserved.', reg, 7.5, W - M * 2)) { T(p, l, M, y, 7.5); y -= 10 }

  pages.forEach((pg, i) => R(pg, (i + 1) + ' of ' + pages.length, W - M, 18, 7, bold))
  return pdf.save()
}
