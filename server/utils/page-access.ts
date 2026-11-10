// The investor page's email gate: a visitor gives their email once and a cookie lets them back in (that page and its
// updates). People in the company's own workspace are never asked.
import type { H3Event } from 'h3'
export const pageAccessCookie = (orgId: string) => 'fvpa_' + orgId.replace(/-/g, '').slice(0, 12)
export async function pageAccessOk(event: H3Event, orgId: string): Promise<boolean> {
  const s = await readSession(event).catch(() => null)
  if (s?.orgId === orgId) return true
  const id = getCookie(event, pageAccessCookie(orgId))
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return false
  const r = await asPlatform(() => db().query("UPDATE financials.page_access SET views = views + CASE WHEN last_viewed_at < now() - interval '30 minutes' THEN 1 ELSE 0 END, last_viewed_at = now() WHERE id = $1 AND organization_id = $2", [id, orgId]))
  return !!r.rowCount
}
