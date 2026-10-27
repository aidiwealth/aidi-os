// Staff: a client's identity check (steps, documents with what the AI read, activity), uploading on their behalf, and
// the decisions: accept, ask for another, ask for a document, mark verified, fail, reopen.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  if (getMethod(event) === 'GET') return identityView(id, true)
  if ((getRequestHeader(event, 'content-type') ?? '').includes('multipart')) { await identityUpload(id, (await readMultipartFormData(event)) ?? [], 'staff'); await audit({ event, actorUserId: user.userId, action: 'wm.kyc_doc', objectType: 'wm_client', objectId: id }); return identityView(id, true) }
  const b = await readBody<{ action?: string; item_id?: string; note?: string; kind?: string }>(event)
  if (!user.roles.some((r) => r === 'admin' || r === 'gp')) throw apiError('forbidden', 'Only admins and partners can decide identity checks.', 403)
  await identityAct(id, user.userId, { action: String(b?.action ?? ''), item_id: b?.item_id, note: b?.note, kind: b?.kind })
  await audit({ event, actorUserId: user.userId, action: 'wm.kyc_' + String(b?.action ?? ''), objectType: 'wm_client', objectId: id, detail: { note: b?.note || undefined } })
  return identityView(id, true)
})
