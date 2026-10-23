// Start connecting a bank (a short-lived Plaid Link token for this person), or reconnect one that needs the person to
// sign in to their bank again (update mode, with the connection's id). New connections ask for two years of history
// and send their notices (webhooks) to this site.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const org = (await currentOrg())!
  if ((await nigerianBanking(null)) && !(await monoOn())) throw apiError('bank_region', 'Bank connections for Nigerian banks are not available yet.', 403)
  const b = z.object({ item: z.string().uuid().optional() }).safeParse((await readBody(event).catch(() => ({}))) ?? {})
  const webhook = getRequestURL(event).origin + '/api/public/webhooks/plaid'
  const base = { client_name: org.kind === 'company' ? 'Finvry' : 'Aidi', user: { client_user_id: user.userId }, country_codes: ['US'], language: 'en', webhook }
  if (b.success && b.data.item) {
    const it = (await db().query<{ access_token_enc: string }>('SELECT access_token_enc FROM banking.plaid_items WHERE id = $1', [b.data.item])).rows[0]
    if (!it) throw apiError('not_found', 'Not found', 404)
    const r = await plaid<{ link_token: string }>('/link/token/create', { ...base, access_token: decryptText(it.access_token_enc) })
    return { link_token: r.link_token, update: true }
  }
  const r = await plaid<{ link_token: string }>('/link/token/create', { ...base, products: ['transactions'], transactions: { days_requested: 730 } })
  return { link_token: r.link_token }
})
