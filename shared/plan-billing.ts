// How Finvry plans are billed, set by the Finvry team: monthly only, yearly only, or the company's choice. Paying yearly
// takes a discount off twelve months (5% to start; the team sets it). The same sums run in the app, the console and
// finvry.com, so every price shown follows the setting.
export type Cycles = 'monthly' | 'annual' | 'both'
export interface PlanBilling { cycles: Cycles; annual_discount_pct: number }
export const DEFAULT_BILLING: PlanBilling = { cycles: 'both', annual_discount_pct: 5 }
export const yearOf = (monthly: number, pct: number) => Math.round(monthly * 12 * (100 - pct)) / 100
// The cycle a company pays on: fixed by the setting, or its own choice when both are offered (monthly if none yet).
export const cycleFor = (pb: PlanBilling, choice?: unknown): 'month' | 'year' => (pb.cycles === 'monthly' ? 'month' : pb.cycles === 'annual' ? 'year' : choice === 'year' ? 'year' : 'month')
