// Private links to a forecast or a cap table. Each link has a label (who it is for), can ask for an email first,
// expires if you want, and records every visit (who, when, how long).
export type ShareKind = 'forecast' | 'captable'
export const shareUrl = (token: string) => brands().finvry.url + '/v/' + token
export async function shareObject(kind: ShareKind, id: string): Promise<{ id: string; name: string } | null> {
  const t = kind === 'forecast' ? 'financials.forecasts' : 'equity.captables'
  return (await db().query<{ id: string; name: string }>('SELECT id, name FROM ' + t + ' WHERE id = $1', [id])).rows[0] ?? null
}
export async function shareStats(kind: ShareKind): Promise<Record<string, { links: number; views: number; last: string | null }>> {
  const r = await db().query<{ object_id: string; links: number; views: number; last: string | null }>("SELECT object_id, count(*) FILTER (WHERE active)::int AS links, sum(views)::int AS views, max(last_viewed_at) AS last FROM financials.share_links WHERE kind = $1 GROUP BY object_id", [kind])
  return Object.fromEntries(r.rows.map((x) => [x.object_id, { links: x.links, views: x.views, last: x.last }]))
}
export async function findShare(token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null
  const l = (await asPlatform(() => db().query<{ id: string; organization_id: string; kind: ShareKind; object_id: string; label: string; require_email: boolean; notify: boolean; active: boolean; expired: boolean; last_viewed_at: string | null }>(
    'SELECT id, organization_id, kind, object_id, label, require_email, notify, active, (expires_at IS NOT NULL AND expires_at < now()) AS expired, last_viewed_at FROM financials.share_links WHERE token = $1', [token]))).rows[0]
  return l ?? null
}
