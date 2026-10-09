// VAT / sales tax: one rule per country (Settings → Tax in the Finvry console), applied the same way to every invoice.
// The tax is added as its own invoice line (kind 'tax') so every invoice view, email, PDF and payment shows and
// charges the same total; the invoice also keeps subtotal, rate and tax amount for reporting.
export type TaxScope = 'services' | 'platform' | 'wealth'
export interface TaxRate { country: string; label: string; rate: number; enabled: boolean; applies_to: TaxScope[] }
export interface Line { description: string; quantity: number; unit_amount: number; amount: number; kind?: string; [k: string]: unknown }

let cache: { at: number; rows: TaxRate[] } | null = null
export async function taxRates(fresh = false): Promise<TaxRate[]> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.rows
  const rows = (await asPlatform(() => db().query<TaxRate & { rate: string }>('SELECT country, label, rate::text AS rate, enabled, applies_to FROM core.tax_rates ORDER BY country'))).rows
    .map((r) => ({ ...r, rate: Number(r.rate) }))
  cache = { at: Date.now(), rows }
  return rows
}
export function forgetTaxRates() { cache = null }

const NAMES: Record<string, string> = { nigeria: 'NG', 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', ghana: 'GH', kenya: 'KE', 'south africa': 'ZA', canada: 'CA' }
// The billing country: a 2-letter code or a country name; naira invoices are always Nigerian.
export function taxCountry(opts: { country?: string | null; currency?: string | null; region?: string | null }): string {
  if (opts.currency === 'NGN' || opts.region === 'ng') return 'NG'
  const c = (opts.country ?? '').trim()
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase()
  return NAMES[c.toLowerCase()] ?? 'US'
}

const r2 = (v: number) => Math.round(v * 100) / 100
// Lines in, lines out with the tax line added (any old tax line is replaced), plus the totals to store.
export async function applyTax(lines: Line[], country: string, scope: TaxScope): Promise<{ lines: Line[]; country: string; subtotal: number; tax_label: string | null; tax_rate: number | null; tax_amount: number; amount: number }> {
  const items = lines.filter((l) => l.kind !== 'tax')
  const subtotal = r2(items.reduce((t, l) => t + Number(l.amount), 0))
  const rule = (await taxRates()).find((t) => t.country === country && t.enabled && t.rate > 0 && t.applies_to.includes(scope))
  if (!rule || !subtotal) return { lines: items, country, subtotal, tax_label: null, tax_rate: null, tax_amount: 0, amount: subtotal }
  const tax = r2(subtotal * rule.rate / 100)
  const label = rule.label + ' (' + rule.rate + '%)'
  return { lines: [...items, { description: label, quantity: 1, unit_amount: tax, amount: tax, kind: 'tax' }], country, subtotal, tax_label: rule.label, tax_rate: rule.rate, tax_amount: tax, amount: r2(subtotal + tax) }
}

// For a single-amount fee (wealth fees): the net amount in, the tax and gross amount out.
export async function taxOnAmount(net: number, country: string, scope: TaxScope): Promise<{ country: string; subtotal: number; tax_label: string | null; tax_rate: number | null; tax_amount: number; amount: number }> {
  const t = await applyTax([{ description: 'x', quantity: 1, unit_amount: net, amount: net }], country, scope)
  return { country, subtotal: t.subtotal, tax_label: t.tax_label, tax_rate: t.tax_rate, tax_amount: t.tax_amount, amount: t.amount }
}
