// Access requests for the Finvry console: the queue, this week's approvals against the cap, the sign-up mode and how
// far approved companies have got (signed up, added figures, paying).
export default defineEventHandler(async (event) => {
  await requirePlatformView(event)
  const q = getQuery(event)
  const status = ['pending', 'approved', 'rejected', 'demo', 'all'].includes(String(q.status)) ? String(q.status) : 'pending'
  const settings = await accessSettings()
  const items = (await asPlatform(() => db().query(`SELECT r.id, r.name, r.email, r.company, r.website, r.country, r.stage, r.team_size, r.needs, r.needs_note, r.source, r.community, r.want_demo, r.flags, r.status, r.notes,
      to_char(r.created_at, 'YYYY-MM-DD') AS created, to_char(r.invited_at, 'YYYY-MM-DD') AS invited, r.invite_expires < now() AS expired, r.signed_up_org,
      o.name AS org_name, o.status AS org_status, o.plan_code,
      EXISTS (SELECT 1 FROM financials.statements s WHERE s.organization_id = o.id) AS has_figures,
      coalesce(o.status = 'active' AND EXISTS (SELECT 1 FROM wallet.subscriptions ws WHERE ws.organization_id = o.id AND ws.kind = 'plan' AND ws.status = 'active' AND ws.amount_minor > 0), false) AS paying
    FROM platform.access_requests r LEFT JOIN core.organizations o ON o.id = r.signed_up_org
    WHERE ($1 = 'all' OR r.status = $1) ORDER BY r.created_at DESC LIMIT 500`, [status]))).rows
  const f = (await asPlatform(() => db().query<{ requests: number; pending: number; approved: number; signed_up: number; with_figures: number; paying: number }>(`SELECT count(*)::int AS requests,
      count(*) FILTER (WHERE r.status IN ('pending', 'demo'))::int AS pending, count(*) FILTER (WHERE r.invited_at IS NOT NULL)::int AS approved, count(r.signed_up_org)::int AS signed_up,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM financials.statements s WHERE s.organization_id = r.signed_up_org))::int AS with_figures,
      count(*) FILTER (WHERE o.status = 'active' AND EXISTS (SELECT 1 FROM wallet.subscriptions ws WHERE ws.organization_id = o.id AND ws.kind = 'plan' AND ws.status = 'active' AND ws.amount_minor > 0))::int AS paying
    FROM platform.access_requests r LEFT JOIN core.organizations o ON o.id = r.signed_up_org`).catch((e) => { console.error("[access] funnel", e); return { rows: [{ requests: 0, pending: 0, approved: 0, signed_up: 0, with_figures: 0, paying: 0 }] } }))).rows[0]
  return { settings, week: await approvedThisWeek(), items, funnel: f }
})
