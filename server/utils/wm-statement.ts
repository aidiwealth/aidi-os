// Aidi Wealth account statements: figures for a period (prefilled from holdings, wallet, savings, fees and net-worth
// history; staff can adjust), and a three-page landscape PDF that mirrors the Aidi Wealth statement.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
export interface StatementData {
  client: { name: string; address: string | null }; period: { kind: string; start: string; end: string; label: string }
  advisor: { name: string; address: string; phone: string | null }; custodian: string
  summary: { beginning: number; deposits: number; withdrawals: number; interest: number; transfers: number; appreciation: number; expenses: number; ending: number }
  ytd: { beginning: number; deposits: number; withdrawals: number; interest: number; transfers: number; appreciation: number; expenses: number; ending: number }
  holdings: { item: string; description: string; value: number }[]; cash: number
  expenses: { date: string; description: string; amount: number }[]
  gold: { d: string; price: number }[]; rates: { label: string; points: { as_of: string; rate: number }[] }
  terms: string; contact: string
}
const r2 = (x: number) => Math.round(x * 100) / 100
async function snapshotAt(clientId: string, date: string, before: boolean) {
  return Number((await db().query<{ v: string }>(`SELECT net_worth::text AS v FROM wm.snapshots WHERE client_id = $1 AND as_of ${before ? '<' : '<='} $2 ORDER BY as_of DESC LIMIT 1`, [clientId, date])).rows[0]?.v ?? 0)
}
async function flows(clientId: string, start: string, end: string) {
  const usd = async (v: number, c: string) => (c === 'USD' ? v : v * ((await fxRate(c, 'USD')) ?? 0))
  let deposits = 0, withdrawals = 0, interest = 0
  for (const t of (await db().query<{ kind: string; amount: string; currency: string }>("SELECT kind, amount::text, currency FROM wm.wallet_txns WHERE client_id = $1 AND status = 'confirmed' AND created_at::date BETWEEN $2 AND $3", [clientId, start, end]).catch(() => ({ rows: [] as { kind: string; amount: string; currency: string }[] }))).rows) { const v = await usd(Number(t.amount), t.currency); if (t.kind === 'deposit') deposits += v; else if (t.kind === 'withdrawal') withdrawals += Math.abs(v) }
  for (const t of (await db().query<{ kind: string; amount: string; currency: string }>("SELECT t.kind, t.amount::text, p.currency FROM wm.savings_txns t JOIN wm.savings_plans p ON p.id = t.plan_id WHERE p.client_id = $1 AND t.status = 'confirmed' AND t.txn_date BETWEEN $2 AND $3", [clientId, start, end]).catch(() => ({ rows: [] as { kind: string; amount: string; currency: string }[] }))).rows) { const v = await usd(Number(t.amount), t.currency); if (t.kind === 'deposit') deposits += v; else if (t.kind === 'withdrawal') withdrawals += v; else interest += v }
  const fees = (await db().query<{ paid_on: string; kind: string; period: string | null; amount: string; currency: string; note: string | null }>("SELECT to_char(paid_on, 'MM/DD/YYYY') AS paid_on, kind, period, amount::text, currency, note FROM wm.fees WHERE client_id = $1 AND status = 'paid' AND paid_on BETWEEN $2 AND $3 ORDER BY paid_on", [clientId, start, end])).rows
  const expenses = [] as { date: string; description: string; amount: number }[]
  for (const f of fees) expenses.push({ date: f.paid_on, description: (f.kind === 'advisory' ? 'Advisory fee' : f.kind === 'subscription' ? 'Aidi Wealth subscription' : 'Fee') + (f.period ? ' (' + f.period + ')' : ''), amount: r2(await usd(Number(f.amount), f.currency)) })
  return { deposits: r2(deposits), withdrawals: r2(withdrawals), interest: r2(interest), expenses }
}
export function periodFor(kind: string, ref = new Date()): { start: string; end: string } {
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth(), iso = (d: Date) => d.toISOString().slice(0, 10)
  if (kind === 'monthly') return { start: iso(new Date(Date.UTC(y, m - 1, 1))), end: iso(new Date(Date.UTC(y, m, 0))) }
  if (kind === 'quarterly') { const q = Math.floor(m / 3); return { start: iso(new Date(Date.UTC(y, (q - 1) * 3, 1))), end: iso(new Date(Date.UTC(y, q * 3, 0))) } }
  return { start: iso(new Date(Date.UTC(y - 1, 0, 1))), end: iso(new Date(Date.UTC(y - 1, 11, 31))) }
}
export const TERMS = (entity: string, country: string) => `This statement is issued by ${entity} for informational purposes. ${entity} works with licensed custodians and registered investment advisers to provide coordinated investment management, reporting and oversight.
All securities, funds and alternative assets are held with qualified third-party custodians. ${entity} does not take custody of client assets and does not execute or settle transactions directly. Information here may come from several custodians, investment partners or market sources, is consolidated for convenience, and may differ from current market valuations or official custodian statements.
Securities and investment products, including cash held in brokerage or managed accounts, are not deposits, are not insured by the ${country === 'NG' ? 'NDIC' : 'FDIC'}, and may lose value. Please refer to your custodian's own statements for official balances and insurance coverage.
Valuations are estimated market values as of the statement date and may include indicative pricing for thinly traded, private or illiquid assets. Yields and performance figures, where shown, are estimates; actual returns may differ.
Please review this statement and report any errors, omissions or discrepancies within 10 business days of receipt. If no notice is received, the information will be taken as accurate.
${entity} provides investment coordination and advisory oversight but does not give tax, legal or accounting advice. Please consult your own qualified professionals and keep this statement for your records.
Investment returns are not guaranteed and market movements may affect asset values. Past performance is not indicative of future results.`
export async function buildStatement(clientId: string, kind: string, start: string, end: string): Promise<StatementData> {
  const c = (await db().query<{ name: string; country: string; entity: string | null; entity_address: string | null; profile_addr: string | null }>(
    "SELECT c.name, c.country, e.name AS entity, e.address AS entity_address, (SELECT p.data->'household'->>'location' FROM wm.profiles p WHERE p.client_id = c.id) AS profile_addr FROM wm.clients c LEFT JOIN core.entities e ON e.id = c.entity_id WHERE c.id = $1", [clientId])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  const s = await clientSummary(clientId)
  const today = new Date().toISOString().slice(0, 10)
  const ending = end >= today ? s.totals.net_worth : (await snapshotAt(clientId, end, false)) || s.totals.net_worth
  const beginning = await snapshotAt(clientId, start, true)
  const f = await flows(clientId, start, end)
  const expTotal = r2(f.expenses.reduce((a, x) => a + x.amount, 0))
  const appreciation = r2(ending - beginning - f.deposits + f.withdrawals - f.interest + expTotal)
  const yStart = start.slice(0, 4) + '-01-01'
  const yb = await snapshotAt(clientId, yStart, true), yf = await flows(clientId, yStart, end), yExp = r2(yf.expenses.reduce((a, x) => a + x.amount, 0))
  const usd = async (v: number, cur: string) => (cur === 'USD' ? v : v * ((await fxRate(cur, 'USD')) ?? 0))
  const holdings = [] as { item: string; description: string; value: number }[]
  for (const h of s.holdings) { if (h.category === 'liability') continue; const m = h.meta as Record<string, any>; holdings.push({ item: m?.ounces ? m.ounces + ' oz' : m?.units ? String(m.units) : m?.symbol ?? '1', description: h.name, value: r2(await usd(Number(h.current_value ?? h.cost ?? 0), h.currency)) }) }
  for (const a of s.accounts) holdings.push({ item: a.kind, description: a.institution + (a.name ? ' · ' + a.name : ''), value: r2(await usd(Number(a.balance), a.currency)) })
  const gold = (await asPlatform(() => db().query<{ d: string; price: string }>("SELECT to_char(date_trunc('day', as_of), 'YYYY-MM-DD') AS d, (array_agg(price ORDER BY as_of DESC))[1]::text AS price FROM wm.market WHERE symbol = 'XAU' AND as_of::date BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1", [yStart, end]))).rows.map((x) => ({ d: x.d, price: Number(x.price) }))
  const rateProduct = c.country === 'NG' ? (await db().query<{ product: string }>("SELECT product FROM wm.rates WHERE country = 'NG' ORDER BY as_of DESC LIMIT 1")).rows[0]?.product ?? null : 'US Treasury bills (average)'
  const rpts = rateProduct ? (await db().query<{ as_of: string; rate: string }>("SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, rate::text FROM wm.rates WHERE country = $1 AND product = $2 AND as_of BETWEEN ($3::date - interval '12 months') AND $4::date ORDER BY as_of", [c.country, rateProduct, start, end])).rows.map((x) => ({ as_of: x.as_of, rate: Number(x.rate) })) : []
  const platforms = [...new Set(s.holdings.map((h) => h.platform).filter(Boolean).concat(s.accounts.map((a) => a.institution)))].join(', ')
  const entity = c.entity ?? (c.country === 'NG' ? 'Aidi Finance Limited' : 'Aidi Wealth LLC')
  const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return { client: { name: c.name, address: c.profile_addr }, period: { kind, start, end, label: fmt(start) + ' - ' + fmt(end) + ', ' + end.slice(0, 4) },
    advisor: { name: entity.toUpperCase(), address: c.entity_address ?? '', phone: null }, custodian: platforms ? 'Assets are held with: ' + platforms + '. Your adviser is not affiliated with or an agent of these custodians, which do not supervise or endorse your adviser.' : 'Assets are held with independent third-party custodians.',
    summary: { beginning: r2(beginning), deposits: f.deposits, withdrawals: f.withdrawals, interest: f.interest, transfers: 0, appreciation, expenses: expTotal, ending: r2(ending) },
    ytd: { beginning: r2(yb), deposits: yf.deposits, withdrawals: yf.withdrawals, interest: yf.interest, transfers: 0, appreciation: r2(ending - yb - yf.deposits + yf.withdrawals - yf.interest + yExp), expenses: yExp, ending: r2(ending) },
    holdings, cash: r2(s.totals.cash), expenses: f.expenses, gold, rates: { label: rateProduct ?? '', points: rpts }, terms: TERMS(entity, c.country), contact: entity }
}
const clean = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u20A6/g, 'NGN ').replace(/[^\x20-\x7E\n]/g, '')
export async function statementPdf(d: StatementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); pdf.setTitle('Aidi Wealth statement - ' + clean(d.client.name) + ' - ' + d.period.label); pdf.setProducer('Aidi OS')
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(Buffer.from(AIDI_LOGO_PNG, 'base64'))
  const W = 792, H = 612, M = 36, blue = rgb(0.24, 0.35, 0.65), ink = rgb(0.13, 0.13, 0.13), grey = rgb(0.4, 0.4, 0.4), rule = rgb(0.8, 0.8, 0.8), shade = rgb(0.95, 0.95, 0.95)
  const money = (v: number) => (v < 0 ? '(' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (v < 0 ? ')' : '')
  const T = (p: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = reg, color = ink) => p.drawText(clean(s), { x, y, size, font: f, color })
  const R = (p: PDFPage, s: string, x: number, y: number, size = 9, f: PDFFont = reg, color = ink) => p.drawText(clean(s), { x: x - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })
  const wrap = (s: string, f: PDFFont, size: number, maxW: number) => { const out: string[] = []; for (const para of clean(s).split('\n')) { let line = ''; for (const wd of para.split(/\s+/)) { const t = line ? line + ' ' + wd : wd; if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = wd } else line = t } out.push(line) } return out }
  const header = (p: PDFPage) => {
    p.drawCircle({ x: M + 16, y: H - M - 14, size: 15, borderColor: blue, borderWidth: 4 })
    T(p, 'Aidi Wealth  Account', M + 40, H - M - 10, 12, reg); T(p, 'of', M + 40 + reg.widthOfTextAtSize('Aidi Wealth  Account', 12) + 4, H - M - 10, 8); T(p, d.client.name.toUpperCase(), M + 40, H - M - 26, 8)
    T(p, 'Statement Period', 400, H - M - 6, 8, reg, grey); T(p, d.period.label, 400, H - M - 20, 9)
    const lw = 64, lh = lw * (logo.height / logo.width); p.drawImage(logo, { x: 560, y: H - M - 26, width: lw, height: lh }); p.drawLine({ start: { x: 632, y: H - M - 30 }, end: { x: 632, y: H - M - 2 }, thickness: 0.6, color: rule }); T(p, 'W E A L T H', 642, H - M - 20, 11, reg, grey)
  }
  const footer = (p: PDFPage, n: number) => R(p, n + ' of 3', W - M, 18, 7, bold)
  // page 1
  let p = pdf.addPage([W, H]); header(p)
  T(p, 'Account Summary', 400, H - 150, 13, reg)
  p.drawRectangle({ x: 400, y: H - 210, width: W - M - 400, height: 46, color: shade })
  T(p, 'Ending Account Value as of ' + d.period.end.slice(5).replace('-', '/'), 410, H - 180, 7.5, reg, grey); T(p, money(d.summary.ending), 410, H - 200, 13)
  T(p, 'Beginning Account Value as of ' + d.period.start.slice(5).replace('-', '/'), 590, H - 180, 7.5, reg, grey); T(p, money(d.summary.beginning), 590, H - 200, 13)
  let y = 270
  R(p, 'This Statement', 660, y, 7.5, reg, grey); R(p, 'YTD', W - M, y, 7.5, reg, grey); y -= 6; p.drawLine({ start: { x: 400, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 14
  const rows: [string, keyof StatementData['summary'], boolean][] = [['Beginning Account Value', 'beginning', false], ['Deposits', 'deposits', true], ['Withdrawals', 'withdrawals', true], ['Dividends and Interest', 'interest', true], ['Transfer of Securities', 'transfers', true], ['Market Appreciation/(Depreciation)', 'appreciation', true], ['Expenses', 'expenses', true]]
  for (const [l, k, ind] of rows) { T(p, l, ind ? 412 : 404, y, 8.5); const v = k === 'expenses' ? -d.summary[k] : k === 'withdrawals' ? -d.summary[k] : d.summary[k]; const yv = k === 'expenses' ? -d.ytd[k] : k === 'withdrawals' ? -d.ytd[k] : d.ytd[k]; R(p, money(v), 660, y, 8.5, bold); R(p, money(yv), W - M, y, 8.5); y -= 17 }
  p.drawRectangle({ x: 400, y: y - 5, width: W - M - 400, height: 17, color: shade }); T(p, 'Ending Account Value', 404, y, 8.5, bold); R(p, money(d.summary.ending), 660, y, 8.5, bold); R(p, money(d.ytd.ending), W - M, y, 8.5)
  y -= 24; for (const l of wrap("Account Ending Value reflects the market value of your cash and investments. It does not include pending transactions, unpriced securities or assets held outside the accounts reported to us.", reg, 7, W - M - 404)) { T(p, l, 404, y, 7, reg, grey); y -= 9 }
  p.drawLine({ start: { x: M, y: 262 }, end: { x: 260, y: 262 }, thickness: 0.6, color: rule })
  T(p, 'Your Independent Investment Manager', M, 248, 8.5, bold); T(p, 'and/or Advisor', M, 237, 8.5, bold)
  let ay = 220; for (const l of [d.advisor.name, ...wrap(d.advisor.address, reg, 7.5, 210)]) { T(p, l, M, ay, 7.5); ay -= 10 }
  ay -= 4; for (const l of wrap(d.custodian, reg, 7, 215)) { T(p, l, M, ay, 7); ay -= 9 }
  p.drawLine({ start: { x: M, y: ay - 4 }, end: { x: 260, y: ay - 4 }, thickness: 0.6, color: rule })
  // vertical client name/address
  p.drawText(clean(d.client.name.toUpperCase()), { x: 300, y: 70, size: 8.5, font: bold, color: ink, rotate: { type: 'degrees' as any, angle: 90 } as any })
  if (d.client.address) p.drawText(clean(d.client.address.toUpperCase()), { x: 312, y: 70, size: 7.5, font: reg, color: ink, rotate: { type: 'degrees' as any, angle: 90 } as any })
  T(p, 'Online Assistance', M, 80, 8.5, bold); T(p, 'Visit your Aidi Wealth portal at app.theaidigroup.com/w', M, 66, 7.5)
  footer(p, 1)
  // page 2
  p = pdf.addPage([W, H]); header(p)
  const LX = M, LW = 345, RX = 410, RW = W - M - RX
  p.drawLine({ start: { x: LX, y: H - 116 }, end: { x: LX + LW, y: H - 116 }, thickness: 0.6, color: rule }); T(p, 'Asset Allocation', LX, H - 134, 11)
  const total = d.holdings.reduce((a, x) => a + x.value, 0) || 1, assets = Math.max(0, total - 0)
  const cx = LX + 40, cy = H - 196
  const segs = [{ v: d.cash, c: rgb(0.2, 0.45, 0.2) }, { v: Math.max(assets - d.cash, 0), c: blue }]
  let a0 = Math.PI / 2; const tot = segs.reduce((s, x) => s + x.v, 0) || 1
  // donut: each segment as a filled ring sector (split into arcs of at most 120 degrees)
  const ro = 38, ri = 22
  for (const sg of segs) { if (sg.v <= 0) continue; const a1 = a0 + (sg.v / tot) * Math.PI * 2; const n = Math.ceil((a1 - a0) / (Math.PI * 2 / 3)), pt = (r: number, a: number) => (r * Math.cos(a)).toFixed(2) + ' ' + (-r * Math.sin(a)).toFixed(2)
    let path = 'M ' + pt(ro, a0); for (let i = 1; i <= n; i++) path += ' A ' + ro + ' ' + ro + ' 0 0 0 ' + pt(ro, a0 + ((a1 - a0) * i) / n)
    path += ' L ' + pt(ri, a1); for (let i = n - 1; i >= 0; i--) path += ' A ' + ri + ' ' + ri + ' 0 0 1 ' + pt(ri, a0 + ((a1 - a0) * i) / n)
    p.drawSvgPath(path + ' Z', { x: cx, y: cy, color: sg.c, borderWidth: 0 }); a0 = a1 }
  R(p, '$' + (total >= 1000 ? Math.round(total / 1000) + 'K' : Math.round(total)), cx + 9, cy - 3, 8)
  R(p, 'Current Allocation This Period', LX + LW, H - 160, 7.5, reg, grey)
  p.drawRectangle({ x: LX + 100, y: H - 182, width: 12, height: 10, color: segs[0]!.c }); T(p, 'Cash and Cash Investments', LX + 118, H - 181, 8.5); R(p, money(d.cash).replace('$', ''), LX + 285, H - 181, 8.5); R(p, Math.round((d.cash / tot) * 100) + '%', LX + LW, H - 181, 8.5)
  p.drawRectangle({ x: LX + 100, y: H - 202, width: 12, height: 10, color: blue }); T(p, 'Asset Income', LX + 118, H - 201, 8.5); R(p, money(segs[1]!.v).replace('$', ''), LX + 285, H - 201, 8.5); R(p, Math.round((segs[1]!.v / tot) * 100) + '%', LX + LW, H - 201, 8.5)
  p.drawRectangle({ x: LX + 100, y: H - 228, width: LW - 100, height: 16, color: shade }); T(p, 'Total  ' + money(tot), LX + 106, H - 223, 8.5, bold)
  T(p, 'Account Holdings This Period', LX, H - 262, 11); y = H - 282; T(p, 'ITEM', LX, y, 7.5, reg, grey); T(p, 'Description', LX + 75, y, 7.5, reg, grey); R(p, 'Market Value', LX + 280, y, 7.5, reg, grey); R(p, '% of Account', LX + LW, y, 7.5, reg, grey); y -= 5
  p.drawLine({ start: { x: LX, y }, end: { x: LX + LW, y }, thickness: 0.6, color: rule }); y -= 13
  for (const h of d.holdings.slice(0, 10)) { T(p, h.item.slice(0, 14), LX, y, 8.5); T(p, h.description.slice(0, 40), LX + 75, y, 8.5); R(p, money(h.value), LX + 280, y, 8.5); R(p, ((h.value / tot) * 100).toFixed(1) + '%', LX + LW, y, 8.5); y -= 14 }
  y -= 2; p.drawLine({ start: { x: LX, y }, end: { x: LX + LW, y }, thickness: 0.6, color: rule })
  y -= 30; T(p, 'Expense Schedule This Period', LX, y, 11); y -= 18; T(p, 'Date', LX, y, 7.5, reg, grey); T(p, 'Description', LX + 75, y, 7.5, reg, grey); T(p, 'Fees', LX + 285, y, 7.5, reg, grey); y -= 5; p.drawLine({ start: { x: LX, y }, end: { x: LX + LW, y }, thickness: 0.6, color: rule }); y -= 13
  for (const e of d.expenses.slice(0, 6)) { T(p, e.date, LX, y, 8.5); T(p, e.description.slice(0, 40), LX + 75, y, 8.5); T(p, money(e.amount), LX + 285, y, 8.5); y -= 14 }
  if (!d.expenses.length) { T(p, 'No expenses this period.', LX, y, 8.5, reg, grey); y -= 14 }
  const gain = d.summary.appreciation + d.summary.interest
  p.drawRectangle({ x: LX, y: 112, width: LW, height: 16, color: shade }); T(p, 'Gains/Loss', LX + 6, 117, 8.5, bold); T(p, money(gain), LX + 80, 117, 8.5, bold)
  let ty = 100; for (const l of wrap('Values may not reflect all of your gains or losses and may be rounded. Cost basis may be incomplete or unavailable for some holdings and may change. Statement information should not be used for tax preparation; for more information contact ' + d.contact + '.', reg, 7, LW)) { T(p, l, LX, ty, 7, reg, grey); ty -= 9 }
  const chart = (title: string, top: number, h: number, pts: { x: string; y: number }[], color: ReturnType<typeof rgb>, fmt: (v: number) => string) => {
    p.drawLine({ start: { x: RX, y: top }, end: { x: RX + RW, y: top }, thickness: 0.6, color: rule }); T(p, title, RX, top - 18, 11)
    const bx = RX + 14, by = top - h, bw = RW - 20, bh = h - 40
    if (pts.length < 2) { T(p, 'Not enough data for this period.', bx, by + bh / 2, 8, reg, grey); return }
    const lo = Math.min(...pts.map((q) => q.y)), hi = Math.max(...pts.map((q) => q.y)), X = (i: number) => bx + (i / (pts.length - 1)) * bw, Y = (v: number) => by + ((v - lo) / (hi - lo || 1)) * bh
    p.drawSvgPath('M ' + (X(0) - bx).toFixed(2) + ' 0 ' + pts.map((q, i) => 'L ' + (X(i) - bx).toFixed(2) + ' ' + (-(Y(q.y) - by)).toFixed(2)).join(' ') + ' L ' + (X(pts.length - 1) - bx).toFixed(2) + ' 0 Z', { x: bx, y: by, color, opacity: 0.2, borderWidth: 0 })
    for (let i = 1; i < pts.length; i++) p.drawLine({ start: { x: X(i - 1), y: Y(pts[i - 1]!.y) }, end: { x: X(i), y: Y(pts[i]!.y) }, thickness: 1.1, color })
    T(p, pts[0]!.x, bx, by - 10, 6, reg, grey); R(p, pts[pts.length - 1]!.x, bx + bw, by - 10, 6, reg, grey); R(p, fmt(hi), bx + bw, by + bh + 3, 6.5, reg, grey); T(p, fmt(lo), bx - 12, by + 2, 6.5, reg, grey)
    R(p, title.includes('Gold') ? 'Gold: ' + fmt(pts[pts.length - 1]!.y) : fmt(pts[pts.length - 1]!.y), bx + bw, Y(pts[pts.length - 1]!.y) + 4, 7, bold, color)
  }
  chart((d.rates.label || 'Interest Rate') + ' Summary', H - 116, 160, d.rates.points.map((q) => ({ x: q.as_of, y: q.rate })), rgb(0.42, 0.62, 0.85), (v) => v.toFixed(2) + '%')
  chart('Gold Account Summary', H - 300, 175, (d.gold.length > 120 ? d.gold.filter((_, i) => i % Math.ceil(d.gold.length / 120) === 0) : d.gold).map((q) => ({ x: q.d, y: q.price })), rgb(0.95, 0.72, 0.15), (v) => '$' + Math.round(v).toLocaleString('en-US'))
  footer(p, 2)
  // page 3
  p = pdf.addPage([W, H]); header(p)
  T(p, 'Terms and Conditions', M, H - 140, 14, bold); T(p, 'General Information', M, H - 156, 8, bold, grey)
  const colW = (W - M * 2 - 30) / 2; const lines = wrap(d.terms, reg, 7.5, colW); let col = 0; y = H - 180
  for (const l of lines) { if (y < 150) { col++; y = H - 180; if (col > 1) break } T(p, l, M + col * (colW + 30), y, 7.5, reg, ink); y -= 10 }
  y = 120; for (const l of wrap('For inquiries, contact ' + d.contact + ' through your Aidi Wealth portal. (c) ' + new Date().getUTCFullYear() + ' ' + d.contact + '. All rights reserved.', reg, 7.5, W - M * 2)) { T(p, l, M, y, 7.5); y -= 10 }
  footer(p, 3)
  return pdf.save()
}
