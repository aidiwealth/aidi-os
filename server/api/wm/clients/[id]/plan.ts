// Staff: a client's financial profile, documents and AI financial plan.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('SELECT 1 FROM wm.clients WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)

  const body = getMethod(event) === 'GET' ? null : (getRequestHeader(event, 'content-type') ?? '').includes('multipart') ? null : await readBody<Record<string, unknown>>(event)
  if (getMethod(event) === 'GET') return planGet(id)
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart')) return { ok: true, uploaded: await planUpload(id, (await readMultipartFormData(event)) ?? []) }
  const a = String(body?.action ?? '')
  if (a === 'save') { try { await planSave(id, body?.profile ?? {}) } catch { throw apiError('invalid', 'Check the figures (amounts must be numbers).') } return { ok: true } }
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
  if (a === 'remove_doc' && typeof body?.doc_id === 'string') { await db().query('DELETE FROM wm.profile_docs WHERE id = $1 AND client_id = $2', [body.doc_id, id]); return { ok: true } }
  throw apiError('invalid', 'Unknown action.')
})
