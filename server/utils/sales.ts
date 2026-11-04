// Finvry sales and billing rules.
export const LEAD_STAGES = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'] as const
export const OPEN_STAGES = ['lead', 'qualified', 'demo', 'proposal', 'negotiation']
export const STAGE_PROB: Record<string, number> = { lead: 0.1, qualified: 0.25, demo: 0.4, proposal: 0.6, negotiation: 0.8, won: 1, lost: 0 }
export const LEAD_SOURCES = ['website', 'referral', 'event', 'outbound', 'inbound', 'partner', 'other'] as const

// Monthly value of a subscription (annual plans count as one twelfth a month).
export const MONTHLY_SQL = "((CASE WHEN s.billing = 'annual' THEN s.amount_usd / 12 ELSE s.amount_usd END) / (CASE WHEN s.currency = 'NGN' THEN (SELECT coalesce(nullif(value->>'ngn_per_usd', '')::numeric, 1600) FROM platform.settings WHERE key = 'billing') ELSE 1 END))"

// Plans companies pay from their Finvry wallet (Settings → Plan & billing), shaped like platform.subscriptions so MONTHLY_SQL works on them.
// Left out when the company also has a live platform subscription (invoiced or card), so nothing counts twice. A plan still in its free
// trial is 'trial' (not revenue); one cancelled before it was ever paid is left out.
export const WALLET_SUBS_SQL = `SELECT ws.id, ws.organization_id, ws.code AS plan_code, CASE WHEN ws.interval = 'year' THEN 'annual' ELSE 'monthly' END AS billing, 'wallet' AS method, ws.currency,
    (ws.amount_minor / 100.0)::numeric(14,2) AS amount_usd, coalesce(ws.started_on, ws.created_at::date) AS start_date,
    CASE WHEN ws.status = 'cancelled' THEN ws.updated_at::date END AS ended_at, CASE WHEN ws.status = 'cancelled' THEN 'cancelled' END AS end_reason,
    CASE WHEN ws.status = 'cancelled' THEN 'ended' WHEN o.status = 'trial' THEN 'trial' WHEN ws.status = 'suspended' OR ws.overdue_since IS NOT NULL THEN 'past_due' ELSE 'active' END AS status,
    ws.next_charge_at
  FROM wallet.subscriptions ws JOIN core.organizations o ON o.id = ws.organization_id
 WHERE ws.kind = 'plan' AND ws.amount_minor > 0
   AND NOT EXISTS (SELECT 1 FROM platform.subscriptions x WHERE x.organization_id = ws.organization_id AND x.status <> 'ended')
   AND (ws.status <> 'cancelled' OR EXISTS (SELECT 1 FROM wallet.ledger l WHERE l.organization_id = ws.organization_id AND l.kind = 'debit' AND l.category = 'subscription'))`
// Every subscription that is revenue: platform ones and wallet-paid plans (not trials).
export const ALL_SUBS_SQL = `SELECT id, organization_id, billing, currency, amount_usd, start_date, ended_at, end_reason FROM platform.subscriptions
  UNION ALL SELECT id, organization_id, billing, currency, amount_usd, start_date, ended_at, end_reason FROM (${WALLET_SUBS_SQL}) w WHERE w.status <> 'trial'`

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

export interface BillingSettings { issuer_name: string; issuer_address: string; issuer_email: string; invoice_prefix: string; payment_terms_days: number; payment_instructions: string; ngn_per_usd: number }
export async function billingSettings(): Promise<BillingSettings> {
  const r = await asPlatform(() => db().query<{ value: Partial<BillingSettings> }>("SELECT value FROM platform.settings WHERE key = 'billing'"))
  return Object.assign({ issuer_name: 'Finvry', issuer_address: '', issuer_email: '', invoice_prefix: 'FIN', payment_terms_days: 14, payment_instructions: '', ngn_per_usd: 1600 }, r.rows[0]?.value ?? {}) as BillingSettings
}
