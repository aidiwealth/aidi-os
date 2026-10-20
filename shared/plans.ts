// What each Finvry plan includes, for the sign-up, Settings → Plan and the upgrade pages. Prices come from the plans
// table (a monthly price, billed yearly). Every plan starts with a 14-day free trial.
export const PLAN_FEATS: Record<string, string[]> = {
  company_free: ['Dashboard and Financials', 'Live bank balances', 'Annual financial report (PDF and Excel)', 'Public investor page and data room', 'Finvry AI analyst', '1 team member'],
  company_startup: ['Financials, live bank balances and the annual financial report', 'Burn and runway checked three ways, and the AI analyst', 'AI investor updates with open tracking', 'Fundraising pipeline, data room, investor and grant finder', 'Cap table, SAFEs, e-signing, board consents and certificates', 'Compliance calendar and services', 'Up to 5 team members'],
  company_medium: ['Everything in Startup', 'Forecasts from your books, bank or accountant\'s model', 'Revenue retention, churn and cohorts', 'Customer analysis, with customer revenue from a live sheet', 'Monthly management report', 'Up to 10 team members, more AI and storage'],
  company_scale: ['Everything in Medium', 'Subsidiaries, each in its own currency', 'Consolidated group view and group forecast', 'Intercompany checks across the group', 'Up to 25 team members, the most AI and storage', 'Priority service'] }
export const PLAN_NAME: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_medium: 'Medium', company_scale: 'Scale', internal: 'Internal' }
// Which plan unlocks a feature that is not on Startup.
export const PLAN_FOR: Record<string, string> = { forecast: 'company_medium', fin_customers: 'company_medium', fin_report: 'company_medium', subsidiaries: 'company_scale' }
