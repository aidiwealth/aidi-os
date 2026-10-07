// Open a client document (original or signed copy): staff, or the client it belongs to (first view recorded).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'wealth_client')
  const did = String(getRouterParam(event, 'did') ?? ''), signed = getQuery(event).signed === '1'
  const staff = user.roles.some((r) => ['admin', 'gp', 'team'].includes(r)), mine = staff ? null : await wmClientOfUser(user.userId)
  const d = /^[0-9a-f-]{36}$/.test(did) ? (await db().query<{ client_id: string; storage_key: string; title: string }>(`SELECT cd.client_id, doc.storage_key, doc.title FROM wm.client_docs cd JOIN core.documents doc ON doc.id = ${signed ? 'cd.signed_doc_id' : 'cd.doc_id'} WHERE cd.id = $1`, [did])).rows[0] : undefined
  if (!d || (!staff && d.client_id !== mine)) throw apiError('not_found', 'Not found', 404)
  if (!staff) await db().query('UPDATE wm.client_docs SET viewed_at = coalesce(viewed_at, now()) WHERE id = $1', [did])
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title, seconds: 300, inline: getQuery(event).download !== '1' }))
})
