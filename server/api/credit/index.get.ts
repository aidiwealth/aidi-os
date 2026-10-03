// The credit book: every loan with its live position, and portfolio totals per currency.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const loans = await db().query<{ id: string; reference: string | null; borrower: string; borrower_id: string; sector: string | null; country: string | null; lender: string | null; principal: string; currency: string; annual_rate: string; status: string; disbursed_on: string }>(
    `SELECT l.id, l.reference, b.name AS borrower, b.id AS borrower_id, b.sector, b.country, e.name AS lender, l.principal::text, l.currency, l.annual_rate::text, l.status,
            to_char(l.disbursed_on, 'YYYY-MM-DD') AS disbursed_on
       FROM credit.loans l JOIN credit.borrowers b ON b.id = l.borrower_id LEFT JOIN core.entities e ON e.id = l.lender_entity_id
      ORDER BY (l.status = 'active') DESC, l.disbursed_on DESC`)
  const rows: ((typeof loans.rows)[number] & { outstanding: number; arrears: number; dpd: number; bucket: string; next: { due_date: string; amount: number } | null; interestReceived: number })[] = []
  const totals: Record<string, { outstanding: number; arrears: number; par30: number; interest12m: number; loans: number }> = {}
  const monthly: Record<string, Record<string, number>> = {}
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)).toISOString().slice(0, 10)
  for (const l of loans.rows) {
    const pos = await loadPosition(l.id, Number(l.principal))
    const live = l.status === 'active'
    rows.push({ ...l, outstanding: live ? pos.outstandingPrincipal : 0, arrears: live ? pos.arrears : 0, dpd: live ? pos.dpd : 0, bucket: live ? pos.bucket : 'current', next: live ? pos.next : null, interestReceived: pos.interestReceived })
    const t = (totals[l.currency] ??= { outstanding: 0, arrears: 0, par30: 0, interest12m: 0, loans: 0 })
    if (live) { t.loans++; t.outstanding += pos.outstandingPrincipal; t.arrears += pos.arrears; if (pos.dpd > 30) t.par30 += pos.outstandingPrincipal }
    for (const a of pos.allocations) if (a.received_on >= since) {
      t.interest12m += a.interest
      const m = a.received_on.slice(0, 7) + '-01'
      const c = (monthly[l.currency] ??= {}); c[m] = (c[m] ?? 0) + a.interest
    }
  }
  const keys = seriesKeys('12m', 'month')
  const interestSeries = Object.fromEntries(Object.entries(monthly).map(([c, m]) => [c, keys.map((k) => ({ period: k, value: Math.round((m[k] ?? 0) * 100) / 100 }))]))
  const exposure = (by: 'borrower' | 'sector' | 'country') => {
    const m: Record<string, Record<string, number>> = {}
    for (const r of rows) if (r.status === 'active' && r.outstanding > 0) { const k = (r[by] ?? 'Not set') as string; (m[k] ??= {})[r.currency] = (m[k]![r.currency] ?? 0) + r.outstanding }
    return Object.entries(m).map(([name, t]) => ({ name, totals: t }))
  }
  return { loans: rows, totals, interestSeries, byBorrower: exposure('borrower'), bySector: exposure('sector'), byCountry: exposure('country') }
})
