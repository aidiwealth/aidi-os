// The Fortress Balance Sheet: Aidi's guide allocation for wealth clients. Each bucket gathers the client's holdings
// and accounts by type, and the review shows target against today, with the amount to move.
export interface FortressBucket { key: string; label: string; pct: number; where: string }
export interface Fortress { US: FortressBucket[]; NG: FortressBucket[]; company_stock: { min: number; max: number; note: string }; retirement_note: string }
export function fortressDefaults(): Fortress {
  return {
    US: [
      { key: 'cash', label: 'Cash in bank', pct: 30, where: 'Bank accounts' },
      { key: 'stocks', label: 'Stocks, ETFs & private investments', pct: 20, where: 'Robinhood' },
      { key: 'real_estate', label: 'Real estate', pct: 20, where: 'Arrived' },
      { key: 'metals', label: 'Precious metals', pct: 10, where: 'APMEX' },
      { key: 'tbills', label: 'Treasury bills or 6-month bank CDs', pct: 15, where: 'Robinhood or a bank' },
      { key: 'crypto', label: 'Crypto (Bitcoin and Ethereum)', pct: 5, where: 'Robinhood' }],
    NG: [
      { key: 'cash', label: 'Cash in bank', pct: 30, where: 'Bank accounts' },
      { key: 'stocks', label: 'Stocks & private investments', pct: 20, where: 'Aidi Wealth' },
      { key: 'real_estate', label: 'Real estate', pct: 20, where: 'Sun Plannet' },
      { key: 'tbills', label: 'Treasury bills or fixed savings', pct: 25, where: 'T-bills or fixed savings' },
      { key: 'crypto', label: 'Crypto (Bitcoin and Ethereum)', pct: 5, where: 'Busha' }],
    company_stock: { min: 50000, max: 100000, note: 'Keep company stock between $50,000 and $100,000; plan to sell anything above that over time to reduce reliance on one employer.' },
    retirement_note: 'Leave workplace retirement accounts with the company broker. If you are between jobs or self-employed, consider a self-directed IRA with Robinhood.' }
}
export async function fortressSettings(): Promise<Fortress> {
  const s = ((((await currentOrg())?.settings ?? {}) as Record<string, unknown>).wm_config as Record<string, unknown> | undefined)?.fortress as Partial<Fortress> | undefined
  const d = fortressDefaults()
  return { US: s?.US?.length ? s.US : d.US, NG: s?.NG?.length ? s.NG : d.NG, company_stock: { ...d.company_stock, ...(s?.company_stock ?? {}) }, retirement_note: s?.retirement_note ?? d.retirement_note }
}
const COMPANY_RX = /(rsu|espp|employee stock|company stock|employer stock|stock options|vested)/i
// Sort what the client holds into Fortress buckets (USD).
export async function fortressView(clientId: string) {
  const c = (await db().query<{ country: 'US' | 'NG' }>('SELECT country FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  if (!c) return null
  const cfg = await fortressSettings(), model = cfg[c.country]
  const s = await clientSummary(clientId)
  const usd = async (v: number, cur: string) => (cur === 'USD' ? v : v * ((await fxRate(cur, 'USD')) ?? 0))
  const have: Record<string, number> = { cash: 0, stocks: 0, real_estate: 0, metals: 0, tbills: 0, crypto: 0, other: 0 }
  let company = 0, retirement = 0
  for (const h of s.holdings) {
    if (h.category === 'liability') continue
    const v = await usd(Number(h.current_value ?? h.cost ?? 0), h.currency), m = (h.meta ?? {}) as Record<string, unknown>
    if (h.category === 'retirement') { retirement += v; continue }
    if (COMPANY_RX.test(h.name + ' ' + (h.notes ?? '')) || (h.category === 'private_stake' && m.employer)) { company += v; continue }
    const k = h.category === 'cash' ? (m.rate ? 'tbills' : 'cash') : ['public_securities', 'fund', 'private_stake', 'venture'].includes(h.category) ? 'stocks' : h.category === 'real_estate' ? 'real_estate' : h.category === 'precious_metals' ? 'metals' : h.category === 'bonds' ? 'tbills' : h.category === 'crypto' ? 'crypto' : 'other'
    have[k] = (have[k] ?? 0) + v
  }
  for (const a of s.accounts) { const v = await usd(Number(a.balance), a.currency); const k = a.kind === 'bank' ? 'cash' : a.kind === 'savings' ? 'tbills' : a.kind === 'brokerage' ? 'stocks' : a.kind === 'crypto' ? 'crypto' : a.kind === 'retirement' ? 'retirement' : 'other'; if (k === 'retirement') retirement += v; else have[k] = (have[k] ?? 0) + v }
  for (const b of s.banks) if (b.current != null && !['credit', 'loan'].includes(b.subtype ?? '')) have.cash = (have.cash ?? 0) + await usd(Number(b.current), b.currency)
  const keys = new Set(model.map((m) => m.key))
  for (const k of ['metals', 'crypto']) if (!keys.has(k)) { have.other = (have.other ?? 0) + (have[k] ?? 0); have[k] = 0 }
  const base = Object.values(have).reduce((a, x) => a + x, 0)
  const r = (x: number) => Math.round(x)
  const rows = model.map((m) => { const cur = have[m.key] ?? 0, tgt = (base * m.pct) / 100; return { key: m.key, label: m.label, where: m.where, target_pct: m.pct, current_pct: base ? Math.round((cur / base) * 1000) / 10 : 0, target: r(tgt), current: r(cur), gap: r(tgt - cur) } })
  const notes: string[] = []
  if ((have.other ?? 0) > 0) notes.push('Other holdings of about $' + r(have.other!).toLocaleString('en-US') + ' do not fit a Fortress bucket yet (for example items recorded as "other"); classify them, or move them into the buckets above over time.')
  if (c.country === 'US') {
    if (company > 0) notes.push('Company stock is about $' + r(company).toLocaleString('en-US') + '. ' + (company > cfg.company_stock.max ? 'That is above the $' + cfg.company_stock.max.toLocaleString('en-US') + ' guide: ' : '') + cfg.company_stock.note)
    else notes.push(cfg.company_stock.note)
    notes.push(cfg.retirement_note + (retirement > 0 ? ' Retirement accounts recorded: about $' + r(retirement).toLocaleString('en-US') + ' (kept outside the percentages above).' : ''))
  }
  return { name: 'Fortress Balance Sheet', country: c.country, base: r(base), rows, company_stock: r(company), retirement: r(retirement), notes,
    disclaimer: 'The Fortress Balance Sheet is Aidi\'s general guide to a resilient mix of assets. It is not personalised investment, tax or legal advice, and it is not a recommendation to buy or sell any security, property or product, or to use any named platform. Platforms are examples, not endorsements. Your circumstances, goals and risk tolerance may call for a different mix; speak with a licensed adviser before acting. Investments can lose value.' }
}
