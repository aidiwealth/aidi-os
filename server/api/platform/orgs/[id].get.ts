// One customer: plan, status, usage against limits, admins (for account management) and platform actions taken.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatformView(event)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  return await asPlatform(async () => {
    const o = await db().query(
      `SELECT o.id, o.name, o.slug, o.kind, o.status, o.plan_code, to_char(o.trial_ends_at, 'YYYY-MM-DD') AS trial_ends, o.created_at, coalesce(o.settings->>'brand', 'finvry') AS brand, coalesce((o.settings->>'raise_enabled')::boolean, false) AS raise_enabled, coalesce((o.settings->>'raise_fee_pct')::numeric, 4)::float AS raise_fee_pct, coalesce(o.settings->'extra_modules', '[]'::jsonb) AS extra_modules, p.modules AS plan_modules,
              p.name AS plan, p.seat_limit, p.storage_gb, p.ai_runs_month, p.price_monthly_usd::text AS price
         FROM core.organizations o JOIN core.plans p ON p.code = o.plan_code WHERE o.id = $1`, [id.data])
    if (!o.rows[0]) throw apiError('not_found', 'Not found', 404)
    const usage = await one<{ seats: number; storage: string; ai: number; last_activity: string | null; modules_off: number }>(
      `SELECT (SELECT count(*)::int FROM core.memberships WHERE organization_id = $1 AND status = 'active') AS seats,
              (SELECT coalesce(sum(size_bytes), 0)::text FROM core.documents WHERE organization_id = $1) AS storage,
              (SELECT count(*)::int FROM core.ai_runs WHERE organization_id = $1 AND created_at >= date_trunc('month', now())) AS ai,
              (SELECT max(at) FROM core.audit_log WHERE organization_id = $1 AND actor_user_id IS NOT NULL AND action NOT LIKE 'platform.%' AND action NOT LIKE 'support.%') AS last_activity,
              (SELECT count(*)::int FROM core.modules WHERE organization_id = $1 AND NOT enabled) AS modules_off`, [id.data])
    const admins = await db().query(
      `SELECT p.full_name AS name, u.email, u.last_login_at FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.people p ON p.id = u.person_id
        JOIN core.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id AND r.role_code = 'admin'
       WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY p.full_name`, [id.data])
    const log = await db().query(
      `SELECT a.action, a.at, a.detail, pp.full_name AS by_name FROM core.audit_log a LEFT JOIN core.users u ON u.id = a.actor_user_id LEFT JOIN core.people pp ON pp.id = u.person_id
        WHERE a.organization_id = $1 AND a.action LIKE 'platform.%' ORDER BY a.at DESC LIMIT 20`, [id.data])
    const cards = await db().query("SELECT provider, brand, last4, exp_month, exp_year, is_default FROM platform.payment_methods WHERE organization_id = $1 ORDER BY is_default DESC, created_at DESC", [id.data])
    const stor = await storageOf(id.data)
    const paidPlans = (await db().query<{ code: string; name: string; modules: string[] }>("SELECT code, name, modules FROM core.plans WHERE code IN ('company_startup', 'company_scale') ORDER BY sort")).rows
    const own = new Set((o.rows[0] as { plan_modules: string[] }).plan_modules ?? [])
    const grantable = MODULES.filter((m) => m.switchable && !own.has(m.code) && paidPlans.some((p) => p.modules.includes(m.code))).map((m) => ({ code: m.code, label: m.label, plans: paidPlans.filter((p) => p.modules.includes(m.code)).map((p) => p.name) }))
    const agreements = (await db().query("SELECT s.id, s.title, s.version, s.status, s.signed_at, s.signer_name, s.signer_email FROM legal.signatures s LEFT JOIN services.clients c ON c.id = s.client_id WHERE (s.organization_id = $1 OR c.workspace_id = $1) AND s.status <> 'void' ORDER BY coalesce(s.signed_at, s.created_at) DESC", [id.data])).rows
    // Log in as: everyone active in the workspace, and every past support visit.
    const members = (await db().query(
      `SELECT u.id AS user_id, coalesce(p.full_name, u.email) AS name, u.email, coalesce((SELECT string_agg(DISTINCT r.role_code, ', ') FROM core.user_roles r WHERE r.user_id = u.id AND r.organization_id = m.organization_id), '') AS roles
         FROM core.memberships m JOIN core.users u ON u.id = m.user_id AND u.status = 'active' LEFT JOIN core.people p ON p.id = u.person_id
        WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY (EXISTS (SELECT 1 FROM core.user_roles r WHERE r.user_id = u.id AND r.organization_id = m.organization_id AND r.role_code = 'admin')) DESC, m.created_at`, [id.data])).rows
    const support = (await db().query(
      `SELECT i.id, i.reason, i.can_edit, i.started_at, i.expires_at, i.ended_at, coalesce(sp.full_name, su.email) AS by_name, tu.email AS as_email,
              (SELECT count(*)::int FROM core.audit_log a WHERE a.organization_id = i.organization_id AND a.action = 'support.change' AND a.detail->>'support_access' = i.id::text) AS changes
         FROM core.impersonations i JOIN core.users su ON su.id = i.staff_user_id LEFT JOIN core.people sp ON sp.id = su.person_id JOIN core.users tu ON tu.id = i.target_user_id
        WHERE i.organization_id = $1 ORDER BY i.started_at DESC LIMIT 20`, [id.data])).rows
    return { members, support, can_support: staff.staffRole !== 'viewer', can_edit: staff.staffRole !== 'viewer' && staff.staffRole !== 'support', agreements, grantable, storage: stor, org: o.rows[0], usage: { ...usage, storage: Number(usage.storage) }, admins: admins.rows, log: log.rows, cards: cards.rows }
  })
})
