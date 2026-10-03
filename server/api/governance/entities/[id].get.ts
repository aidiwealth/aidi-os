// One entity's parties and resolutions (with approval counts), and approved distributions.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'family', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const e = await db().query('SELECT id, name, legal_name, kind, jurisdiction, status FROM core.entities WHERE id = $1', [id.data])
  if (e.rowCount !== 1) throw apiError('not_found', 'Not found', 404)
  const parties = await db().query(
    `SELECT p.id, p.name, p.email, p.role, p.share_pct::text, p.notes, to_char(p.start_date, 'YYYY-MM-DD') AS start_date, to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
            (p.end_date IS NULL OR p.end_date >= current_date) AS active, EXISTS (SELECT 1 FROM core.users u WHERE u.email = p.email AND u.status = 'active') AS has_account
       FROM governance.parties p WHERE p.entity_id = $1 ORDER BY active DESC, p.role, p.name`, [id.data])
  const res = await db().query(
    `SELECT r.id, r.kind, r.title, r.status, r.required_approvals, to_char(r.meeting_date, 'YYYY-MM-DD') AS meeting_date, r.amount::text, r.currency,
            b.name AS beneficiary, r.created_at, r.decided_at,
            (SELECT count(*)::int FROM governance.approvals a WHERE a.resolution_id = r.id AND a.decision = 'approve') AS approvals,
            (SELECT count(*)::int FROM governance.approvals a WHERE a.resolution_id = r.id AND a.decision = 'reject') AS rejections
       FROM governance.resolutions r LEFT JOIN governance.parties b ON b.id = r.beneficiary_id WHERE r.entity_id = $1 ORDER BY r.created_at DESC`, [id.data])
  const signers = await signatories(id.data)
  return { entity: e.rows[0], parties: parties.rows, resolutions: res.rows, signers }
})
