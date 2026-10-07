// Wealth client: add or remove a family member, and create the view-only family link.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  const b = await readBody<{ action: string; name?: string; relationship?: string; email?: string; member_id?: string }>(event)
  if (b.action === 'add' && b.name?.trim()) await db().query('INSERT INTO wm.members (client_id, name, relationship, email) VALUES ($1,$2,$3,$4)', [id, b.name.trim().slice(0, 200), b.relationship?.slice(0, 60) || null, b.email?.trim().toLowerCase().slice(0, 254) || null])
  else if (b.action === 'remove' && b.member_id) await db().query('DELETE FROM wm.members WHERE id = $1 AND client_id = $2', [b.member_id, id])
  else if (b.action === 'link') { await db().query('UPDATE wm.view_links SET revoked = true WHERE client_id = $1', [id]); const tok = newToken(); await db().query('INSERT INTO wm.view_links (client_id, token_hash) VALUES ($1,$2)', [id, sha256(tok)]); return { ok: true, url: brands().aidi.url + '/wv/' + tok } }
  else if (b.action === 'revoke') await db().query('UPDATE wm.view_links SET revoked = true WHERE client_id = $1', [id])
  return { ok: true }
})
