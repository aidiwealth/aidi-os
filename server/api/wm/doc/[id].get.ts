// Open a wealth document (invoice, receipt, profile upload) — staff, or the client it belongs to.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'wealth_client')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const staff = user.roles.some((r) => ['admin', 'gp', 'team'].includes(r)), mine = staff ? null : await wmClientOfUser(user.userId)
  const d = (await db().query<{ storage_key: string; title: string }>(`SELECT d.storage_key, d.title FROM core.documents d WHERE d.id = $1 AND (
      EXISTS (SELECT 1 FROM wm.fees f WHERE (f.invoice_doc_id = d.id OR f.receipt_doc_id = d.id) AND ($2::uuid IS NULL OR f.client_id = $2))
      OR EXISTS (SELECT 1 FROM wm.profile_docs p WHERE p.document_id = d.id AND ($2::uuid IS NULL OR p.client_id = $2)))`, [id, mine])).rows[0]
  if (!d || (!staff && !mine)) throw apiError('not_found', 'Not found', 404)
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title.replace(/^Financial profile — /, ''), seconds: 300, inline: true }))
})
