// The Finvry team's plan billing setting (platform.settings 'plan_billing'). See shared/plan-billing.ts.
import { DEFAULT_BILLING, type PlanBilling } from '~/shared/plan-billing'
export async function planBilling(): Promise<PlanBilling> {
  const v = (await asPlatform(() => db().query<{ value: Partial<PlanBilling> }>("SELECT value FROM platform.settings WHERE key = 'plan_billing'")).catch(() => ({ rows: [] }))).rows[0]?.value ?? {}
  const cycles = v.cycles === 'monthly' || v.cycles === 'annual' || v.cycles === 'both' ? v.cycles : DEFAULT_BILLING.cycles
  const pct = Number(v.annual_discount_pct ?? DEFAULT_BILLING.annual_discount_pct)
  return { cycles, annual_discount_pct: Number.isFinite(pct) ? Math.min(90, Math.max(0, pct)) : DEFAULT_BILLING.annual_discount_pct }
}
