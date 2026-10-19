// The company's own monthly exchange rates (units of each currency per 1 USD), from the Exchange rates tab of an
// uploaded or linked file. The group view converts a subsidiary's month at that month's rate (fxRateAt in
// financials.ts); without one it uses the latest daily rate. Best effort: never fails an import.
import type { Grid } from './sheet-links'
import { fileRates } from './customer-import'

export async function saveMonthlyRates(rates: Map<string, Map<string, number>>, source: string): Promise<number> {
  let n = 0
  for (const [quote, by] of rates) {
    if (!/^[A-Z]{3}$/.test(quote) || quote === 'USD') continue
    for (const [m, v] of by) {
      if (!/^\d{4}-\d{2}$/.test(m) || !(v > 0) || v > 1e7) continue
      await db().query(`INSERT INTO fx.monthly (quote, month, per_usd, source) VALUES ($1, $2::date, $3, $4)
        ON CONFLICT (organization_id, quote, month) DO UPDATE SET per_usd = excluded.per_usd, source = excluded.source, updated_at = now()`, [quote, m + '-01', v, source.slice(0, 40)])
      n++
    }
  }
  return n
}
export async function saveFileRates(grids: Grid[], source: string): Promise<number> {
  try { const r = fileRates(grids); return r.size ? await saveMonthlyRates(r, source) : 0 } catch (e) { console.error('[fx] monthly rates', (e as Error).message); return 0 }
}
