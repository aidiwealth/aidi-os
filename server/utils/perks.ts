// Finvry perks: partner offers for companies on Finvry. Managed by Finvry staff (console → Perks).
export const PERK_CATEGORIES: Record<string, string> = { cloud: 'Cloud & infrastructure', software: 'Software & tools', finance: 'Banking & finance', legal: 'Legal & compliance', hr: 'People & payroll', marketing: 'Marketing & sales', ai: 'AI', other: 'Other' }
export interface PerkRow { id: string; partner: string; logo_url: string | null; website: string | null; category: string; headline: string; summary: string; details: string | null; redeem: string | null; code: string | null; claim_url: string | null; value_usd: number | null; audience: 'all' | 'paid'; public: boolean; featured: boolean; active: boolean; expires_on: string | null; sort: number }
export const PERK_COLS = "id, partner, logo_url, website, category, headline, summary, details, redeem, code, claim_url, value_usd::float AS value_usd, audience, public, featured, active, to_char(expires_on, 'YYYY-MM-DD') AS expires_on, sort"
export const LIVE = "active AND (expires_on IS NULL OR expires_on >= current_date)"
// A workspace on a paid plan (any priced plan, active) unlocks "paid" perks.
export async function onPaidPlan(): Promise<boolean> {
  const o = await currentOrg(); if (!o) return false
  const r = (await asPlatform(() => db().query<{ paid: boolean }>("SELECT (o.status = 'active' AND coalesce(p.price_monthly_usd, 0) > 0) AS paid FROM core.organizations o LEFT JOIN core.plans p ON p.code = o.plan_code WHERE o.id = $1", [o.id]))).rows[0]
  return !!r?.paid
}
