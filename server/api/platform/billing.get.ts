// Billing: subscriptions (live and ended) with monthly value and next renewal, invoices with status, and totals.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return await asPlatform(async () => {
    const subs = await db().query<{ id: string; organization_id: string; customer: string; plan: string; plan_code: string; billing: string; method: string; amount_usd: string; monthly: string; status: string; start_date: string; ended_at: string | null; end_reason: string | null }>(
      `SELECT s.id, s.organization_id, o.name AS customer, p.name AS plan, s.plan_code, s.billing, s.method, s.amount_usd::text, ${MONTHLY_SQL}::numeric(12,2)::text AS monthly,
              s.status, to_char(s.start_date, 'YYYY-MM-DD') AS start_date, to_char(s.ended_at, 'YYYY-MM-DD') AS ended_at, s.end_reason
         FROM platform.subscriptions s JOIN core.organizations o ON o.id = s.organization_id JOIN core.plans p ON p.code = s.plan_code
        ORDER BY (s.status = 'ended'), o.name, s.start_date DESC`)
    const inv = await db().query<{ id: string; number: string; organization_id: string; customer: string; issue_date: string; due_date: string; amount: string; currency: string; status: string; paid_at: string | null; overdue: boolean }>(
      `SELECT i.id, i.number, i.organization_id, o.name AS customer, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
              i.amount::text, i.currency, i.status, to_char(i.paid_at, 'YYYY-MM-DD') AS paid_at, (i.status = 'sent' AND i.due_date < current_date) AS overdue
         FROM platform.invoices i JOIN core.organizations o ON o.id = i.organization_id ORDER BY i.issue_date DESC, i.number DESC LIMIT 500`)
    const live = subs.rows.filter((s) => s.status !== 'ended')
    const mrr = live.reduce((t, s) => t + Number(s.monthly), 0)
    const outstanding = inv.rows.filter((i) => i.status === 'sent')
    return {
      subscriptions: subs.rows.map((s) => ({ ...s, renews: s.status === 'ended' ? null : nextRenewal(s.start_date, s.billing) })),
      invoices: inv.rows,
      kpis: { mrr, arr: mrr * 12, live: live.length, outstanding: outstanding.reduce((t, i) => t + Number(i.amount), 0), overdue: outstanding.filter((i) => i.overdue).reduce((t, i) => t + Number(i.amount), 0), overdueCount: outstanding.filter((i) => i.overdue).length }
    }
  })
})
