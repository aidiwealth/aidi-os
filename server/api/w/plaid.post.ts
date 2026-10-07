// Wealth client links their own bank (US, Plaid): start Link, or finish it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query<{ country: 'US' | 'NG' }>('SELECT country FROM wm.clients WHERE id = $1', [id])).rows[0]!
  if (!(await wmSettings())[c.country].plaid || !plaidOn()) throw apiError('off', 'Bank linking is not available for your account yet.', 400)
  const b = z.object({ public_token: z.string().min(10).max(300).optional(), institution: z.string().max(200).optional() }).parse(await readBody(event))
  if (!b.public_token) return { link_token: (await plaid<{ link_token: string }>('/link/token/create', { client_name: 'Aidi Wealth', user: { client_user_id: user.userId }, products: ['transactions'], country_codes: ['US'], language: 'en' })).link_token }
  const r = await plaid<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: b.public_token })
  const enc = encryptText(r.access_token)
  const row = await one<{ id: string }>('INSERT INTO banking.plaid_items (item_id, access_token_enc, institution, wm_client_id, created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (item_id) DO UPDATE SET access_token_enc = EXCLUDED.access_token_enc RETURNING id', [r.item_id, enc, b.institution ?? null, id, user.userId])
  await refreshItem(row.id, enc)
  return { ok: true }
})
