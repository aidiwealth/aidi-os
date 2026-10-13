// Add, edit or remove a property (admins).
import { z } from 'zod'
const s = (n: number) => z.string().trim().max(n).optional().nullable().transform((v) => v || null)
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), name: z.string().trim().min(1).max(160).optional(), address: s(500), kind: z.enum(['house', 'adu', 'apartment', 'condo', 'other']).default('house'), ownership: z.enum(['owned', 'leased']).default('owned'),
    bedrooms: z.coerce.number().int().min(0).max(50).optional().nullable(), acquired_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)), image_url: s(1000), notes: s(4000), entity_id: z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
    units: z.array(z.object({ name: z.string().trim().min(1).max(160), rental_model: z.enum(['room', 'entire']), source: z.enum(['airbnb', 'direct', 'other']), airbnb: s(500) })).max(20).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the property details.')
  const d = b.data
  if (d.delete && d.id) { await db().query('UPDATE rentals.properties SET active = false WHERE id = $1', [d.id]); await audit({ event, actorUserId: user.userId, action: 'rentals.property_removed', objectType: 'rental_property', objectId: d.id }); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Give the property a name.')
  const ent = d.entity_id ?? (await havenEntityId())
  const id = d.id
    ? (await db().query<{ id: string }>('UPDATE rentals.properties SET name=$2, address=$3, kind=$4, ownership=$5, bedrooms=$6, acquired_on=$7, image_url=$8, notes=$9, entity_id=$10 WHERE id=$1 RETURNING id', [d.id, d.name, d.address, d.kind, d.ownership, d.bedrooms ?? null, d.acquired_on ?? null, d.image_url, d.notes, ent])).rows[0]?.id
    : (await one<{ id: string }>('INSERT INTO rentals.properties (name, address, kind, ownership, bedrooms, acquired_on, image_url, notes, entity_id, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,(SELECT coalesce(max(sort), 0) + 1 FROM rentals.properties)) RETURNING id', [d.name, d.address, d.kind, d.ownership, d.bedrooms ?? null, d.acquired_on ?? null, d.image_url, d.notes, ent])).id
  if (!id) throw apiError('not_found', 'Property not found', 404)
  for (const [i, u] of (d.units ?? []).entries()) {
    const lid = u.airbnb?.match(/rooms\/(\d{5,25})/)?.[1] ?? (u.airbnb && /^\d{5,25}$/.test(u.airbnb) ? u.airbnb : null)
    await db().query('INSERT INTO rentals.units (property_id, name, rental_model, source, airbnb_listing_id, aliases, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, u.name, u.rental_model, u.source, lid, [u.name], i + 1])
  }
  await audit({ event, actorUserId: user.userId, action: d.id ? 'rentals.property_updated' : 'rentals.property_added', objectType: 'rental_property', objectId: id })
  return { ok: true, id }
})
