// An invite link: who it is for, so they can check their details before signing in.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const r = await asPlatform(() => db().query<{ id: string; organization_id: string; name: string; email: string; phone: string | null; address: string | null; client: string; expired: boolean }>(
    'SELECT p.id, p.organization_id, p.name, p.email, p.phone, p.address, c.name AS client, (p.invite_expires < now()) AS expired FROM services.people p JOIN services.clients c ON c.id = p.client_id WHERE p.invite_token_hash = $1', [sha256(token)]))
  const p = r.rows[0]
  if (!p) throw apiError('invalid_link', 'This link is not valid. It may have been used already: sign in with your email instead.', 404)
  if (p.expired) throw apiError('expired', 'This invite has expired. Sign in with your email, or ask us for a new invite.', 410)
  setOrgContext(p.organization_id)
  return { name: p.name, email: p.email, phone: p.phone, address: p.address, client: p.client, workspace: await publicWorkspace() }
})
