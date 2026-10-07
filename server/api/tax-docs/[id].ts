// Staff: open or delete a tax document.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const d = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM core.tax_docs t JOIN core.documents d ON d.id = t.document_id WHERE t.id = $1', [id])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'DELETE') { if (!user.roles.some((r) => ['admin', 'gp'].includes(r))) throw apiError('forbidden', 'Not allowed.', 403); await db().query('DELETE FROM core.tax_docs WHERE id = $1', [id]); return { ok: true } }
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title, seconds: 300, inline: true }))
})
