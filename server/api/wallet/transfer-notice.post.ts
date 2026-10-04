// "I've sent a transfer": tells the Finvry team to look out for it and credit the wallet.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('wallet_notice', user.userId, 5, 60 * 60 * 1000)
  const b = z.object({ amount: z.coerce.number().positive(), sent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter the amount and date of your transfer.')
  const org = (await currentOrg())!
  const w = await walletOf(org.id)
  const to = (await billingSettings()).issuer_email
  const sym = w.currency === 'NGN' ? '₦' : '$'
  if (to) { setOrgContext(null); await sendWalletNotice(to, 'Transfer on its way: ' + org.name, 'Transfer to confirm', org.name + ' (reference ' + org.slug + ') says they sent ' + sym + b.data.amount.toLocaleString('en-US') + ' on ' + b.data.sent_on + '.' + (b.data.note ? ' Note: ' + b.data.note : '') + ' Credit their wallet in Finance once it arrives.', 'Open Finance', brands().aidi.url + '/platform/finance').catch((e) => console.error('[wallet] notice failed', e)) }
  await audit({ event, actorUserId: user.userId, action: 'wallet.transfer_notice', objectType: 'organization', objectId: org.id, detail: b.data })
  return { ok: true }
})
