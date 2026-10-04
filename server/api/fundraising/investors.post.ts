// Add or update an investor in the round.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), round_id: z.string().uuid(), name: z.string().trim().min(1).max(200), firm: z.string().trim().max(200).default(''), email: z.string().trim().max(254).default(''),
    stage: z.enum(['contacted', 'meeting', 'diligence', 'committed', 'signed', 'wired', 'passed']), amount: z.union([z.coerce.number().min(0), z.literal('').transform(() => null), z.null()]).optional(), notes: z.string().max(2000).default('') }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Add the investor name and stage.')
  const d = b.data, args = [d.name, d.firm || null, d.email || null, d.stage, d.amount ?? null, d.notes || null]
  if (d.id) await db().query('UPDATE fundraise.round_investors SET name = $2, firm = $3, email = $4, stage = $5, amount = $6, notes = $7, updated_at = now() WHERE id = $1', [d.id, ...args])
  else await db().query('INSERT INTO fundraise.round_investors (round_id, name, firm, email, stage, amount, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)', [d.round_id, ...args])
  return { ok: true }
})
