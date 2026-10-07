// Wealth client: open a tax document (recorded).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId), tid = String(getRouterParam(event, 'tid') ?? '')
  const d = id && /^[0-9a-f-]{36}$/.test(tid) ? (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM core.tax_docs t JOIN core.documents d ON d.id = t.document_id WHERE t.id = $1 AND t.wm_client_id = $2', [tid, id])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  await db().query('UPDATE core.tax_docs SET first_viewed_at = coalesce(first_viewed_at, now()), downloads = downloads + 1 WHERE id = $1', [tid])
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title, seconds: 300, inline: true }))
})
