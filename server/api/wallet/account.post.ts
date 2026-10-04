// Create the company's dedicated bank account (Monnify). Banks require a BVN or NIN (11 digits).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('wallet_va', user.userId, 5, 60 * 60 * 1000)
  const b = z.object({ kyc: z.string().regex(/^\d{11}$/), type: z.enum(['bvn', 'nin']).default('bvn') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Enter your 11-digit BVN or NIN.')
  const s = await walletSettings()
  if (!monnifyOn(s)) throw apiError('unavailable', 'Dedicated accounts are not switched on.', 503)
  const org = (await currentOrg())!
  const have = (await db().query('SELECT 1 FROM wallet.virtual_accounts LIMIT 1')).rowCount
  if (have) return { ok: true }
  const reference = 'fv_' + org.id.replace(/-/g, '').slice(0, 20)
  const accounts = await monnifyReserve(s, { reference, name: org.name, email: user.email, ...(b.data.type === 'bvn' ? { bvn: b.data.kyc } : { nin: b.data.kyc }) })
  const a = accounts[0]!
  await db().query('INSERT INTO wallet.virtual_accounts (organization_id, account_reference, bank_name, account_number, account_name, accounts) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (organization_id) DO NOTHING', [org.id, reference, a.bankName, a.accountNumber, a.accountName, JSON.stringify(accounts)])
  await audit({ event, actorUserId: user.userId, action: 'wallet.virtual_account', objectType: 'organization', objectId: org.id })
  return { ok: true }
})
