// One-click unsubscribe from a company's investor updates.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const s = (await asPlatform(() => db().query<{ organization_id: string; email: string; company: string }>('SELECT s.organization_id, i.email, o.name AS company FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id JOIN core.organizations o ON o.id = s.organization_id WHERE s.token_hash = $1', [sha256(token)]))).rows[0]
  if (!s) throw apiError('invalid_link', 'This link is not valid.', 404)
  await asPlatform(() => db().query('UPDATE crm.contacts SET subscribed = false WHERE organization_id = $1 AND email = $2', [s.organization_id, s.email]))
  return { ok: true, company: s.company, email: s.email }
})
