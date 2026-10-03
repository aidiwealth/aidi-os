// The LP portal: the investor's own position in each fund, their calls and distributions. No login; read-only.
import { createHash } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 20) throw apiError('invalid_link', 'This link is not valid.', 404)
  const hash = createHash('sha256').update(token).digest('hex')
  const r = await asPlatform(() => db().query<{ id: string; name: string; organization_id: string; expired: boolean }>(
    'SELECT id, name, organization_id, (portal_token_expires < now()) AS expired FROM funds.lps WHERE portal_token_hash = $1', [hash]))
  const lp = r.rows[0]
  if (!lp) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (lp.expired) throw apiError('expired', 'This link has expired. Ask the fund team for a new one.', 410)
  setOrgContext(lp.organization_id)
  if (!(await enabledModules()).has('funds')) throw apiError('invalid_link', 'This link is not valid.', 404)
  const funds = await db().query<{ fund_id: string }>('SELECT fund_id FROM funds.commitments WHERE lp_id = $1', [lp.id])
  const positions = []
  for (const f of funds.rows) {
    const p = await fundPosition(f.fund_id)
    const mine = p?.lps.find((x) => x.lp_id === lp.id)
    if (p && mine) positions.push({ fund: p.fund.name, currency: p.fund.currency, vintage: p.fund.vintage, navDate: p.navDate, admin: adminName(p.fund), adminUrl: p.fund.admin_portal_url, commitment: mine.commitment, called: mine.called, paidIn: mine.paidIn, unfunded: mine.unfunded, distributed: mine.distributed, navShare: mine.navShare, m: mine.m, fundM: p.m })
  }
  const history = await db().query(
    `SELECT e.name AS fund, f.currency, c.kind, c.number, c.purpose, to_char(c.due_date, 'YYYY-MM-DD') AS due_date, l.amount::text, l.paid_amount::text, to_char(l.paid_on, 'YYYY-MM-DD') AS paid_on
       FROM funds.call_lines l JOIN funds.calls c ON c.id = l.call_id JOIN funds.funds f ON f.id = c.fund_id JOIN core.entities e ON e.id = f.entity_id
      WHERE l.lp_id = $1 AND c.status IN ('sent','completed') ORDER BY c.due_date DESC`, [lp.id])
  return { lp: { name: lp.name }, positions, history: history.rows, workspace: await publicWorkspace() }
})
