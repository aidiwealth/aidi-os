// Add, edit or remove a room/unit and its Airbnb listing (link or id, iCal link, the names Airbnb uses) (admins).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), property_id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160).optional(), rental_model: z.enum(['room', 'entire']).default('entire'), source: z.enum(['airbnb', 'direct', 'other']).default('airbnb'),
    aliases: z.array(z.string().trim().min(1).max(200)).max(10).default([]), airbnb: z.string().trim().max(500).optional().nullable(), ical_url: z.string().trim().max(1000).optional().nullable(),
    rating: z.coerce.number().min(0).max(5).optional().nullable(), review_count: z.coerce.number().int().min(0).optional().nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the unit details.')
  const d = b.data
  if (d.delete && d.id) { await db().query('UPDATE rentals.units SET active = false WHERE id = $1', [d.id]); return { ok: true } }
  if (!d.name) throw apiError('invalid', 'Give the unit a name.')
  if (d.ical_url && !/^https:\/\//.test(d.ical_url)) throw apiError('invalid', 'The calendar link should start with https:// (Airbnb → Calendar → Availability → Connect calendars → Export).')
  const lid = d.airbnb?.match(/rooms\/(\d{5,25})/)?.[1] ?? (d.airbnb && /^\d{5,25}$/.test(d.airbnb) ? d.airbnb : null)
  const aliases = [...new Set(d.aliases)]
  try {
    if (d.id) await db().query('UPDATE rentals.units SET name=$2, rental_model=$3, source=$4, aliases=$5, airbnb_listing_id=$6, ical_url=$7, rating=coalesce($8, rating), review_count=coalesce($9, review_count) WHERE id=$1', [d.id, d.name, d.rental_model, d.source, aliases, lid, d.ical_url || null, d.rating ?? null, d.review_count ?? null])
    else { if (!d.property_id) throw apiError('invalid', 'Choose the property.'); await db().query('INSERT INTO rentals.units (property_id, name, rental_model, source, aliases, airbnb_listing_id, ical_url, rating, review_count, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,(SELECT coalesce(max(sort), 0) + 1 FROM rentals.units WHERE property_id = $1))', [d.property_id, d.name, d.rental_model, d.source, aliases, lid, d.ical_url || null, d.rating ?? null, d.review_count ?? null]) }
  } catch (e) { if ((e as { code?: string }).code === '23505') throw apiError('duplicate', 'That Airbnb listing is already on another unit.', 409); throw e }
  // Rows imported before the unit was linked: link them now.
  const units = await allUnits()
  for (const r of (await db().query<{ id: string; listing: string }>('SELECT id, listing FROM rentals.transactions WHERE unit_id IS NULL AND listing IS NOT NULL')).rows) { const u = matchUnit(units, r.listing); if (u) await db().query('UPDATE rentals.transactions SET unit_id = $2 WHERE id = $1', [r.id, u.id]) }
  await audit({ event, actorUserId: user.userId, action: 'rentals.unit_saved', objectType: 'rental_unit', objectId: d.id })
  return { ok: true }
})
