// Wealth client: their identity check, step by step, and uploading a document for it.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client', 'admin')
  const q = String(getQuery(event).client ?? '')
  const id = user.roles.includes('admin') && /^[0-9a-f-]{36}$/.test(q) ? q : await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'GET') return identityView(id, false)
  if (q) throw apiError('preview', 'Preview only.', 400)
  await rateLimit('wm_identity', user.userId, 20, 60 * 60 * 1000)
  await identityUpload(id, (await readMultipartFormData(event)) ?? [], 'client')
  return identityView(id, false)
})
