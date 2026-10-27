// Wealth client: add, update or remove an account they hold elsewhere (Robinhood, Schwab…), tracked for their plan.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  await rateLimit('wm_accounts', user.userId, 60, 60 * 60 * 1000)
  const b = await readBody<Record<string, unknown>>(event)
  const accountId = typeof b?.account_id === 'string' && /^[0-9a-f-]{36}$/.test(b.account_id) ? b.account_id : null
  if (b?.delete && accountId) { await db().query("DELETE FROM wm.accounts WHERE id = $1 AND client_id = $2 AND provider = 'manual'", [accountId, id]); return { ok: true } }
  const v = z.object({ institution: z.string().trim().min(1).max(120), kind: z.enum(['brokerage', 'retirement', 'crypto', 'savings', 'bank', 'other']), name: z.string().trim().max(120).default(''), currency: z.enum(['USD', 'NGN']).default('USD'), balance: z.coerce.number().min(0).max(1e12), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().slice(0, 10)) }).safeParse(b)
  if (!v.success) throw apiError('invalid', 'Add where it is held and its value.')
  const d = v.data
  if (accountId) await db().query("UPDATE wm.accounts SET institution = $3, kind = $4, name = $5, currency = $6, balance = $7, as_of = $8 WHERE id = $1 AND client_id = $2 AND provider = 'manual'", [accountId, id, d.institution, d.kind, d.name || null, d.currency, d.balance, d.as_of])
  else await db().query("INSERT INTO wm.accounts (client_id, provider, institution, kind, name, currency, balance, as_of) VALUES ($1,'manual',$2,$3,$4,$5,$6,$7)", [id, d.institution, d.kind, d.name || null, d.currency, d.balance, d.as_of])
  wmAlert(id, (accountId ? 'updated ' : 'added ') + d.institution + ' in their accounts')
  return { ok: true }
})
