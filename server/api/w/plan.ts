// Wealth client: their own financial profile, documents and AI financial plan.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)

  const body = getMethod(event) === 'GET' ? null : (getRequestHeader(event, 'content-type') ?? '').includes('multipart') ? null : await readBody<Record<string, unknown>>(event)
  if (getMethod(event) === 'GET') return planGet(id)
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart')) return { ok: true, uploaded: await planUpload(id, (await readMultipartFormData(event)) ?? []) }
  const a = String(body?.action ?? '')
  if (a === 'save') { try { await planSave(id, body?.profile ?? {}) } catch { throw apiError('invalid', 'Check the figures (amounts must be numbers).') } return { ok: true } }
  if (a === 'generate') { try { return { ok: true, report: await planGenerate(id, user.userId) } } catch (err) { console.error('[wm-plan] generate failed', err); throw apiError('ai_failed', 'Could not prepare the review just now. Please try again in a minute.', 502) } }
  if (a === 'share') return { ok: true, url: await planShare(id, true) }
  if (a === 'unshare') { await planShare(id, false); return { ok: true } }
  if (a === 'remove_doc' && typeof body?.doc_id === 'string') { await db().query('DELETE FROM wm.profile_docs WHERE id = $1 AND client_id = $2', [body.doc_id, id]); return { ok: true } }
  throw apiError('invalid', 'Unknown action.')
})
