// Counts for the sidebar: what's new since you last opened each page (team: inbox and requests; founders: services and NDAs).
export default defineEventHandler(async (event): Promise<Record<string, number>> => {
  const user = await requireUser(event)
  const org = await currentOrg()
  if (!org) return {}
  const seen = async (area: string) => (await asPlatform(() => db().query<{ s: string }>("SELECT coalesce((SELECT seen_at FROM core.seen WHERE user_id = $1 AND organization_id = $2 AND area = $3), now() - interval '14 days')::text AS s", [user.userId, org.id, area]))).rows[0]!.s
  const out: Record<string, number> = {}
  try {
    if (org.kind === 'company') {
      const c = await clientForWorkspace(org.id).catch(() => null)
      if (c) await asPlatform(async () => {
        const since = await seen('client')
        const r = (await db().query<{ msgs: number; ev: number }>(`SELECT (SELECT count(*)::int FROM services.messages WHERE client_id = $1 AND from_team AND read_by_client IS NULL) AS msgs,
            (SELECT count(*)::int FROM services.job_events e JOIN services.jobs j ON j.id = e.job_id WHERE j.client_id = $1 AND e.visible_to_client AND e.kind <> 'client_document' AND e.kind <> 'client_message' AND e.created_at > $2) AS ev`, [c.id, since])).rows[0]!
        if (r.msgs + r.ev) out['/client'] = r.msgs + r.ev
      })
      const s2 = await seen('fundraising')
      const n = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM fundraise.nda_signatures WHERE signed_at > $1', [s2]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]!.n
      if (n) out['/fundraising'] = n
    } else if (org.settings.services_operator === true || org.settings.services_operator === 'true') {
      const r = (await db().query<{ inbox: number }>("SELECT count(DISTINCT m.thread_id)::int AS inbox FROM services.messages m JOIN services.threads t ON t.id = m.thread_id WHERE NOT m.from_team AND m.read_by_team IS NULL AND t.status = 'open'")).rows[0]!
      if (r.inbox) out['/services/inbox'] = r.inbox
      const since = await seen('jobs')
      const j = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM services.jobs WHERE created_at > $1', [since])).rows[0]!.n
      if (j) out['/services'] = j
    }
  } catch (err) { console.error('[notifications]', err) }
  return out
})
