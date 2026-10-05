// circulate (draft → circulating, emails signatories), withdraw, or a signatory's approve / reject.
import { z } from 'zod'
const Body = z.object({ action: z.enum(['circulate', 'withdraw', 'approve', 'reject']), note: z.string().trim().max(2000).optional() })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'family', 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = Body.safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const r = await db().query<{ entity_id: string; status: string; required_approvals: number; created_by: string | null; title: string; kind: string; entity: string }>(
    'SELECT r.entity_id, r.status, r.required_approvals, r.created_by, r.title, r.kind, e.name AS entity FROM governance.resolutions r JOIN core.entities e ON e.id = r.entity_id WHERE r.id = $1', [id.data])
  const res = r.rows[0]
  if (!res) throw apiError('not_found', 'Not found', 404)
  const manager = res.created_by === user.userId || user.roles.includes('admin')
  const signers = await signatories(res.entity_id)
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
  const act = b.data.action

  if (act === 'circulate' || act === 'withdraw') {
    if (!manager) throw apiError('forbidden', 'Only the person who drafted this (or an admin) can do that.', 403)
    if (act === 'circulate' && res.status !== 'draft') throw apiError('state', 'Only drafts can be circulated.')
    if (act === 'withdraw' && !['draft', 'circulating'].includes(res.status)) throw apiError('state', 'This has already been decided.')
    if (act === 'circulate' && res.required_approvals > signers.filter((s) => s.user_id).length)
      throw apiError('accounts', 'Only ' + signers.filter((s) => s.user_id).length + ' signatories have Aidi accounts. Invite the others on Team first.')
    await db().query("UPDATE governance.resolutions SET status = $2, circulated_at = CASE WHEN $2 = 'circulating' THEN now() ELSE circulated_at END WHERE id = $1",
      [id.data, act === 'circulate' ? 'circulating' : 'withdrawn'])
    await db().query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, ip) VALUES ($1,$2,$3,$4,$5,$6)', [user.userId, 'governance.' + act, 'resolution', id.data, res.entity_id, ip])
    if (act === 'circulate') for (const s of signers.filter((x) => x.user_id))
      sendResolutionCirculated(s.email, s.name, id.data, res.title, res.entity, res.required_approvals).catch((e) => console.error('[governance] email failed', e))
    return { ok: true }
  }

  // approve / reject: only a current signatory with an account, once, while circulating
  if (res.status !== 'circulating') throw apiError('state', 'This is not open for approval.')
  const me = signers.find((s) => s.email === user.email && s.user_id)
  if (!me) throw apiError('forbidden', 'Only the signatories of ' + res.entity + ' can approve this.', 403)
  if (act === 'reject' && (b.data.note ?? '').length < 3) throw apiError('note', 'Add a short reason for rejecting.')
  const client = await db().connect()
  let status: string = 'circulating'
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM governance.resolutions WHERE id = $1 FOR UPDATE', [id.data])
    const ins = await client.query('INSERT INTO governance.approvals (resolution_id, user_id, party_id, decision, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [id.data, user.userId, me.party_id, act, b.data.note || null])
    if (!ins.rowCount) throw apiError('voted', 'You have already responded to this.')
    const t = await client.query<{ a: number; r: number }>("SELECT count(*) FILTER (WHERE decision = 'approve')::int AS a, count(*) FILTER (WHERE decision = 'reject')::int AS r FROM governance.approvals WHERE resolution_id = $1", [id.data])
    const o = outcome(signers.filter((s) => s.user_id).length, res.required_approvals, t.rows[0]!.a, t.rows[0]!.r)
    if (o) { await client.query('UPDATE governance.resolutions SET status = $2, decided_at = now() WHERE id = $1', [id.data, o]); status = o }
    await client.query('INSERT INTO core.audit_log (actor_user_id, action, object_type, object_id, entity_id, detail, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.userId, 'governance.' + act, 'resolution', id.data, res.entity_id, JSON.stringify({ outcome: o }), ip])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
  return { ok: true, status }
})
