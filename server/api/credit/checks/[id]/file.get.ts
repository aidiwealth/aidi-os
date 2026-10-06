// Open the bureau report kept with a credit check.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  const d = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM credit.checks c JOIN core.documents d ON d.id = c.document_id WHERE c.id = $1', [id])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'No report on file.', 404)
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title.replace('Credit report — ', ''), seconds: 300, inline: true }))
})
