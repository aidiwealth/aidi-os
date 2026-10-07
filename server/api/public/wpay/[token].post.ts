// Pay a wealth fee online (Stripe for USD, Paystack for NGN), or confirm a Paystack payment on return.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? ''), id = wmFeeFromToken(token)
  const b = z.object({ ref: z.string().max(120).optional() }).safeParse(await readBody(event))
  if (!id || !b.success) throw apiError('invalid_link', 'This link is not valid.', 404)
  const f = (await asPlatform(() => db().query<{ organization_id: string; number: string | null; kind: string; amount: string; currency: string; status: string; email: string | null; client: string | null; pay_ref: string | null }>("SELECT f.organization_id, f.number, f.kind, f.amount::text, f.currency, f.status, c.email, c.name AS client, f.pay_ref FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id WHERE f.id = $1", [id]))).rows[0]
  if (!f) throw apiError('invalid_link', 'This link is not valid.', 404)
  setOrgContext(f.organization_id)
  if (b.data.ref) { if (f.status !== 'paid' && f.pay_ref === b.data.ref && f.currency !== 'USD' && (await paystackStatus(b.data.ref)) === 'success') await markFeePaid(id, 'paystack'); return { ok: true } }
  if (f.status === 'paid') throw apiError('state', 'This invoice is already paid.', 409)
  const provider = f.currency === 'USD' ? 'stripe' : 'paystack'
  if (!(provider === 'stripe' ? stripeOn() : paystackOn())) throw apiError('unavailable', 'Online payment is not available for this invoice.')
  const reference = 'wm_' + id.replace(/-/g, '').slice(0, 12) + '_' + Date.now().toString(36)
  await db().query('UPDATE wm.fees SET pay_ref = $2 WHERE id = $1', [id, reference])
  return { url: await providerCheckout(provider, { amount: f.amount, currency: f.currency, email: f.email ?? 'billing@theaidigroup.com', name: (f.kind === 'subscription' ? 'Aidi Wealth subscription' : 'Aidi Wealth') + (f.number ? ' · ' + f.number : ''), reference, returnUrl: brands().aidi.url + '/wpay/' + token }) }
})
