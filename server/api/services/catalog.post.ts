// Add or edit a priced service. IRS filing is 'quoted': priced per client on the invoice.
import { z } from 'zod'
const Body = z.object({
  id: z.string().uuid().optional(), code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional(),
  billing: z.enum(['one_time', 'annual', 'monthly', 'quoted']), price: z.union([z.coerce.number().min(0).max(1e9), z.literal('').transform(() => null), z.null()]).optional(),
  currency: z.enum(['USD', 'NGN']).default('USD'), formation: z.boolean().default(false), active: z.boolean().default(true), sort: z.coerce.number().int().min(0).max(999).default(10)
})
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the code (lower-case letters, numbers, underscores), name and price.')
  const d = b.data, vals = [d.code, d.name, d.description || null, d.billing, d.price ?? null, d.currency, d.formation, d.active, d.sort]
  const r = d.id
    ? await db().query<{ id: string }>('UPDATE services.catalog SET code=$2, name=$3, description=$4, billing=$5, price=$6, currency=$7, formation=$8, active=$9, sort=$10 WHERE id=$1 RETURNING id', [d.id, ...vals])
    : await db().query<{ id: string }>('INSERT INTO services.catalog (code, name, description, billing, price, currency, formation, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id', vals)
  await audit({ event, actorUserId: user.userId, action: 'services.catalog_save', objectType: 'catalog', objectId: r.rows[0]?.id, detail: { code: d.code, price: d.price ?? null } })
  return { ok: true }
})
