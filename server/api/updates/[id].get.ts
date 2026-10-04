// An update for the editor: content, recipients and what can be picked (lists, pipeline stages, contacts), and sends.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const u = (await db().query<{ period_type: string; period_end: string }>("SELECT id, title, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, highlights, challenges, asks, body, blocks, cover_id, from_name, recipients, status, published_at, sent_at, sent_count, sent_to, is_template, pinned FROM financials.updates WHERE id = $1", [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  const org = (await currentOrg())!
  const me = (await asPlatform(() => db().query<{ n: string | null }>('SELECT p.full_name AS n FROM core.users x LEFT JOIN core.people p ON p.id = x.person_id WHERE x.id = $1', [user.userId]))).rows[0]?.n
  const first = (me ?? user.email).split(/[ @]/)[0]
  const lists = await db().query('SELECT l.id, l.name, (SELECT count(*)::int FROM crm.list_members m JOIN crm.contacts c ON c.id = m.contact_id WHERE m.list_id = l.id AND c.subscribed) AS n FROM crm.lists l ORDER BY l.name')
  const stages = await db().query("SELECT s.id, p.name || ' · ' || s.name AS name, (SELECT count(*)::int FROM crm.deals d WHERE d.stage_id = s.id AND d.contact_id IS NOT NULL) AS n FROM crm.stages s JOIN crm.pipelines p ON p.id = s.pipeline_id WHERE p.status = 'open' ORDER BY p.name, s.sort")
  const contacts = await db().query('SELECT id, name, email FROM crm.contacts WHERE subscribed ORDER BY name LIMIT 3000')
  const sends = await db().query('SELECT i.id AS investor_id, i.name, i.email, s.sent_at, s.opened_at, s.opens FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id WHERE s.update_id = $1 ORDER BY s.opened_at DESC NULLS LAST, i.name', [id.data])
  const page = (await db().query<{ slug: string; published: boolean }>('SELECT slug, published FROM financials.public_pages LIMIT 1')).rows[0] ?? null
  return { update: u, label: updateLabel(u.period_type, u.period_end), metrics: Object.entries(METRIC_LABEL).map(([key, label]) => ({ key, label })), lists: lists.rows, stages: stages.rows, contacts: contacts.rows, sends: sends.rows, page,
    from: [first + ' from ' + org.name, org.name, (me ?? first) + ', ' + org.name], me: user.email, company: org.name }
})
