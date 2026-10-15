// Sign from the private link. When the last signer signs, the signed PDF is made and the cap table updates.
export default defineEventHandler(async (event) => {
  rateLimit('equity_sign_ip', clientIp(event), 30, 60 * 60 * 1000)
  const s = await signerByToken(String(getRouterParam(event, 'token') ?? ''))
  if (!s) throw apiError('not_found', 'This link is not valid.', 404)
  if (s.signed_at) return { ok: true, already: true }
  const b = SignBody.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Type your full name, add your signature and tick the box to agree.')
  const png = checkSignaturePng(b.data.png, true)
  setOrgContext(s.organization_id)
  const st = (await db().query<{ status: string }>('SELECT status FROM equity.esign_docs WHERE id = $1', [s.doc_id])).rows[0]?.status
  if (st !== 'sent') throw apiError('closed', st === 'void' ? 'This document was withdrawn by the company.' : 'This document is already complete.', 409)
  await db().query('UPDATE equity.esign_signers SET signed_at = now(), signature_kind = $2, signature_png = $3, name = $4, ip = $5, user_agent = $6 WHERE id = $1 AND signed_at IS NULL',
    [s.id, b.data.kind, png, b.data.name, clientIp(event).slice(0, 100), String(getHeader(event, 'user-agent') ?? '').slice(0, 400)])
  await finishIfDone(s.doc_id)
  const done = (await db().query<{ status: string }>('SELECT status FROM equity.esign_docs WHERE id = $1', [s.doc_id])).rows[0]?.status === 'signed'
  return { ok: true, complete: done }
})
