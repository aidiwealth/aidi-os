import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const r = await db().query(
    `SELECT r.*, r.amount::text, to_char(r.meeting_date, 'YYYY-MM-DD') AS meeting_date, e.name AS entity, b.name AS beneficiary, p.full_name AS created_by_name
       FROM governance.resolutions r JOIN core.entities e ON e.id = r.entity_id LEFT JOIN governance.parties b ON b.id = r.beneficiary_id
       LEFT JOIN core.users u ON u.id = r.created_by LEFT JOIN core.people p ON p.id = u.person_id WHERE r.id = $1`, [id.data])
  const res = r.rows[0]
  if (!res) throw apiError('not_found', 'Not found', 404)
  const approvals = await db().query(
    `SELECT a.decision, a.note, a.decided_at, gp.name, gp.role FROM governance.approvals a JOIN governance.parties gp ON gp.id = a.party_id WHERE a.resolution_id = $1 ORDER BY a.decided_at`, [id.data])
  const signers = await signatories(res.entity_id)
  const me = signers.find((s) => s.email === user.email)
  const voted = approvals.rows.length ? (await db().query('SELECT 1 FROM governance.approvals WHERE resolution_id = $1 AND user_id = $2', [id.data, user.userId])).rowCount : 0
  const levels = visibleLevels(user.roles)
  let document: { id: string; title: string } | null = null
  if (res.document_id) {
    const d = await db().query<{ id: string; title: string; sensitivity: string }>('SELECT id, title, sensitivity FROM core.documents WHERE id = $1', [res.document_id])
    if (d.rows[0] && levels.includes(d.rows[0].sensitivity as Sensitivity)) document = { id: d.rows[0].id, title: d.rows[0].title }
  }
  return { resolution: res, approvals: approvals.rows, signers, canSign: !!me && !!me.user_id && !voted && res.status === 'circulating',
    canManage: res.created_by === user.userId || user.roles.includes('admin'), document }
})
