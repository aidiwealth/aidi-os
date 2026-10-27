// Public Markets trading maths: sizing trades for an account from the valuations, the checks each trade must pass,
// and what a fill does to the position, the cash and the books. Plain functions, no data access, tested in
// tests/sheets. The AI never sizes trades: these rules do, from the account's risk level, its target mix and the
// signals the valuation model produced.
import type { Signal } from './quant'

// Limits by risk level (percent of the account): the most in one company, the most in crypto, the least in cash.
export const RISK_LIMITS: Record<string, { label: string; single: number; crypto: number; cash: number }> = {
  conservative: { label: 'Conservative', single: 3, crypto: 0, cash: 30 },
  moderately_conservative: { label: 'Moderately conservative', single: 5, crypto: 2, cash: 25 },
  moderate: { label: 'Moderate', single: 7, crypto: 5, cash: 20 },
  growth: { label: 'Growth', single: 10, crypto: 8, cash: 10 },
  aggressive: { label: 'Aggressive', single: 15, crypto: 15, cash: 5 }
}
export const limitsFor = (risk: string) => RISK_LIMITS[risk] ?? RISK_LIMITS.moderate!

export interface Holding { symbol: string; kind: 'stock' | 'etf' | 'crypto'; qty: number; price: number; signal?: Signal | null; mos?: number | null; label?: string | null; dataOk?: boolean; priceFresh?: boolean }
export interface Check { name: string; ok: boolean; detail: string }
export interface Draft { symbol: string; side: 'buy' | 'sell'; qty: number; limit: number; notional: number; weight_now: number; weight_after: number; reason: string; checks: Check[] }
export interface SizeInput { cash: number; holdings: Holding[]; candidates: Holding[]; risk: string; fractional: boolean; open: string[]; dailyUsed: number; dailyLimit: number }

const r2 = (x: number) => Math.round(x * 100) / 100
const pctS = (x: number) => (Math.round(x * 10) / 10).toFixed(1) + '%'
export const accountValue = (cash: number, h: Holding[]) => cash + h.reduce((a, x) => a + x.qty * x.price, 0)

// Size the trades one account should make now. Stocks move towards a target weight set by their signal (add 4 points
// for a strong buy, 2 for a buy, trim 2, sell all), never above the single-company limit; crypto is only trimmed back
// under its limit; buys are paid from cash above the cash floor, best margin of safety first; tiny trades are dropped.
export function sizeTrades(i: SizeInput): Draft[] {
  const L = limitsFor(i.risk), V = accountValue(i.cash, i.holdings)
  if (!(V > 0)) return []
  const min = Math.max(100, V * 0.005), floor = (V * L.cash) / 100
  let spare = i.cash - floor, used = i.dailyUsed
  const out: Draft[] = []
  const all = [...i.holdings, ...i.candidates.filter((c) => !i.holdings.some((h) => h.symbol === c.symbol))]
  const qtyOf = (amount: number, price: number) => (i.fractional ? Math.floor((amount / price) * 1e4) / 1e4 : Math.floor(amount / price))
  const push = (h: Holding, side: 'buy' | 'sell', qty: number, reason: string) => {
    if (!(qty > 0)) return
    const limit = r2(h.price * (side === 'buy' ? 1 : -1) * (h.kind === 'crypto' ? 0.005 : 0.002) + h.price)
    const notional = r2(qty * limit), now = ((h.qty * h.price) / V) * 100
    const after = (((h.qty + (side === 'buy' ? qty : -qty)) * h.price) / V) * 100
    const cashAfter = i.cash + (side === 'buy' ? -notional : notional) - out.reduce((a, d) => a + (d.side === 'buy' ? d.notional : -d.notional), 0)
    const checks: Check[] = [
      { name: 'Single-company limit', ok: h.kind !== 'stock' || after <= L.single + 0.01, detail: pctS(after) + ' of ' + L.single + '%' },
      { name: 'Cash floor', ok: side === 'sell' || cashAfter >= floor - 0.01, detail: 'cash stays ' + pctS((cashAfter / V) * 100) + ', floor ' + L.cash + '%' },
      { name: 'Price is fresh', ok: h.priceFresh !== false, detail: h.priceFresh === false ? 'price older than 15 minutes' : 'live price' },
      { name: 'Valuation data', ok: h.kind !== 'stock' || h.dataOk !== false, detail: h.kind !== 'stock' ? 'not needed' : h.dataOk === false ? 'filings out of date' : 'filings current' },
      { name: 'No open trade in it', ok: !i.open.includes(h.symbol), detail: i.open.includes(h.symbol) ? 'already waiting' : 'none waiting' },
      { name: 'Daily limit', ok: used + notional <= i.dailyLimit, detail: '$' + Math.round(used + notional).toLocaleString('en-US') + ' of $' + Math.round(i.dailyLimit).toLocaleString('en-US') }]
    used += notional
    out.push({ symbol: h.symbol, side, qty, limit, notional, weight_now: r2(now), weight_after: r2(after), reason, checks })
  }
  // Sells and trims first (they free cash), then buys by margin of safety.
  const cryptoW = all.filter((h) => h.kind === 'crypto').reduce((a, h) => a + h.qty * h.price, 0) / V * 100
  for (const h of all) {
    if (!h.qty) continue
    const w = ((h.qty * h.price) / V) * 100
    let target = w, why = ''
    if (h.kind === 'stock') {
      if (h.signal === 'sell') { target = 0; why = 'The price is well above our value (margin of safety ' + pctS(h.mos ?? 0) + '): sell.' }
      else if (h.signal === 'trim') { target = Math.max(0, w - 2); why = 'The price is above our value (margin of safety ' + pctS(h.mos ?? 0) + '): trim by about 2 points.' }
      if (target > L.single) { target = L.single; why = why || 'Above the ' + L.single + '% single-company limit: trim back to it.' }
      else if (w > L.single) { target = Math.min(target, L.single); why = why || 'Above the ' + L.single + '% single-company limit: trim back to it.' }
    } else if (h.kind === 'crypto' && cryptoW > L.crypto) { target = w * (L.crypto / cryptoW); why = 'Crypto is ' + pctS(cryptoW) + ' of the account, above the ' + L.crypto + '% limit: trim back.' }
    if (target >= w) continue
    const amount = ((w - target) / 100) * V
    if (amount < min && target > 0) continue
    const qty = target === 0 ? h.qty : Math.min(h.qty, qtyOf(amount, h.price))
    if (qty > 0) { push(h, 'sell', qty, why); spare += qty * h.price }
  }
  const buys = all.filter((h) => h.kind === 'stock' && (h.signal === 'buy' || h.signal === 'strong_buy') && h.dataOk !== false).sort((a, b) => (b.mos ?? 0) - (a.mos ?? 0))
  for (const h of buys) {
    const w = ((h.qty * h.price) / V) * 100, target = Math.min(L.single, w + (h.signal === 'strong_buy' ? 4 : 2))
    let amount = Math.min(((target - w) / 100) * V, spare)
    if (amount < min) continue
    const qty = qtyOf(amount, h.price * 1.002)
    if (qty <= 0) continue
    amount = qty * h.price
    spare -= amount
    push(h, 'buy', qty, (h.signal === 'strong_buy' ? 'Strong buy' : 'Buy') + ': the price is ' + pctS(h.mos ?? 0) + ' below our value' + (h.qty ? ', so add to the position' : ', so start a position') + ', staying under the ' + L.single + '% limit.' + (h.label ? ' AI review: ' + h.label : ''))
  }
  return out
}

// What a fill does to a position and to cash. Cost is the average cost of the shares held: a sale takes out its share of
// the cost, and the difference from what it raised is the realised gain.
export interface FillEffect { qty: number; cost: number; cash_change: number; cost_out: number; realised: number; amount: number }
export function applyFill(pos: { qty: number; cost: number } | null, f: { side: 'buy' | 'sell'; qty: number; price: number; fees: number }): FillEffect {
  const q0 = pos?.qty ?? 0, c0 = pos?.cost ?? 0, gross = f.qty * f.price
  if (f.side === 'buy') { const amount = r2(gross + f.fees); return { qty: q0 + f.qty, cost: r2(c0 + amount), cash_change: -amount, cost_out: 0, realised: 0, amount } }
  if (f.qty > q0 + 1e-9) throw new Error('Selling more than the account holds')
  const costOut = q0 ? r2((c0 * f.qty) / q0) : 0, proceeds = r2(gross - f.fees)
  return { qty: Math.max(0, q0 - f.qty), cost: r2(Math.max(0, c0 - costOut)), cash_change: proceeds, cost_out: costOut, realised: r2(proceeds - costOut), amount: proceeds }
}
// The journal lines for a fill in a company's books (debits equal credits).
export function fillJournal(e: FillEffect, side: 'buy' | 'sell', kind: 'stock' | 'etf' | 'crypto', brokerName: string): { account: string; debit: number; credit: number }[] {
  const inv = kind === 'crypto' ? 'Investments: crypto' : 'Investments: listed securities', cash = 'Cash at broker: ' + brokerName
  if (side === 'buy') return [{ account: inv, debit: e.amount, credit: 0 }, { account: cash, debit: 0, credit: e.amount }]
  const lines = [{ account: cash, debit: e.amount, credit: 0 }, { account: inv, debit: 0, credit: e.cost_out }]
  if (e.realised > 0) lines.push({ account: 'Realised gain on investments', debit: 0, credit: e.realised })
  if (e.realised < 0) lines.push({ account: 'Realised loss on investments', debit: -e.realised, credit: 0 })
  return lines
}
