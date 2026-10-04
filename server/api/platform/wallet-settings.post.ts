// Wallet settings: Monnify (dedicated accounts) on or off, its keys, and the default bank details shown when it is off.
import { z } from 'zod'
const bank = z.object({ bank: z.string().trim().max(120).default(''), account_number: z.string().trim().max(40).default(''), account_name: z.string().trim().max(200).default(''), routing: z.string().trim().max(40).optional(), swift: z.string().trim().max(20).optional() })
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  if (staff.staffRole !== 'owner') throw apiError('forbidden', 'Only the platform owner can change wallet settings.', 403)
  const b = z.object({ monnify_enabled: z.boolean(), monnify_env: z.enum(['sandbox', 'live']), monnify_api_key: z.string().trim().max(200).default(''), monnify_secret_key: z.string().trim().max(200).default(''), monnify_contract_code: z.string().trim().max(60).default(''), bank_ngn: bank, bank_usd: bank }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the fields.')
  const cur = await walletSettings(), d = b.data
  const next = { ...d, monnify_secret_key: d.monnify_secret_key && !d.monnify_secret_key.startsWith('••') ? d.monnify_secret_key : cur.monnify_secret_key ?? '' }
  if (next.monnify_enabled && (!next.monnify_api_key || !next.monnify_secret_key || !next.monnify_contract_code)) throw apiError('invalid', 'Add the Monnify API key, secret key and contract code before switching it on.')
  await asPlatform(() => db().query("INSERT INTO platform.settings (key, value, updated_by, updated_at) VALUES ('wallet', $1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()", [JSON.stringify(next), staff.userId]))
  await platformAudit(event, staff.userId, 'wallet_settings', null, { monnify: next.monnify_enabled, env: next.monnify_env })
  return { ok: true }
})
