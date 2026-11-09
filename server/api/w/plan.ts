// Wealth client: their own financial profile, documents and AI financial plan.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)

  const body = getMethod(event) === 'GET' ? null : (getRequestHeader(event, 'content-type') ?? '').includes('multipart') ? null : await readBody<Record<string, unknown>>(event)
  if (getMethod(event) === 'GET') return planGet(id)
  if (getMethod(event) !== 'GET') await rateLimit('wm_plan_client', user.userId, 60, 60 * 60 * 1000)
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart')) { await rateLimit('wm_plan_upload', user.userId, 20, 60 * 60 * 1000); const n = await planUpload(id, (await readMultipartFormData(event)) ?? []); if (n) wmAlert(id, 'uploaded ' + n + ' document' + (n === 1 ? '' : 's') + ' for their plan'); return { ok: true, uploaded: n } }
  const a = String(body?.action ?? '')
  if (a === 'save') { try { await planSave(id, body?.profile ?? {}) } catch { throw apiError('invalid', 'Check the figures (amounts must be numbers).') } return { ok: true } }
  if (a === 'generate') { await rateLimit('wm_plan_generate', user.userId, 6, 60 * 60 * 1000) }
  if (a === 'generate') { try { return { ok: true, report: await planGenerate(id, user.userId) } } catch (err) { console.error('[wm-plan] generate failed', err); throw apiError('ai_failed', 'Could not prepare the review just now. Please try again in a minute.', 502) } }
  if (a === 'share') return { ok: true, url: await planShare(id, true) }
  if (a === 'unshare') { await planShare(id, false); return { ok: true } }
  // Read the documents with AI (identity numbers removed first) and show what was found; nothing is added until confirmed.
  if (a === 'read_docs') {
    await rateLimit('wm_docread', id, 20, 60 * 60 * 1000)
    const ids = Array.isArray(body?.doc_ids) ? (body!.doc_ids as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)) : undefined
    try { const r = await readClientDocs(id, ids); return { ok: true, read: r.read, skipped: r.skipped, found: r.out, checks: docChecks(r.out) } } catch (err) { console.error('[wm-docread] read failed', err); throw apiError('ai_failed', 'Could not read the documents just now. Please try again in a minute.') }
  }
  if (a === 'apply_read') { try { return { ok: true, ...(await applyDocRead(id, body?.take)) } } catch { throw apiError('invalid', 'Could not add those figures. Check the amounts.') } }
  if (a === 'remove_doc' && typeof body?.doc_id === 'string') { await profileDocRemove(id, body.doc_id); return { ok: true } }
  throw apiError('invalid', 'Unknown action.')
})
