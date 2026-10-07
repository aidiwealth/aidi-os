// Wealth client: open (view) or download a statement; each is recorded so the team can see it was seen.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client', 'admin', 'gp', 'team')
  const sid = String(getRouterParam(event, 'sid') ?? ''), mode = getQuery(event).mode === 'download' ? 'downloaded' : 'viewed'
  const staff = user.roles.some((r) => ['admin', 'gp', 'team'].includes(r)), mine = staff ? null : await wmClientOfUser(user.userId)
  const s = /^[0-9a-f-]{36}$/.test(sid) ? (await db().query<{ storage_key: string; title: string; client_id: string }>('SELECT d.storage_key, d.title, s.client_id FROM wm.statements s JOIN core.documents d ON d.id = s.doc_id WHERE s.id = $1', [sid])).rows[0] : undefined
  if (!s || (!staff && s.client_id !== mine)) throw apiError('not_found', 'Not found', 404)
  if (!staff) await db().query('INSERT INTO wm.statement_events (statement_id, kind, user_id) VALUES ($1,$2,$3)', [sid, mode, user.userId])
  return sendRedirect(event, await signedGetUrl({ key: s.storage_key, filename: s.title, seconds: 300, inline: mode === 'viewed' }))
})
