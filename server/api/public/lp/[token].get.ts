// The LP portal: the investor's own position in each fund, their calls and distributions. No login; read-only.
import { createHash } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 20) throw apiError('invalid_link', 'This link is not valid.', 404)
  const hash = createHash('sha256').update(token).digest('hex')
  const previewLp = token.startsWith('pv.') ? readLpPreview(token) : null
  if (token.startsWith('pv.') && !previewLp) throw apiError('expired', 'This preview link has expired. Open the portal again from the LP page.', 410)
  const r = await asPlatform(() => db().query<{ id: string; name: string; organization_id: string; expired: boolean }>(
    previewLp ? 'SELECT id, name, organization_id, false AS expired FROM funds.lps WHERE id = $1' : 'SELECT id, name, organization_id, (portal_token_expires < now()) AS expired FROM funds.lps WHERE portal_token_hash = $1', [previewLp ?? hash]))
  const lp = r.rows[0]
  if (!lp) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (lp.expired) throw apiError('expired', 'This link has expired. Ask the fund team for a new one.', 410)
  setOrgContext(lp.organization_id)
  if (!(await enabledModules()).has('funds')) throw apiError('invalid_link', 'This link is not valid.', 404)
  const funds = await db().query<{ fund_id: string }>("SELECT c.fund_id FROM funds.commitments c JOIN funds.funds f ON f.id = c.fund_id WHERE c.lp_id = $1 AND f.structure <> 'rolling'", [lp.id])
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
  const fin = (await enabledModules()).has('financials') ? await db().query<{ fund: string; period_end: string; period_type: string; currency: string; lines: Record<string, number> }>(
    `SELECT e.name AS fund, to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.period_type, s.currency, s.lines FROM financials.statements s
       JOIN funds.funds f ON f.entity_id = s.entity_id JOIN core.entities e ON e.id = f.entity_id JOIN funds.commitments c ON c.fund_id = f.id AND c.lp_id = $1
      WHERE s.show_to_lps ORDER BY e.name, s.period_end DESC LIMIT 24`, [lp.id]) : { rows: [] }
  const financials = fin.rows.map((x) => ({ fund: x.fund, period_end: x.period_end, period_type: x.period_type, currency: x.currency, ...derive(x.lines, x.period_type) }))
  const deals = (await enabledModules()).has('pitches') ? (await db().query(`SELECT p.id, p.company, p.one_liner, p.sector, p.stage, p.country, p.raising_usd::float, to_char(p.received_at, 'YYYY-MM-DD') AS received_at, p.website,
      s.score, s.recommendation, (SELECT count(*) > 0 FROM deals.lp_interest i WHERE i.pitch_id = p.id AND i.lp_id = $1) AS interested, p.funding_type,
      (SELECT json_build_object('amount', a.amount, 'currency', a.currency, 'tenor', a.tenor_months, 'status', a.status,
        'business', (SELECT json_build_object('score', c.score, 'band', c.band, 'source', CASE WHEN coalesce(c.source, c.provider) = 'manual' THEN 'manual review' ELSE 'credit bureau' END) FROM credit.checks c WHERE c.borrower_id = a.borrower_id AND c.guarantor_id IS NULL AND c.score IS NOT NULL ORDER BY c.created_at DESC LIMIT 1),
        'founders', (SELECT json_agg(json_build_object('name', x.name, 'score', x.score, 'band', x.band)) FROM (SELECT DISTINCT ON (g.id) g.name, c.score, c.band FROM credit.guarantors g JOIN credit.checks c ON c.guarantor_id = g.id AND c.score IS NOT NULL WHERE g.borrower_id = a.borrower_id ORDER BY g.id, c.created_at DESC) x))
      FROM credit.applications a WHERE a.pitch_id = p.id) AS credit
      FROM deals.pitches p LEFT JOIN LATERAL (SELECT score, recommendation FROM deals.screenings x WHERE x.pitch_id = p.id ORDER BY x.created_at DESC LIMIT 1) s ON true
      WHERE p.lp_share = 'show' OR (p.lp_share = 'auto' AND p.status IN ('screened', 'advancing') AND (s.score IS NOT NULL OR p.funding_type = 'loan')) ORDER BY p.received_at DESC LIMIT 30`, [lp.id])).rows : []
  const lpEmail = (await db().query<{ email: string | null }>('SELECT email FROM funds.lps WHERE id = $1', [lp.id])).rows[0]?.email ?? null
  const participations = []
  for (const f of (await db().query<{ entity_id: string; name: string; currency: string }>("SELECT f.entity_id, e.name, f.currency FROM funds.funds f JOIN core.entities e ON e.id = f.entity_id JOIN funds.commitments c ON c.fund_id = f.id AND c.lp_id = $1 WHERE f.structure = 'rolling'", [lp.id])).rows) {
    const ps = await lpParticipations(f.entity_id, lpEmail); if (ps.length) participations.push({ fund: f.name, currency: f.currency, deals: ps })
  }
  const taxDocs = (await db().query('SELECT id, tax_year, form_type, issuer, created_at FROM core.tax_docs WHERE lp_id = $1 ORDER BY tax_year DESC, created_at DESC', [lp.id])).rows
  return { taxDocs, participations, lp: { name: lp.name }, preview: !!previewLp, positions, history: history.rows, financials, deals, workspace: await publicWorkspace() }
})
