// Desk: show the full SSN once (recorded in the audit log).
export default defineEventHandler(async (event) => {
  const user = await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const r = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ ssn_enc: string | null }>('SELECT ssn_enc FROM services.intakes WHERE id = $1', [id])).rows[0] : undefined
  if (!r?.ssn_enc) throw apiError('not_found', 'No SSN on file.', 404)
  await audit({ event, actorUserId: user.userId, action: 'services.ssn_reveal', objectType: 'intake', objectId: id })
  const s = decryptText(r.ssn_enc)
  return { ssn: s.slice(0, 3) + '-' + s.slice(3, 5) + '-' + s.slice(5) }
})
