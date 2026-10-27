// Staff: clients going through onboarding (and recently finished), with where they are, what they told us and the
// conversation, for approving website requests.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const rows = (await db().query<{ id: string; client_id: string; name: string; email: string | null; country: string; source: string; status: string; step: string; answers: Record<string, any>; messages: unknown[]; request: Record<string, any>; account_status: string | null; account_note: string | null; created_at: string; updated_at: string; submitted_at: string | null; decided_at: string | null; decision_note: string | null; docs: number; invited_by: string | null }>(
    `SELECT o.id, o.client_id, c.name, c.email, c.country, o.source, o.status, o.step, o.answers, o.messages, o.request, o.account_status, o.account_note, o.created_at, o.updated_at, o.submitted_at, o.decided_at, o.decision_note,
       (SELECT count(*)::int FROM wm.profile_docs d WHERE d.client_id = o.client_id) AS docs, (SELECT p.full_name FROM core.users u JOIN core.people p ON p.id = u.person_id WHERE u.id = o.invited_by) AS invited_by
     FROM wm.onboarding o JOIN wm.clients c ON c.id = o.client_id WHERE o.status IN ('in_progress', 'submitted') OR o.updated_at > now() - interval '60 days' ORDER BY (o.status = 'submitted') DESC, o.updated_at DESC LIMIT 200`)).rows
  const items = rows.map((r) => {
    const v = onboardSummaryFor(r.answers, r.country as 'US' | 'NG')
    return { ...r, answers: undefined, phases: PHASES(r.country as 'US' | 'NG', true).length, summary: v, minutes: r.submitted_at ? Math.max(1, Math.round((Date.parse(r.submitted_at) - Date.parse(r.created_at)) / 60000)) : null }
  })
  const done = rows.filter((r) => r.status === 'done' && r.decided_at && Date.parse(r.decided_at) > Date.now() - 30 * 86400e3).length
  return { items, counts: { waiting: rows.filter((r) => r.status === 'submitted').length, talking: rows.filter((r) => r.status === 'in_progress').length, opened: done } }
})
