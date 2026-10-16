import { SEC_STAGES, secCriteria, expireSecondaries } from '~/server/utils/secondaries'
// Secondaries deal flow: by status, source and search, paged; with counts and totals.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const q = getQuery(event)
  await expireSecondaries()
  const STATUSES = ['new', 'reviewing', 'interested', 'invested', 'passed', 'expired']
  const status = STATUSES.includes(String(q.status)) ? String(q.status) : String(q.status) === 'all' ? 'all' : 'open'
  const source = ['meridian', 'wefunder', 'other'].includes(String(q.source)) ? String(q.source) : ''
  const search = String(q.q ?? '').trim().slice(0, 100)
  const size = [25, 50, 100].includes(Number(q.size)) ? Number(q.size) : 25, page = Math.max(1, Math.floor(Number(q.page) || 1))
  const where = `WHERE ($1 = 'all' OR ($1 = 'open' AND s.status IN ('new','reviewing','interested')) OR s.status = $1) AND ($2 = '' OR s.source = $2)
    AND ($3 = '' OR s.title ILIKE '%' || $3 || '%' OR s.company ILIKE '%' || $3 || '%' OR s.lead ILIKE '%' || $3 || '%' OR s.sector ILIKE '%' || $3 || '%' OR s.co_investors ILIKE '%' || $3 || '%')`
  const args = [status, source, search]
  const total = Number((await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM wm.secondaries s ${where}`, args)).rows[0]?.n ?? 0)
  const pages = Math.max(1, Math.ceil(total / size)), pg = Math.min(page, pages)
  const rows = (await db().query(`SELECT s.id, s.source, s.ref, s.title, s.company, s.sector, s.stage, s.lead, s.co_investors, s.min_investment::float, s.valuation, s.currency, s.url, s.notice_id, s.received_at, s.status, s.amount::float, s.notes, s.updated_at, s.fits, s.fit_note, s.client_visible, s.website, s.logo_doc_id, s.company_info, s.pipeline_deal_id, s.portfolio_company_id, to_char(s.closes_at, 'YYYY-MM-DD') AS closes_at, (SELECT count(*)::int FROM wm.secondary_interest i WHERE i.secondary_id = s.id AND i.status <> 'withdrawn') AS interest
    FROM wm.secondaries s ${where} ORDER BY s.received_at DESC LIMIT ${size} OFFSET ${(pg - 1) * size}`, args)).rows
  const counts = (await db().query('SELECT status, count(*)::int AS n FROM wm.secondaries GROUP BY status')).rows
  const k = (await db().query<{ month: number; invested: number; sources: number }>("SELECT count(*) FILTER (WHERE received_at >= date_trunc('month', now()))::int AS month, coalesce(sum(amount) FILTER (WHERE status = 'invested'), 0)::float AS invested, count(DISTINCT source)::int AS sources FROM wm.secondaries")).rows[0]
  return { criteria: await secCriteria(), stages: SEC_STAGES, rows, total, page: pg, pages, size, counts, kpi: k }
})
