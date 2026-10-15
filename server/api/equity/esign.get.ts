// Documents sent for signature on a cap table, with each signer's progress (never their links).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const ct = await capTableId(getQuery(event).ct)
  const docs = (await db().query<{ id: string; kind: string; title: string; status: string; record: unknown; applied_id: string | null; consent_id: string | null; consent_outside: boolean; document_id: string | null; created_at: string; completed_at: string | null }>(
    "SELECT id, kind, title, status, record, applied_id, consent_id, consent_outside, document_id, created_at, completed_at FROM equity.esign_docs WHERE captable_id = $1 AND status <> 'void' OR (captable_id = $1 AND voided_at > now() - interval '7 days') ORDER BY created_at DESC LIMIT 200", [ct])).rows
  const signers = docs.length ? (await db().query('SELECT id, doc_id, role, name, email, title, sent_at, viewed_at, signed_at FROM equity.esign_signers WHERE doc_id = ANY($1::uuid[]) ORDER BY sort', [docs.map((d) => d.id)])).rows : []
  const me = (await db().query<{ name: string | null; email: string }>('SELECT p.full_name AS name, u.email FROM core.users u LEFT JOIN core.people p ON p.id = u.person_id WHERE u.id = $1', [user.userId])).rows[0]
  return { me: { name: me?.name ?? '', email: me?.email ?? '' }, docs: docs.map((d) => ({ ...d, signers: signers.filter((s) => s.doc_id === d.id) })) }
})
