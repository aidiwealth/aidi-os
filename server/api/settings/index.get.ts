// Workspace settings for admins: details, screening thesis, notifications, default vehicle, plan and usage.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const org = await currentOrg()
  if (!org) throw apiError('not_found', 'Workspace not found', 404)
  const u = await one<{ members: number; storage: string; ai: number; plan_name: string; seat_limit: number | null; storage_gb: number | null; ai_runs_month: number | null }>(
    `SELECT (SELECT count(*)::int FROM core.memberships WHERE status = 'active') AS members,
            (SELECT coalesce(sum(size_bytes), 0)::text FROM core.documents) AS storage,
            (SELECT count(*)::int FROM core.ai_runs WHERE created_at >= date_trunc('month', now())) AS ai,
            p.name AS plan_name, p.seat_limit, p.storage_gb, p.ai_runs_month
       FROM core.plans p WHERE p.code = $1`, [org.plan_code])
  const s = org.settings
  return {
    org: { name: org.name, slug: org.slug, kind: org.kind, status: org.status, plan: org.plan_code },
    settings: { investor_name: s.investor_name ?? '', thesis: s.thesis ?? '', notify_emails: s.notify_emails ?? [], default_vehicle_id: s.default_vehicle_id ?? '' },
    plan: { name: u.plan_name, seat_limit: u.seat_limit, storage_gb: u.storage_gb, ai_runs_month: u.ai_runs_month },
    usage: { members: u.members, storage_bytes: Number(u.storage), ai_runs: u.ai },
    pitchUrl: (await appUrl()) + '/api/public/pitch?org=' + org.slug
  }
})
