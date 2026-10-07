// Staff: a client's statements. GET lists them with views/downloads; POST previews figures for a period, publishes
// (PDF + email to the client), or deletes one.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('SELECT 1 FROM wm.clients WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'GET') return (await db().query(`SELECT s.id, s.period_kind, to_char(s.period_start, 'YYYY-MM-DD') AS period_start, to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.published_at, s.doc_id, (s.data->'summary'->>'ending')::float AS ending,
      (SELECT count(*)::int FROM wm.statement_events e WHERE e.statement_id = s.id AND e.kind = 'viewed') AS views, (SELECT count(*)::int FROM wm.statement_events e WHERE e.statement_id = s.id AND e.kind = 'downloaded') AS downloads,
      (SELECT max(created_at) FROM wm.statement_events e WHERE e.statement_id = s.id) AS last_seen FROM wm.statements s WHERE s.client_id = $1 ORDER BY s.period_end DESC, s.published_at DESC`, [id])).rows
  const b = await readBody<Record<string, any>>(event)
  if (b.action === 'preview') {
    const k = z.enum(['monthly', 'quarterly', 'annual', 'custom']).parse(b.period_kind)
    const p = k === 'custom' ? { start: String(b.period_start), end: String(b.period_end) } : periodFor(k, b.ref ? new Date(String(b.ref)) : new Date())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end) || p.start > p.end) throw apiError('invalid', 'Choose a valid period.')
    return { data: await buildStatement(id, k, p.start, p.end) }
  }
  if (b.action === 'publish') {
    const d = b.data as StatementData
    if (!d?.period?.start || !d?.summary) throw apiError('invalid', 'Preview the statement first.')
    const bytes = await statementPdf(d)
    const doc = await storePdf(bytes, 'Aidi Wealth statement ' + d.period.label + ' - ' + d.client.name + '.pdf', null)
    const st = await one<{ id: string }>('INSERT INTO wm.statements (client_id, period_kind, period_start, period_end, data, doc_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [id, d.period.kind, d.period.start, d.period.end, JSON.stringify(d), doc, user.userId])
    const c = (await db().query<{ email: string | null }>('SELECT email FROM wm.clients WHERE id = $1', [id])).rows[0]
    if (c?.email && b.notify !== false) { try { await sendEmail({ to: c.email, subject: 'Your Aidi Wealth statement: ' + d.period.label, text: 'Your account statement for ' + d.period.label + ' is ready in your Aidi Wealth portal.\n\n' + brands().aidi.url + '/w', html: '<p>Your account statement for <b>' + d.period.label + '</b> is ready in your Aidi Wealth portal.</p><p><a href="' + brands().aidi.url + '/w" style="color:#1c4f9c">View your statement</a></p>' }) } catch { /* ignore */ } }
    await audit({ event, actorUserId: user.userId, action: 'wm.statement_publish', objectType: 'wm_statement', objectId: st.id })
    return { ok: true, id: st.id }
  }
  if (b.action === 'delete' && typeof b.statement_id === 'string') { await db().query('DELETE FROM wm.statements WHERE id = $1 AND client_id = $2', [b.statement_id, id]); return { ok: true } }
  throw apiError('invalid', 'Unknown action.')
})
