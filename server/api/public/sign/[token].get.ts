// A document to sign, from the signer's private link: the text, who is signing and who has signed.
export default defineEventHandler(async (event) => {
  const s = await signerByToken(String(getRouterParam(event, 'token') ?? ''))
  if (!s) throw apiError('not_found', 'This link is not valid. It may have been replaced by a newer one; check your email.', 404)
  setOrgContext(s.organization_id)
  const d = (await db().query<{ title: string; body: string; extra: { title: string; md: string }[]; status: string; kind: string; document_id: string | null }>('SELECT title, body, extra, status, kind, document_id FROM equity.esign_docs WHERE id = $1', [s.doc_id])).rows[0]
  if (!d) throw apiError('not_found', 'This link is not valid.', 404)
  if (!s.signed_at) await db().query('UPDATE equity.esign_signers SET viewed_at = coalesce(viewed_at, now()) WHERE id = $1', [s.id])
  const all = (await db().query<{ name: string; role: string; title: string | null; signed_at: string | null }>('SELECT name, role, title, signed_at FROM equity.esign_signers WHERE doc_id = $1 ORDER BY sort', [s.doc_id])).rows
  return { company: (await currentOrg())?.name ?? '', title: d.title, kind: d.kind, status: d.status, docs: [{ title: d.title, md: d.body }, ...d.extra], me: { name: s.name, email: s.email, role: s.role, title: s.title, signed_at: s.signed_at }, signers: all, workspace: await publicWorkspace() }
})
