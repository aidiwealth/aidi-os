// Start a card top-up. The wallet is credited only once the payment is confirmed (webhook, or the Paystack return check).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('wallet_topup', user.userId, 15, 60 * 60 * 1000)
  const b = z.object({ amount: z.coerce.number().positive().max(100000000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter an amount.')
  const org = (await currentOrg())!
  const w = await walletOf(org.id)
  const minor = Math.round(b.data.amount * 100)
  if (minor < (MIN_TOPUP[w.currency] ?? 1000)) throw apiError('below_minimum', 'The smallest top-up is ' + (w.currency === 'NGN' ? '₦' : '$') + ((MIN_TOPUP[w.currency] ?? 1000) / 100).toLocaleString('en-US') + '.')
  const provider = providersFor(w.currency)[0]
  if (!provider) throw apiError('unavailable', 'Card top-ups are not switched on yet. Contact support.', 503)
  const reference = 'wt_' + randomToken().replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
  await db().query('INSERT INTO wallet.topups (organization_id, amount_minor, currency, provider, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [org.id, minor, w.currency, provider, reference, user.userId])
  const url = await walletCheckout(provider, { minor, currency: w.currency, email: user.email, name: org.name + ' wallet top-up', reference, returnUrl: brands().finvry.url + '/wallet' })
  return { ok: true, url }
})
