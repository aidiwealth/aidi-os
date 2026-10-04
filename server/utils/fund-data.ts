// Loading a fund's position: commitments, calls and distributions, payments, NAV, and per-LP figures.
import { createHash } from 'node:crypto'
export interface LpPosition { lp_id: string; name: string; email: string | null; commitment: number; called: number; paidIn: number; unfunded: number; distributed: number; navShare: number; m: Multiples }

export async function fundPosition(fundId: string) {
  const f = await db().query<{ id: string; entity_id: string; name: string; currency: string; target_size: string | null; vintage: number | null; first_close: string | null; final_close: string | null; term_years: number | null; mgmt_fee_pct: string | null; carry_pct: string | null; hurdle_pct: string | null; status: string; administrator: string; administrator_name: string | null; admin_portal_url: string | null; notify_lps: boolean }>(
    `SELECT f.id, f.entity_id, e.name, f.currency, f.target_size::text, f.vintage, to_char(f.first_close, 'YYYY-MM-DD') AS first_close, to_char(f.final_close, 'YYYY-MM-DD') AS final_close,
            f.term_years, f.mgmt_fee_pct::text, f.carry_pct::text, f.hurdle_pct::text, f.status, f.administrator, f.administrator_name, f.admin_portal_url, f.notify_lps
       FROM funds.funds f JOIN core.entities e ON e.id = f.entity_id WHERE f.id = $1`, [fundId])
  const fund = f.rows[0]
  if (!fund) return null
  const com = await db().query<{ id: string; lp_id: string; name: string; email: string | null; amount: string; committed_on: string }>(
    "SELECT c.id, c.lp_id, l.name, l.email, c.amount::text, to_char(c.committed_on, 'YYYY-MM-DD') AS committed_on FROM funds.commitments c JOIN funds.lps l ON l.id = c.lp_id WHERE c.fund_id = $1 ORDER BY c.amount DESC", [fundId])
  const lines = await db().query<{ lp_id: string; kind: string; status: string; amount: string; paid_amount: string; paid_on: string | null; due_date: string }>(
    `SELECT l.lp_id, c.kind, c.status, l.amount::text, l.paid_amount::text, to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on, to_char(c.due_date, 'YYYY-MM-DD') AS due_date
       FROM funds.call_lines l JOIN funds.calls c ON c.id = l.call_id WHERE c.fund_id = $1 AND c.status IN ('sent','completed')`, [fundId])
  const nav = await db().query<{ as_of: string; nav: string }>("SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, nav::text FROM funds.navs WHERE fund_id = $1 ORDER BY as_of DESC LIMIT 1", [fundId])
  const navNow = Number(nav.rows[0]?.nav ?? 0), navDate = nav.rows[0]?.as_of ?? null
  const flowsFor = (lp?: string) => lines.rows.filter((x) => !lp || x.lp_id === lp).filter((x) => Number(x.paid_amount) > 0)
    .map((x) => ({ date: x.paid_on ?? x.due_date, amount: x.kind === 'call' ? -Number(x.paid_amount) : Number(x.paid_amount) }))
  const sum = (rows: typeof lines.rows, kind: string, field: 'amount' | 'paid_amount') => Math.round(rows.filter((x) => x.kind === kind).reduce((s, x) => s + Number(x[field]), 0) * 100) / 100
  const committed = Math.round(com.rows.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100
  const called = sum(lines.rows, 'call', 'amount'), paidIn = sum(lines.rows, 'call', 'paid_amount'), distributed = sum(lines.rows, 'distribution', 'paid_amount')
  const lps: LpPosition[] = com.rows.map((c) => {
    const mine = lines.rows.filter((x) => x.lp_id === c.lp_id)
    const lc = sum(mine, 'call', 'amount'), lp = sum(mine, 'call', 'paid_amount'), ld = sum(mine, 'distribution', 'paid_amount')
    const share = paidIn ? navNow * (lp / paidIn) : 0
    return { lp_id: c.lp_id, name: c.name, email: c.email, commitment: Number(c.amount), called: lc, paidIn: lp, unfunded: Math.max(0, Number(c.amount) - lc), distributed: ld, navShare: share, m: multiples(lp, ld, share, flowsFor(c.lp_id), navDate) }
  })
  const deployed = await one<{ v: string }>("SELECT coalesce(sum(check_usd), 0)::text AS v FROM deals.deals WHERE vehicle_entity_id = $1 AND stage = 'invested'", [fund.entity_id])
  return {
    fund, commitments: com.rows, lps, navDate,
    totals: { committed, called, paidIn, unfunded: Math.max(0, Math.round((committed - called) * 100) / 100), distributed, nav: navNow, deployed: Number(deployed.v), calledPct: committed ? called / committed : 0 },
    m: multiples(paidIn, distributed, navNow, flowsFor(), navDate)
  }
}

// The fund's administrator, in words (official statements, KYC, payments and tax sit with them).
export function adminName(f: { administrator: string; administrator_name: string | null }): string | null {
  return ({ sydecar: 'Sydecar', carta: 'Carta', angellist: 'AngelList', other: f.administrator_name || 'your fund administrator', self: null } as Record<string, string | null>)[f.administrator] ?? null
}

// GP approvals needed: two, or every GP when there are fewer than two.
export async function requiredApprovals(): Promise<number> {
  const r = await one<{ n: number }>(`SELECT count(DISTINCT ur.user_id)::int AS n FROM core.user_roles ur JOIN core.memberships m ON m.user_id = ur.user_id AND m.status = 'active'
     JOIN core.users u ON u.id = ur.user_id AND u.status = 'active' WHERE ur.role_code IN ('gp','admin')`)
  return Math.max(1, Math.min(2, r.n))
}

// The LP portal link (no login). A new link replaces the previous one.
export async function issueLpLink(lpId: string): Promise<string> {
  const token = randomToken()
  await db().query("UPDATE funds.lps SET portal_token_hash = $2, portal_token_expires = now() + interval '180 days' WHERE id = $1", [lpId, createHash('sha256').update(token).digest('hex')])
  return (await appUrl()) + '/lp/' + token
}
