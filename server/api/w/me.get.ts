// Wealth client portal: the signed-in client's own household only.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client', 'admin')
  const q = String(getQuery(event).client ?? '')
  const id = user.roles.includes('admin') && /^[0-9a-f-]{36}$/.test(q) ? q : await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Your wealth account is not set up yet. Contact Aidi Wealth.', 404)
  const c = (await db().query("SELECT id, name, kind, country, model, status, kyc_status, contact_name, email FROM wm.clients WHERE id = $1", [id])).rows[0]
  const cfg = await wmSettings(), cc = cfg[(c.country as 'US' | 'NG')]
  return { client: c, summary: await clientSummary(id), members: (await db().query('SELECT id, name, relationship, email FROM wm.members WHERE client_id = $1', [id])).rows,
    views: (await db().query('SELECT name, email, viewed_at FROM wm.views WHERE client_id = $1 ORDER BY viewed_at DESC LIMIT 30', [id])).rows,
    features: { plaid: cc.plaid && plaidOn(), savings: cc.savings, trading: c.country === 'US' ? cc.alpaca : cc.busha, wallet: c.country === 'NG' ? cc.anchor : cc.alpaca, savings_rate: cc.savings_rate } }
})
