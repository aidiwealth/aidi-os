// Finvry sales and billing rules.
export const LEAD_STAGES = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'] as const
export const OPEN_STAGES = ['lead', 'qualified', 'demo', 'proposal', 'negotiation']
export const STAGE_PROB: Record<string, number> = { lead: 0.1, qualified: 0.25, demo: 0.4, proposal: 0.6, negotiation: 0.8, won: 1, lost: 0 }
export const LEAD_SOURCES = ['website', 'referral', 'event', 'outbound', 'inbound', 'partner', 'other'] as const

// Monthly value of a subscription (annual plans count as one twelfth a month).
export const MONTHLY_SQL = "(CASE WHEN s.billing = 'annual' THEN s.amount_usd / 12 ELSE s.amount_usd END)"

// The next renewal date on or after today for a subscription that started on `start`.
export function nextRenewal(start: string, billing: string, today = new Date().toISOString().slice(0, 10)): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const step = billing === 'annual' ? 12 : 1
  for (let i = 1; i < 1200; i++) {
    const t = new Date(Date.UTC(y, m - 1 + i * step, 1))
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
    t.setUTCDate(Math.min(d, last))
    const iso = t.toISOString().slice(0, 10)
    if (iso >= today) return iso
  }
  return today
}

export interface BillingSettings { issuer_name: string; issuer_address: string; issuer_email: string; invoice_prefix: string; payment_terms_days: number; payment_instructions: string }
export async function billingSettings(): Promise<BillingSettings> {
  const r = await asPlatform(() => db().query<{ value: Partial<BillingSettings> }>("SELECT value FROM platform.settings WHERE key = 'billing'"))
  return { issuer_name: 'Finvry', issuer_address: '', issuer_email: '', invoice_prefix: 'FIN', payment_terms_days: 14, payment_instructions: '', ...(r.rows[0]?.value ?? {}) }
}
