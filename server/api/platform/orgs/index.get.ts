// Customers with commercial facts only: plan, status, seats, last activity.
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  const r = await asPlatform(() => db().query(
    `SELECT o.id, o.name, o.slug, o.kind, o.status, o.plan_code, p.name AS plan, to_char(o.trial_ends_at, 'YYYY-MM-DD') AS trial_ends, o.created_at,
            (SELECT count(*)::int FROM core.memberships m WHERE m.organization_id = o.id AND m.status = 'active') AS seats, p.seat_limit,
            (SELECT max(a.at) FROM core.audit_log a WHERE a.organization_id = o.id AND a.actor_user_id IS NOT NULL AND a.action NOT LIKE 'platform.%') AS last_activity,
            coalesce(o.settings->>'brand', 'finvry') AS brand
       FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code ORDER BY (o.plan_code = 'internal'), o.created_at DESC`))
  return r.rows
})
