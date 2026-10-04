import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const u = (await db().query<{ period_type: string; period_end: string }>("SELECT id, title, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, highlights, challenges, asks, body, status, published_at FROM financials.updates WHERE id = $1", [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  const sends = await db().query('SELECT i.id AS investor_id, i.name, i.email, i.firm, s.sent_at, s.opened_at, s.opens FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id WHERE s.update_id = $1 ORDER BY i.name', [id.data])
  const investors = await db().query('SELECT id, name, email, firm FROM financials.investors ORDER BY name')
  const page = (await db().query<{ slug: string; published: boolean }>('SELECT slug, published FROM financials.public_pages LIMIT 1')).rows[0] ?? null
  return { update: u, figures: await periodFigures(u.period_type, u.period_end), sends: sends.rows, investors: investors.rows, page, label: updateLabel(u.period_type, u.period_end) }
})
