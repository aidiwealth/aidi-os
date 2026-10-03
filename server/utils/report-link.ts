// Founder report links: a random token in the URL, only its hash in the database, valid for 30 days.
import type { H3Event } from 'h3'

export const LINK_DAYS = 30
export interface ReportRequest {
  id: string; company_id: string; company: string; founder_name: string; period: string; status: string
  draft: Record<string, unknown>; expires_at: string; submitted_at: string | null
}

export async function requestFromToken(event: H3Event): Promise<ReportRequest> {
  const token = getRouterParam(event, 'token') ?? ''
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw apiError('invalid_link', 'This link is not valid.', 404)
  rateLimit('report_link', clientIp(event), 120, 60 * 60 * 1000)
  const r = await asPlatform(() => db().query<ReportRequest & { organization_id: string }>(
    `SELECT r.id, r.company_id, c.name AS company, c.founder_name, to_char(r.period, 'YYYY-MM-DD') AS period, r.status, r.draft,
            r.expires_at, r.submitted_at, r.organization_id
       FROM portfolio.requests r JOIN portfolio.companies c ON c.id = r.company_id
      WHERE r.token_hash = $1`, [sha256(token)]))
  const row = r.rows[0]
  if (!row) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(row.organization_id)
  await requireModule(event, 'portfolio')
  if (new Date(row.expires_at).getTime() < Date.now()) throw apiError('expired', 'This link has expired. Ask the Aidi Ventures team for a new one.', 410)
  return row
}
