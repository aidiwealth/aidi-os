// Add or edit an account. Only the last 4 digits of the account number are ever stored.
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(),
  entity_id: z.string().uuid(),
  bank_name: z.string().trim().min(1).max(120),
  account_name: z.string().trim().min(1).max(160),
  last4: z.string().regex(/^\d{4}$/).optional().or(z.literal('').transform(() => undefined)),
  currency: z.string().regex(/^[A-Z]{3}$/),
  kind: z.enum(['current', 'savings', 'money_market', 'brokerage', 'other']).default('current'),
  active: z.boolean().default(true)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the entity, bank, account name and currency. For the number, enter only the last 4 digits.')
  const d = b.data
  const vals = [d.entity_id, d.bank_name, d.account_name, d.last4 ?? null, d.currency, d.kind, d.active]
  const row = d.id
    ? await one<{ id: string }>('UPDATE banking.accounts SET entity_id=$2, bank_name=$3, account_name=$4, last4=$5, currency=$6, kind=$7, active=$8 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await one<{ id: string }>('INSERT INTO banking.accounts (entity_id, bank_name, account_name, last4, currency, kind, active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [...vals, user.userId])
  await audit({ event, actorUserId: user.userId, action: d.id ? 'banking.account_update' : 'banking.account_create', objectType: 'bank_account', objectId: row.id, entityId: d.entity_id, detail: { bank: d.bank_name, currency: d.currency } })
  return { ok: true, id: row.id }
})
