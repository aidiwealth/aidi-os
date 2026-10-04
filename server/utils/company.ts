// A Finvry company workspace's own record (created with the workspace) and helpers for its dashboard and investor page.
export async function companyEntityId(): Promise<string | null> {
  const r = await db().query<{ id: string }>("SELECT id FROM core.entities WHERE kind = 'operating' ORDER BY created_at LIMIT 1")
  return r.rows[0]?.id ?? null
}
export const METRIC_LABEL: Record<string, string> = { revenue: 'Revenue', gross_profit: 'Gross profit', gross_margin: 'Gross margin', opex_total: 'Operating costs', ebitda: 'EBITDA', net_income: 'Net income', cash: 'Cash', burn: 'Monthly burn', runway: 'Runway', total_assets: 'Total assets', equity: 'Equity' }
