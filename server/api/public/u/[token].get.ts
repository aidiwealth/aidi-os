// An investor opens their personal update link: the update is shown and the open is recorded.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const r = await asPlatform(() => db().query<{ id: string; organization_id: string; update_id: string; email: string; title: string }>('SELECT s.id, s.organization_id, s.update_id, i.email, u.title FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id JOIN financials.updates u ON u.id = s.update_id WHERE s.token_hash = $1', [sha256(token)]))
  const s = r.rows[0]
  if (!s) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(s.organization_id)
  await db().query('UPDATE financials.update_sends SET opens = opens + 1, opened_at = coalesce(opened_at, now()) WHERE id = $1', [s.id])
  await logActivity(s.organization_id, s.email, 'update_opened', 'Opened ' + s.title, s.update_id)
  return publicUpdate(s.update_id, false)
})
